import type { SupabaseClient } from "@supabase/supabase-js";
import { database } from "../../lib/local-db/database";
import { supabase } from "../../lib/supabase/client";
import {
  cacheEntity,
  localProfileId,
  networkWithCache,
  queueCreate,
  queueUpdate,
  readEntityList
} from "../sync/localSync";
import { addItineraryItem } from "../trips/api";
import type { CreateItineraryInput, ItineraryItem } from "../trips/types";
import { addActivityMoment, listActivityMoments } from "../activity-moments/api";
import { addCabStop, addJourneyBooking } from "../workspace/api";
import type {
  PlanningItem,
  PlanningItemInput,
  PlanningPromotionContext,
  PlanningPromotionType,
  UpdatePlanningItemInput
} from "./types";

function client(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not connected.");
  return supabase;
}

const planningItemEntityType = (planningEventId: string) => `planning-items:${planningEventId}`;

function planningLocation(input: Pick<PlanningItemInput, "location" | "mapUrl">) {
  const location = input.location?.trim();
  const mapUrl = input.mapUrl?.trim();
  if (!location && !mapUrl) return null;
  return {
    ...(location ? { label: location, address: location } : {}),
    ...(mapUrl ? { map_url: mapUrl } : {})
  };
}

function planningMigrationError(error: { code?: string; message?: string }) {
  if (error.code === "42P01" || error.message?.includes("planning_items"))
    return new Error("Apply the Planning items database migration, then reload this trip.");
  return error;
}

async function pendingPlanningEventCreate(planningEventId: string) {
  if (navigator.onLine) return undefined;
  return (
    await database.outbox
      .where("entityId")
      .equals(planningEventId)
      .filter(
        (operation) =>
          operation.operation === "create" &&
          (operation.payload as { table?: string } | undefined)?.table === "itinerary_items"
      )
      .first()
  )?.operationId;
}

async function pendingItineraryCreate(itineraryItemId: string) {
  if (navigator.onLine) return undefined;
  return (
    await database.outbox
      .where("entityId")
      .equals(itineraryItemId)
      .filter(
        (operation) =>
          operation.operation === "create" &&
          (operation.payload as { table?: string } | undefined)?.table === "itinerary_items"
      )
      .first()
  )?.operationId;
}

async function latestPlanningItemMutation(itemId: string) {
  if (navigator.onLine) return undefined;
  return (
    await database.outbox
      .where("entityId")
      .equals(itemId)
      .filter(
        (operation) =>
          ["create", "update"].includes(operation.operation) &&
          (operation.payload as { table?: string } | undefined)?.table === "planning_items"
      )
      .toArray()
  )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1)?.operationId;
}

export async function listPlanningItems(planningEventId: string): Promise<PlanningItem[]> {
  try {
    const rows = await networkWithCache(planningItemEntityType(planningEventId), async () => {
      const { data, error } = await client()
        .from("planning_items")
        .select("*")
        .eq("planning_event_id", planningEventId)
        .is("deleted_at", null)
        .order("item_order")
        .order("id");
      if (error) throw error;
      return (data ?? []) as PlanningItem[];
    });
    return rows
      .filter((item) => !item.deleted_at)
      .sort((left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id));
  } catch (error) {
    throw planningMigrationError(error as { code?: string; message?: string });
  }
}

export async function addPlanningItem(input: PlanningItemInput): Promise<PlanningItem> {
  const existing = await readEntityList<PlanningItem>(
    planningItemEntityType(input.planningEventId)
  );
  const now = new Date().toISOString();
  const item: PlanningItem = {
    id: crypto.randomUUID(),
    planning_event_id: input.planningEventId,
    item_order:
      input.itemOrder ??
      Math.max(
        0,
        ...existing.filter((candidate) => !candidate.deleted_at).map((row) => row.item_order)
      ) + 100,
    kind: input.kind,
    title: input.title.trim(),
    location: planningLocation(input),
    starts_at: input.startsAt || null,
    duration_minutes: input.durationMinutes ?? null,
    timezone: input.timezone,
    notes: input.notes?.trim() || null,
    linked_itinerary_item_id: null,
    promoted_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null
  };
  if (!item.title) throw new Error("Name this planning item.");
  if (item.duration_minutes !== null && item.duration_minutes <= 0)
    throw new Error("Duration must be greater than zero.");
  if (!navigator.onLine) {
    const parent = await pendingPlanningEventCreate(input.planningEventId);
    await queueCreate({
      entityType: planningItemEntityType(input.planningEventId),
      table: "planning_items",
      row: item,
      dependsOn: parent ? [parent] : []
    });
    return item;
  }
  const { data, error } = await client().from("planning_items").insert(item).select("*").single();
  if (error) throw planningMigrationError(error);
  await cacheEntity(planningItemEntityType(input.planningEventId), data as PlanningItem);
  return data as PlanningItem;
}

export async function updatePlanningItem(input: UpdatePlanningItemInput): Promise<PlanningItem> {
  const entityType = planningItemEntityType(input.planningEventId);
  const existing = (await readEntityList<PlanningItem>(entityType)).find(
    (candidate) => candidate.id === input.id
  );
  if (!existing) throw new Error("Refresh this plan before editing the item.");
  const patch = {
    kind: input.kind,
    title: input.title.trim(),
    location: planningLocation(input),
    starts_at: input.startsAt || null,
    duration_minutes: input.durationMinutes ?? null,
    timezone: input.timezone,
    notes: input.notes?.trim() || null
  };
  if (!patch.title) throw new Error("Name this planning item.");
  if (patch.duration_minutes !== null && patch.duration_minutes <= 0)
    throw new Error("Duration must be greater than zero.");
  if (!navigator.onLine) {
    const dependency = await latestPlanningItemMutation(input.id);
    const updated: PlanningItem = {
      ...existing,
      ...patch,
      version: (existing.version ?? 1) + 1,
      updated_at: new Date().toISOString()
    };
    await queueUpdate({
      entityType,
      table: "planning_items",
      row: updated,
      patch,
      baseVersion: existing.version,
      dependsOn: dependency ? [dependency] : []
    });
    return updated;
  }
  let request = client().from("planning_items").update(patch).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw planningMigrationError(error);
  if (!data) throw new Error("This planning item changed on another device. Refresh and retry.");
  await cacheEntity(entityType, data as PlanningItem);
  return data as PlanningItem;
}

export async function archivePlanningItem(item: PlanningItem) {
  const entityType = planningItemEntityType(item.planning_event_id);
  const deletedAt = new Date().toISOString();
  if (!navigator.onLine) {
    const dependency = await latestPlanningItemMutation(item.id);
    const archived = {
      ...item,
      deleted_at: deletedAt,
      version: (item.version ?? 1) + 1,
      updated_at: deletedAt
    };
    await queueUpdate({
      entityType,
      table: "planning_items",
      row: archived,
      patch: { deleted_at: deletedAt },
      baseVersion: item.version,
      dependsOn: dependency ? [dependency] : []
    });
    return;
  }
  let request = client().from("planning_items").update({ deleted_at: deletedAt }).eq("id", item.id);
  if (item.version !== undefined) request = request.eq("version", item.version);
  const { data, error } = await request.select("id").maybeSingle();
  if (error) throw planningMigrationError(error);
  if (!data) throw new Error("This planning item changed on another device. Refresh and retry.");
  const profileId = await localProfileId();
  if (profileId) await database.entities.delete([profileId, entityType, item.id]);
}

async function setPlanningItemOrder(item: PlanningItem, order: number) {
  const entityType = planningItemEntityType(item.planning_event_id);
  if (!navigator.onLine) {
    const dependency = await latestPlanningItemMutation(item.id);
    const updated = { ...item, item_order: order, updated_at: new Date().toISOString() };
    await queueUpdate({
      entityType,
      table: "planning_items",
      row: updated,
      patch: { item_order: order },
      dependsOn: dependency ? [dependency] : []
    });
    return;
  }
  const { error } = await client()
    .from("planning_items")
    .update({ item_order: order })
    .eq("id", item.id);
  if (error) throw planningMigrationError(error);
}

export async function reorderPlanningItems(
  items: PlanningItem[],
  itemId: string,
  direction: "up" | "down"
) {
  const ordered = [...items].sort(
    (left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id)
  );
  const from = ordered.findIndex((item) => item.id === itemId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ordered.length) return ordered;
  const moving = ordered[from];
  const adjacent = ordered[to];
  const temporary = Math.max(...ordered.map((item) => item.item_order), 0) + 1000;
  await setPlanningItemOrder(moving, temporary);
  await setPlanningItemOrder(adjacent, moving.item_order);
  await setPlanningItemOrder(moving, adjacent.item_order);
  if (navigator.onLine) return listPlanningItems(moving.planning_event_id);
  const swapped = ordered.map((item) =>
    item.id === moving.id
      ? { ...item, item_order: adjacent.item_order }
      : item.id === adjacent.id
        ? { ...item, item_order: moving.item_order }
        : item
  );
  await Promise.all(
    swapped.map((item) => cacheEntity(planningItemEntityType(item.planning_event_id), item))
  );
  return swapped.sort((left, right) => left.item_order - right.item_order);
}

async function linkPlanningItem(item: PlanningItem, itineraryItemId: string | null) {
  const entityType = planningItemEntityType(item.planning_event_id);
  const patch = {
    linked_itinerary_item_id: itineraryItemId,
    promoted_at: itineraryItemId ? new Date().toISOString() : null
  };
  if (!navigator.onLine) {
    const dependencies = [
      await latestPlanningItemMutation(item.id),
      itineraryItemId ? await pendingItineraryCreate(itineraryItemId) : undefined
    ].filter((dependency): dependency is string => Boolean(dependency));
    const updated = {
      ...item,
      ...patch,
      version: (item.version ?? 1) + 1,
      updated_at: new Date().toISOString()
    };
    await queueUpdate({
      entityType,
      table: "planning_items",
      row: updated,
      patch,
      baseVersion: item.version,
      dependsOn: [...new Set(dependencies)]
    });
    return updated;
  }
  let request = client().from("planning_items").update(patch).eq("id", item.id);
  if (item.version !== undefined) request = request.eq("version", item.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw planningMigrationError(error);
  if (!data) throw new Error("The event was created, but its Planning link needs to be retried.");
  await cacheEntity(entityType, data as PlanningItem);
  return data as PlanningItem;
}

function dateInTimeZone(value: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function planningItemEventInput(
  context: PlanningPromotionContext,
  item: PlanningItem,
  eventType: PlanningPromotionType
): CreateItineraryInput {
  const startsAt = item.starts_at ?? context.planningEvent.starts_at;
  const explicitTime = Boolean(item.starts_at);
  const endsAt = item.duration_minutes
    ? new Date(Date.parse(startsAt) + item.duration_minutes * 60_000).toISOString()
    : undefined;
  return {
    tripId: context.tripId,
    eventType,
    title: item.title,
    startsAt,
    endsAt,
    timezone: item.timezone,
    location: item.location?.label,
    mapUrl: item.location?.map_url,
    notes: item.notes ?? undefined,
    participantScope: context.planningEvent.applies_to_all_travelers ? "everyone" : "selected",
    travelerIds: context.travelerIds,
    timingMode: explicitTime ? "exact" : "date_only",
    scheduledDate: dateInTimeZone(startsAt, item.timezone),
    hasExplicitStartTime: explicitTime,
    durationMinutes: item.duration_minutes ?? undefined,
    eventStatus: "planned",
    sortKey: `${startsAt}:planning:${String(item.item_order).padStart(8, "0")}:${item.id}`
  };
}

export async function promotePlanningItem(
  context: PlanningPromotionContext,
  item: PlanningItem,
  eventType: PlanningPromotionType
): Promise<ItineraryItem> {
  if (item.linked_itinerary_item_id) throw new Error("This planning item is already linked.");
  const input = planningItemEventInput(context, item, eventType);
  const cached = await readEntityList<ItineraryItem>(`itinerary:${context.tripId}`);
  let created = cached.find(
    (candidate) => !candidate.deleted_at && candidate.sort_key === input.sortKey
  );
  if (!created && navigator.onLine) {
    const { data, error } = await client()
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", context.tripId)
      .eq("sort_key", input.sortKey!)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    created = (data as ItineraryItem | null) ?? undefined;
  }
  created ??= await addItineraryItem(input);
  try {
    await linkPlanningItem(item, created.id);
  } catch (error) {
    throw new Error(
      `The ${eventType} event exists, but its Planning link needs to be retried. Retrying will reuse the same event. ${error instanceof Error ? error.message : ""}`.trim()
    );
  }
  return created;
}

export async function unlinkPlanningItem(item: PlanningItem) {
  return linkPlanningItem(item, null);
}

export function planningCabRouteInput(
  context: PlanningPromotionContext,
  selectedItems: PlanningItem[],
  eventTitle?: string
): Parameters<typeof addJourneyBooking>[0] {
  if (selectedItems.length < 2) throw new Error("Select at least two consecutive plan items.");
  const items = [...selectedItems].sort(
    (left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id)
  );
  const first = items[0];
  const last = items[items.length - 1];
  const departureAt = first.starts_at ?? context.planningEvent.starts_at;
  const arrivalAt = last.starts_at
    ? new Date(Date.parse(last.starts_at) + (last.duration_minutes ?? 0) * 60_000).toISOString()
    : undefined;
  return {
    tripId: context.tripId,
    title: eventTitle?.trim() || `Cab · ${first.title} → ${last.title}`,
    mode: "cab",
    reservationState: "planned",
    participantScope: context.planningEvent.applies_to_all_travelers ? "everyone" : "selected",
    travelerIds: context.travelerIds,
    bookingDetails: { source: "planning", planning_event_id: context.planningEvent.id },
    legs: [
      {
        originName: first.location?.label || first.title,
        originTimezone: first.timezone,
        destinationName: last.location?.label || last.title,
        destinationTimezone: last.timezone,
        departureAt,
        arrivalAt,
        details: {
          kind: "cab",
          ride_type: items.length > 2 ? "hourly" : "local",
          trip_shape: "one_way",
          final_dropoff: last.location?.label || last.title
        }
      }
    ],
    itineraryTiming: {
      startsAt: departureAt,
      endsAt: arrivalAt,
      timezone: first.timezone,
      timingMode: first.starts_at ? "exact" : "date_only",
      scheduledDate: dateInTimeZone(departureAt, first.timezone),
      hasExplicitStartTime: Boolean(first.starts_at),
      durationMinutes: arrivalAt
        ? Math.max(1, Math.round((Date.parse(arrivalAt) - Date.parse(departureAt)) / 60_000))
        : undefined
    }
  };
}

export function planningCabStopInputs(
  context: PlanningPromotionContext,
  journeyLegId: string,
  selectedItems: PlanningItem[]
): Parameters<typeof addCabStop>[0][] {
  return [...selectedItems]
    .sort((left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id))
    .map((item, index) => ({
      tripId: context.tripId,
      journeyLegId,
      stopOrder: (index + 1) * 100,
      title: item.title,
      location: item.location?.label,
      mapUrl: item.location?.map_url,
      arrivesAt: item.starts_at ?? undefined,
      departsAt:
        item.starts_at && item.duration_minutes
          ? new Date(Date.parse(item.starts_at) + item.duration_minutes * 60_000).toISOString()
          : undefined,
      timezone: item.timezone,
      notes: item.notes ?? undefined
    }));
}

export async function createCabRouteFromPlanning(
  context: PlanningPromotionContext,
  selectedItems: PlanningItem[],
  eventTitle?: string
) {
  const ordered = [...selectedItems].sort(
    (left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id)
  );
  const created = await addJourneyBooking(planningCabRouteInput(context, ordered, eventTitle));
  const warnings: string[] = [];
  for (const stop of planningCabStopInputs(context, created.legs[0].id, ordered)) {
    try {
      await addCabStop(stop);
    } catch {
      warnings.push(`${stop.title} still needs to be added as a cab stop.`);
    }
  }
  for (const item of ordered) {
    try {
      await linkPlanningItem(item, created.itinerary.id);
    } catch {
      warnings.push(`${item.title} still needs to be linked to the new cab event.`);
    }
  }
  return { ...created, warnings };
}

export function planningActivityInput(
  context: PlanningPromotionContext,
  selectedItems: PlanningItem[],
  eventTitle?: string
): CreateItineraryInput {
  if (selectedItems.length < 2) throw new Error("Select at least two consecutive plan items.");
  const items = [...selectedItems].sort(
    (left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id)
  );
  const first = items[0];
  const last = items.at(-1)!;
  const startsAt = first.starts_at ?? context.planningEvent.starts_at;
  const endsAt = last.starts_at
    ? new Date(Date.parse(last.starts_at) + (last.duration_minutes ?? 0) * 60_000).toISOString()
    : undefined;
  return {
    tripId: context.tripId,
    eventType: "activity",
    title: eventTitle?.trim() || `${first.title} + ${items.length - 1} more`,
    startsAt,
    endsAt,
    timezone: first.timezone,
    location: first.location?.label,
    participantScope: context.planningEvent.applies_to_all_travelers ? "everyone" : "selected",
    travelerIds: context.travelerIds,
    timingMode: first.starts_at ? "exact" : "date_only",
    scheduledDate: dateInTimeZone(startsAt, first.timezone),
    hasExplicitStartTime: Boolean(first.starts_at),
    durationMinutes: endsAt
      ? Math.max(1, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000))
      : undefined,
    eventStatus: "planned",
    sortKey: `${startsAt}:planning-activity:${first.id}:${last.id}`
  };
}

export async function createActivityFromPlanning(
  context: PlanningPromotionContext,
  selectedItems: PlanningItem[],
  eventTitle?: string
) {
  const ordered = [...selectedItems].sort(
    (left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id)
  );
  const input = planningActivityInput(context, ordered, eventTitle);
  const cached = await readEntityList<ItineraryItem>(`itinerary:${context.tripId}`);
  let activity = cached.find(
    (candidate) => !candidate.deleted_at && candidate.sort_key === input.sortKey
  );
  if (!activity && navigator.onLine) {
    const { data, error } = await client()
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", context.tripId)
      .eq("sort_key", input.sortKey!)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    activity = (data as ItineraryItem | null) ?? undefined;
  }
  activity ??= await addItineraryItem(input);

  const warnings: string[] = [];
  let existingMoments = [] as Awaited<ReturnType<typeof listActivityMoments>>;
  try {
    existingMoments = await listActivityMoments(activity.id);
  } catch {
    // Creation below reports a more useful per-item warning when the migration is missing.
  }
  for (const [index, item] of ordered.entries()) {
    if (!existingMoments.some((moment) => moment.source_planning_item_id === item.id)) {
      try {
        await addActivityMoment({
          tripId: context.tripId,
          itineraryItemId: activity.id,
          momentOrder: (index + 1) * 100,
          title: item.title,
          location: item.location?.label,
          mapUrl: item.location?.map_url,
          startsAt: item.starts_at ?? undefined,
          endsAt:
            item.starts_at && item.duration_minutes
              ? new Date(Date.parse(item.starts_at) + item.duration_minutes * 60_000).toISOString()
              : undefined,
          timezone: item.timezone,
          notes: item.notes ?? undefined,
          sourcePlanningItemId: item.id
        });
      } catch {
        warnings.push(`${item.title} still needs to be added as an activity Moment.`);
      }
    }
    try {
      await linkPlanningItem(item, activity.id);
    } catch {
      warnings.push(`${item.title} still needs to be linked to the new activity.`);
    }
  }
  return { itinerary: activity, warnings };
}
