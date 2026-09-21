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
import type { ActivityMoment, ActivityMomentInput, UpdateActivityMomentInput } from "./types";

function client(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not connected.");
  return supabase;
}

const activityMomentEntityType = (itineraryItemId: string) => `activity-moments:${itineraryItemId}`;

function momentLocation(input: Pick<ActivityMomentInput, "location" | "mapUrl">) {
  const location = input.location?.trim();
  const mapUrl = input.mapUrl?.trim();
  if (!location && !mapUrl) return null;
  return {
    ...(location ? { label: location, address: location } : {}),
    ...(mapUrl ? { map_url: mapUrl } : {})
  };
}

function activityMomentsMigrationError(error: { code?: string; message?: string }) {
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("activity_moments")
  )
    return new Error("Apply the Activity Moments database migration, then reload this trip.");
  return error;
}

async function pendingActivityCreate(itineraryItemId: string) {
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

async function latestMomentMutation(momentId: string) {
  if (navigator.onLine) return undefined;
  return (
    await database.outbox
      .where("entityId")
      .equals(momentId)
      .filter(
        (operation) =>
          ["create", "update"].includes(operation.operation) &&
          (operation.payload as { table?: string } | undefined)?.table === "activity_moments"
      )
      .toArray()
  )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1)?.operationId;
}

export async function listActivityMoments(itineraryItemId: string): Promise<ActivityMoment[]> {
  try {
    const rows = await networkWithCache(activityMomentEntityType(itineraryItemId), async () => {
      const { data, error } = await client()
        .from("activity_moments")
        .select("*")
        .eq("itinerary_item_id", itineraryItemId)
        .is("deleted_at", null)
        .order("moment_order")
        .order("id");
      if (error) throw error;
      return (data ?? []) as ActivityMoment[];
    });
    return rows
      .filter((moment) => !moment.deleted_at)
      .sort(
        (left, right) => left.moment_order - right.moment_order || left.id.localeCompare(right.id)
      );
  } catch (error) {
    throw activityMomentsMigrationError(error as { code?: string; message?: string });
  }
}

export async function addActivityMoment(input: ActivityMomentInput): Promise<ActivityMoment> {
  const entityType = activityMomentEntityType(input.itineraryItemId);
  const existing = await readEntityList<ActivityMoment>(entityType);
  const now = new Date().toISOString();
  const moment: ActivityMoment = {
    id: crypto.randomUUID(),
    itinerary_item_id: input.itineraryItemId,
    moment_order:
      input.momentOrder ??
      Math.max(
        0,
        ...existing.filter((candidate) => !candidate.deleted_at).map((row) => row.moment_order)
      ) + 100,
    title: input.title.trim(),
    location: momentLocation(input),
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    timezone: input.timezone,
    notes: input.notes?.trim() || null,
    source_planning_item_id: input.sourcePlanningItemId || null,
    created_at: now,
    updated_at: now,
    deleted_at: null
  };
  if (!moment.title) throw new Error("Name this Moment.");
  if (moment.starts_at && moment.ends_at && moment.ends_at < moment.starts_at)
    throw new Error("A Moment cannot end before it starts.");
  if (!navigator.onLine) {
    const parent = await pendingActivityCreate(input.itineraryItemId);
    await queueCreate({
      entityType,
      table: "activity_moments",
      row: moment,
      dependsOn: parent ? [parent] : []
    });
    return moment;
  }
  const { data, error } = await client()
    .from("activity_moments")
    .insert(moment)
    .select("*")
    .single();
  if (error) throw activityMomentsMigrationError(error);
  await cacheEntity(entityType, data as ActivityMoment);
  return data as ActivityMoment;
}

export async function updateActivityMoment(
  input: UpdateActivityMomentInput
): Promise<ActivityMoment> {
  const entityType = activityMomentEntityType(input.itineraryItemId);
  const existing = (await readEntityList<ActivityMoment>(entityType)).find(
    (candidate) => candidate.id === input.id
  );
  if (!existing) throw new Error("Refresh these Moments before editing this one.");
  const patch = {
    title: input.title.trim(),
    location: momentLocation(input),
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    timezone: input.timezone,
    notes: input.notes?.trim() || null
  };
  if (!patch.title) throw new Error("Name this Moment.");
  if (patch.starts_at && patch.ends_at && patch.ends_at < patch.starts_at)
    throw new Error("A Moment cannot end before it starts.");
  if (!navigator.onLine) {
    const dependency = await latestMomentMutation(input.id);
    const updated: ActivityMoment = {
      ...existing,
      ...patch,
      version: (existing.version ?? 1) + 1,
      updated_at: new Date().toISOString()
    };
    await queueUpdate({
      entityType,
      table: "activity_moments",
      row: updated,
      patch,
      baseVersion: existing.version,
      dependsOn: dependency ? [dependency] : []
    });
    return updated;
  }
  let request = client().from("activity_moments").update(patch).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw activityMomentsMigrationError(error);
  if (!data) throw new Error("This Moment changed on another device. Refresh and retry.");
  await cacheEntity(entityType, data as ActivityMoment);
  return data as ActivityMoment;
}

export async function archiveActivityMoment(moment: ActivityMoment) {
  const entityType = activityMomentEntityType(moment.itinerary_item_id);
  const deletedAt = new Date().toISOString();
  if (!navigator.onLine) {
    const dependency = await latestMomentMutation(moment.id);
    const archived = {
      ...moment,
      deleted_at: deletedAt,
      version: (moment.version ?? 1) + 1,
      updated_at: deletedAt
    };
    await queueUpdate({
      entityType,
      table: "activity_moments",
      row: archived,
      patch: { deleted_at: deletedAt },
      baseVersion: moment.version,
      dependsOn: dependency ? [dependency] : []
    });
    return;
  }
  let request = client()
    .from("activity_moments")
    .update({ deleted_at: deletedAt })
    .eq("id", moment.id);
  if (moment.version !== undefined) request = request.eq("version", moment.version);
  const { data, error } = await request.select("id").maybeSingle();
  if (error) throw activityMomentsMigrationError(error);
  if (!data) throw new Error("This Moment changed on another device. Refresh and retry.");
  const profileId = await localProfileId();
  if (profileId) await database.entities.delete([profileId, entityType, moment.id]);
}

async function setMomentOrder(moment: ActivityMoment, order: number, afterOperation?: string) {
  const entityType = activityMomentEntityType(moment.itinerary_item_id);
  if (!navigator.onLine) {
    const dependency = await latestMomentMutation(moment.id);
    const current =
      (await readEntityList<ActivityMoment>(entityType)).find((row) => row.id === moment.id) ??
      moment;
    const updated = {
      ...current,
      moment_order: order,
      version: (current.version ?? 1) + 1,
      updated_at: new Date().toISOString()
    };
    return queueUpdate({
      entityType,
      table: "activity_moments",
      row: updated,
      patch: { moment_order: order },
      baseVersion: current.version,
      dependsOn: [
        ...new Set([dependency, afterOperation].filter((id): id is string => Boolean(id)))
      ]
    });
  }
  const { error } = await client()
    .from("activity_moments")
    .update({ moment_order: order })
    .eq("id", moment.id);
  if (error) throw activityMomentsMigrationError(error);
}

export async function reorderActivityMoments(
  moments: ActivityMoment[],
  momentId: string,
  direction: "up" | "down"
) {
  const ordered = [...moments].sort(
    (left, right) => left.moment_order - right.moment_order || left.id.localeCompare(right.id)
  );
  const from = ordered.findIndex((moment) => moment.id === momentId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ordered.length) return ordered;
  const moving = ordered[from];
  const adjacent = ordered[to];
  if (navigator.onLine) {
    const { error } = await client().rpc("reorder_agenda_items", {
      requested_table: "activity_moments",
      requested_parent_id: moving.itinerary_item_id,
      first_item_id: moving.id,
      second_item_id: adjacent.id,
      first_version: moving.version ?? null,
      second_version: adjacent.version ?? null
    });
    if (error) {
      if (error.code === "PGRST202")
        throw new Error("Apply the latest agenda database migration before reordering.");
      throw error;
    }
    return listActivityMoments(moving.itinerary_item_id);
  }
  const temporary = Math.max(...ordered.map((moment) => moment.moment_order), 0) + 1000;
  const first = await setMomentOrder(moving, temporary);
  const second = await setMomentOrder(adjacent, moving.moment_order, first);
  await setMomentOrder(moving, adjacent.moment_order, second);
  // Keep the incremented versions from each queued write, so subsequent edits
  // use the version that will exist after the ordered mutations reach the server.
  return listActivityMoments(moving.itinerary_item_id);
}
