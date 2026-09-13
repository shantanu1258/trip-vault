import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase/client";
import { cacheEntity, localProfileId, networkWithCache, queueCreate, queueDelete, queueUpdate, readEntityList } from "../sync/localSync";
import type {
  CreateCostInput,
  CreateItineraryInput,
  UpdateItineraryInput,
  CreateTripInput,
  AlertState,
  ItineraryItem,
  Reminder,
  Trip,
  TripCost,
  ArchivedTripItem,
  EventStatus,
  TripDocument,
  TripStatus
  , UpdateCostInput, UpdateTripInput
} from "./types";
import { moveEqualTimeItem } from "./presentation";

const itinerarySelect = "id,trip_id,booking_id,title,event_type,starts_at,ends_at,timezone,location,notes,applies_to_all_travelers,is_all_day,completed_at,timing_mode,scheduled_date,anchor_itinerary_item_id,relative_position,event_status,sort_key,version,created_at,updated_at,deleted_at";
const costSelect = "id,trip_id,booking_id,itinerary_item_id,title,category,amount_minor,currency_code,payment_status,paid_by_traveler_id,notes,version,created_at,updated_at,deleted_at,trip_cost_participants(traveler_id,share_amount_minor)";

type CostResponse = TripCost & { trip_cost_participants?: Array<{ traveler_id: string; share_amount_minor: number | null }> };

function normalizeCost(raw: CostResponse): TripCost {
  const { trip_cost_participants, ...cost } = raw;
  return { ...cost, participants: trip_cost_participants ?? cost.participants ?? [] };
}

function client(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not connected. Add the project URL and publishable key, then restart the app.");
  return supabase;
}

async function currentUserId() {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Your sign-in has expired. Please sign in again.");
  return profileId;
}

function statusForDates(startDate: string, endDate: string): TripStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (endDate < today) return "completed";
  if (startDate <= today) return "active";
  return "upcoming";
}

function localDateForInstant(value: string, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function listTrips(includeArchived = false): Promise<Trip[]> {
  const trips = await networkWithCache("trips", async () => {
    let query = client().from("trips").select("id,title,destination_summary,start_date,end_date,primary_timezone,base_currency,status,version,created_at,updated_at,deleted_at").is("deleted_at", null);
    if (!includeArchived) query = query.neq("status", "archived");
    const { data, error } = await query.order("start_date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Trip[];
  });
  return includeArchived ? trips : trips.filter((trip) => trip.status !== "archived");
}

export async function listDeletedTrips(): Promise<Trip[]> {
  if (!navigator.onLine) return [];
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await client().from("trips")
    .select("id,title,destination_summary,start_date,end_date,primary_timezone,base_currency,status,version,created_at,updated_at,deleted_at")
    .not("deleted_at", "is", null).gte("deleted_at", cutoff).order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Trip[];
}

export async function getTrip(tripId: string): Promise<Trip> {
  if (!navigator.onLine) {
    const cached = (await readEntityList<Trip>("trips")).find((trip) => trip.id === tripId);
    if (cached) return cached;
  }
  const { data, error } = await client()
    .from("trips")
    .select("id,title,destination_summary,start_date,end_date,primary_timezone,base_currency,status,version,created_at,updated_at,deleted_at")
    .eq("id", tripId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const userId = await currentUserId();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const trip: Trip = { id, title: input.title, destination_summary: input.destination, start_date: input.startDate, end_date: input.endDate, primary_timezone: input.timezone, base_currency: input.baseCurrency, status: statusForDates(input.startDate, input.endDate), created_at: now, updated_at: now };
  const row = { ...trip, created_by: userId };
  if (!navigator.onLine) { await queueCreate({ entityType: "trips", table: "trips", row }); return trip; }
  // Do not request the inserted row in this call. The trip's SELECT policy is
  // membership-based, and its owner membership is created by an AFTER INSERT
  // trigger. Asking PostgREST for a representation makes PostgreSQL evaluate
  // the SELECT policy before that membership can authorize the returned row.
  const { error } = await client()
    .from("trips")
    .insert({
      id,
      title: input.title,
      destination_summary: input.destination,
      start_date: input.startDate,
      end_date: input.endDate,
      primary_timezone: input.timezone,
      base_currency: input.baseCurrency,
      status: statusForDates(input.startDate, input.endDate),
      created_by: userId
    });
  if (error) throw error;
  const created = { ...trip, version: 1, deleted_at: null };
  await cacheEntity("trips", created);
  return created;
}

export async function updateTrip(input: UpdateTripInput): Promise<Trip> {
  const existing = await getTrip(input.id);
  const outside = (await readEntityList<ItineraryItem>(`itinerary:${input.id}`)).find((item) => {
    if (item.deleted_at || item.timing_mode === "unscheduled") return false;
    const startDate = item.scheduled_date ?? localDateForInstant(item.starts_at, item.timezone);
    const endDate = item.ends_at ? localDateForInstant(item.ends_at, item.timezone) : startDate;
    return startDate < input.startDate || startDate > input.endDate || endDate < input.startDate || endDate > input.endDate;
  });
  if (outside) throw new Error(`Move or archive “${outside.title}” before shortening the trip dates.`);
  const patch = {
    title: input.title,
    destination_summary: input.destination,
    start_date: input.startDate,
    end_date: input.endDate,
    primary_timezone: input.timezone,
    base_currency: input.baseCurrency,
    status: input.status
  };
  if (!navigator.onLine) {
    const updated: Trip = { ...existing, ...patch, version: (existing.version ?? 1) + 1, updated_at: new Date().toISOString() };
    await queueUpdate({ entityType: "trips", table: "trips", row: updated, patch, baseVersion: existing.version });
    return updated;
  }
  let request = client().from("trips").update(patch).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select("id,title,destination_summary,start_date,end_date,primary_timezone,base_currency,status,version,created_at,updated_at,deleted_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This trip changed on another device. Refresh it before saving again.");
  await cacheEntity("trips", data as Trip);
  return data as Trip;
}

export async function archiveTrip(trip: Trip) {
  return updateTrip({ id: trip.id, title: trip.title, destination: trip.destination_summary, startDate: trip.start_date, endDate: trip.end_date, timezone: trip.primary_timezone, baseCurrency: trip.base_currency, status: "archived", version: trip.version });
}

export async function restoreTrip(trip: Trip) {
  return updateTrip({ id: trip.id, title: trip.title, destination: trip.destination_summary, startDate: trip.start_date, endDate: trip.end_date, timezone: trip.primary_timezone, baseCurrency: trip.base_currency, status: statusForDates(trip.start_date, trip.end_date), version: trip.version });
}

export async function deleteTripRecoverably(trip: Trip) {
  if (!navigator.onLine) throw new Error("Moving a trip to Recently deleted requires a connection.");
  const { data, error } = await client().from("trips").update({ deleted_at: new Date().toISOString() }).eq("id", trip.id).eq("version", trip.version ?? 1)
    .select("id,title,destination_summary,start_date,end_date,primary_timezone,base_currency,status,version,created_at,updated_at,deleted_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This trip changed on another device. Refresh before deleting it.");
  return data as Trip;
}

export async function restoreDeletedTrip(trip: Trip) {
  if (!navigator.onLine) throw new Error("Restoring a deleted trip requires a connection.");
  const deletedAt = trip.deleted_at ? new Date(trip.deleted_at).getTime() : 0;
  if (!deletedAt || deletedAt < Date.now() - 30 * 86_400_000) throw new Error("This trip is outside the 30-day recovery window.");
  const { data, error } = await client().from("trips").update({ deleted_at: null }).eq("id", trip.id).eq("version", trip.version ?? 1)
    .select("id,title,destination_summary,start_date,end_date,primary_timezone,base_currency,status,version,created_at,updated_at,deleted_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This trip changed on another device. Refresh before restoring it.");
  await cacheEntity("trips", data as Trip);
  return data as Trip;
}

export async function deleteTripPermanently(trip: Trip) {
  if (!navigator.onLine) throw new Error("Permanent deletion requires a connection.");
  const profileId = await currentUserId();
  const { data: membership, error: membershipError } = await client().from("trip_members").select("role").eq("trip_id", trip.id).eq("user_id", profileId).maybeSingle();
  if (membershipError) throw membershipError;
  if (membership?.role !== "owner") throw new Error("Only the trip owner can permanently delete this trip.");
  const { data: versions, error: versionError } = await client().from("document_versions")
    .select("id,storage_bucket,storage_path,source_upload_id,documents!inner(trip_id)")
    .eq("documents.trip_id", trip.id);
  if (versionError) throw versionError;
  const legacyPaths = (versions ?? [])
    .filter((version) => !version.storage_bucket || version.storage_bucket === "trip-documents")
    .map((version) => String(version.storage_path));
  const ownedInboxVersions = (versions ?? []).filter((version) =>
    version.storage_bucket === "account-documents"
      && String(version.storage_path).startsWith(`${profileId}/`)
  );
  const ownedInboxPaths = ownedInboxVersions.map((version) => String(version.storage_path));
  for (const [bucket, paths] of [["trip-documents", legacyPaths], ["account-documents", ownedInboxPaths]] as const) {
    if (!paths.length) continue;
    const { error: storageError } = await client().storage.from(bucket).remove(paths);
    if (storageError) throw new Error(`The trip was not deleted because its stored documents could not be removed: ${storageError.message}`);
  }
  const { error } = await client().rpc("delete_trip_permanently", { requested_trip_id: trip.id });
  if (error) throw error;
  const ownedUploadIds = ownedInboxVersions.flatMap((version) => version.source_upload_id ? [String(version.source_upload_id)] : []);
  if (ownedUploadIds.length) {
    const { error: uploadRowsError } = await client().from("account_document_uploads").delete().in("id", ownedUploadIds).is("associated_document_id", null);
    if (uploadRowsError) throw uploadRowsError;
  }
  const { database } = await import("../../lib/local-db/database");
  const pendingUploads = await database.outbox.where("profileId").equals(profileId).filter((operation) => {
    if (operation.operation !== "upload_document") return false;
    const payload = operation.payload as { document?: { trip_id?: string } };
    return payload.document?.trip_id === trip.id;
  }).toArray();
  const pendingAssociations = await database.outbox.where("profileId").equals(profileId).filter((operation) => {
    if (operation.operation !== "associate_account_document") return false;
    const payload = operation.payload as { rpc?: { requested_trip_id?: string } };
    return payload.rpc?.requested_trip_id === trip.id;
  }).toArray();
  const pendingAssociationDocumentIds = new Set(pendingAssociations.map((operation) => operation.entityId));
  const versionIds = [...new Set([
    ...(versions ?? []).map((version) => String(version.id)),
    ...pendingUploads.map((operation) => String((operation.payload as { version: { id: string } }).version.id))
  ])];
  const { removeOfflineFile } = await import("../../lib/storage/offlineFiles");
  await Promise.all(versionIds.map((versionId) => removeOfflineFile(profileId, versionId)));
  await database.transaction("rw", [database.entities, database.localDocuments, database.localFileBlobs, database.outbox, database.offlineManifests], async () => {
    await database.entities.where("profileId").equals(profileId).filter((row) => {
      const data = row.data as { id?: string; trip_id?: string };
      return data.trip_id === trip.id || pendingAssociationDocumentIds.has(row.id) || (row.entityType === "trips" && data.id === trip.id) || row.entityType.endsWith(`:${trip.id}`);
    }).delete();
    await database.outbox.where("profileId").equals(profileId).filter((row) => pendingAssociationDocumentIds.has(row.entityId) || row.entityType.endsWith(`:${trip.id}`) || row.entityId === trip.id).delete();
    await database.offlineManifests.delete([profileId, trip.id]);
    for (const versionId of versionIds) {
      await database.localDocuments.delete([profileId, versionId]);
      await database.localFileBlobs.delete([profileId, versionId]);
    }
  });
}

export async function getSavedTripFocus(): Promise<string | null> {
  const userId = await currentUserId();
  if (navigator.onLine) {
    const { data, error } = await client().from("user_trip_focus").select("trip_id").eq("user_id", userId).maybeSingle();
    if (!error && data?.trip_id) return String(data.trip_id);
  }
  const { database } = await import("../../lib/local-db/database");
  return (await database.settings.get(`focus:${userId}`))?.value ?? null;
}

export async function saveTripFocus(tripId: string) {
  const userId = await currentUserId();
  const { database } = await import("../../lib/local-db/database");
  const updatedAt = new Date().toISOString();
  await database.settings.put({ key: `focus:${userId}`, value: tripId, updatedAt });
  if (navigator.onLine) {
    const { error } = await client().from("user_trip_focus").upsert({ user_id: userId, trip_id: tripId, source: "manual", updated_at: updatedAt });
    if (error) throw error;
  } else await queueCreate({ entityType: "trip-focus", table: "user_trip_focus", row: { id: userId, user_id: userId, trip_id: tripId, source: "manual", updated_at: updatedAt }, serverRow: { user_id: userId, trip_id: tripId, source: "manual", updated_at: updatedAt } });
}

export async function listItinerary(tripId: string): Promise<ItineraryItem[]> {
  return networkWithCache(`itinerary:${tripId}`, async () => { const { data, error } = await client()
    .from("itinerary_items")
    .select(itinerarySelect)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true })
    .order("sort_key", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ItineraryItem[]; });
}

export async function addItineraryItem(input: CreateItineraryInput): Promise<ItineraryItem> {
  const userId = await currentUserId();
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const appliesToAll = !input.travelerIds?.length;
  const location = input.location || input.mapUrl ? { label: input.location || undefined, address: input.location || undefined, map_url: input.mapUrl || undefined } : null;
  const item: ItineraryItem = { id, trip_id: input.tripId, booking_id: input.bookingId || null, title: input.title, event_type: input.eventType ?? "custom", starts_at: input.startsAt, ends_at: input.endsAt || null, timezone: input.timezone, location, notes: input.notes || null, applies_to_all_travelers: appliesToAll, is_all_day: Boolean(input.isAllDay), completed_at: input.completedAt ?? null, timing_mode: input.timingMode ?? (input.isAllDay ? "all_day" : "exact"), scheduled_date: input.scheduledDate ?? null, anchor_itinerary_item_id: input.anchorItineraryItemId ?? null, relative_position: input.relativePosition ?? null, event_status: input.eventStatus ?? "planned", sort_key: input.sortKey ?? `${input.startsAt}:${id}`, created_at: now, updated_at: now };
  const row = { ...item, created_by: userId };
  if (!navigator.onLine) {
    const parentOperation = await queueCreate({ entityType: `itinerary:${input.tripId}`, table: "itinerary_items", row, dependsOn: input.dependsOn });
    for (const travelerId of input.travelerIds ?? []) await queueCreate({ entityType: `itinerary-participants:${input.tripId}`, table: "itinerary_participants", row: { id: `${id}:${travelerId}`, itinerary_item_id: id, traveler_id: travelerId }, serverRow: { itinerary_item_id: id, traveler_id: travelerId }, dependsOn: [parentOperation] });
    return item;
  }
  const { data, error } = await client()
    .from("itinerary_items")
    .insert({
      id, trip_id: input.tripId, booking_id: input.bookingId || null,
      title: input.title,
      event_type: input.eventType ?? "custom",
      starts_at: input.startsAt,
      ends_at: input.endsAt || null,
      timezone: input.timezone,
      location,
      notes: input.notes || null,
      applies_to_all_travelers: appliesToAll,
      is_all_day: Boolean(input.isAllDay),
      completed_at: input.completedAt ?? null,
      timing_mode: input.timingMode ?? (input.isAllDay ? "all_day" : "exact"),
      scheduled_date: input.scheduledDate ?? null,
      anchor_itinerary_item_id: input.anchorItineraryItemId ?? null,
      relative_position: input.relativePosition ?? null,
      event_status: input.eventStatus ?? "planned",
      sort_key: input.sortKey ?? `${input.startsAt}:${id}`,
      created_by: userId
    })
    .select(itinerarySelect)
    .single();
  if (error) throw error;
  if (input.travelerIds?.length) { const { error: participantsError } = await client().from("itinerary_participants").insert(input.travelerIds.map((travelerId) => ({ itinerary_item_id: id, traveler_id: travelerId }))); if (participantsError) throw participantsError; }
  await cacheEntity(`itinerary:${input.tripId}`, data as ItineraryItem);
  return data as ItineraryItem;
}

export async function updateItineraryItem(input: UpdateItineraryInput): Promise<ItineraryItem> {
  const existing = (await readEntityList<ItineraryItem>(`itinerary:${input.tripId}`)).find((item) => item.id === input.id);
  if (!existing) throw new Error("Refresh the itinerary before editing this item.");
  const appliesToAll = !input.travelerIds?.length;
  const patch = { booking_id: input.bookingId || null, title: input.title, event_type: input.eventType ?? existing.event_type ?? "custom", starts_at: input.startsAt, ends_at: input.endsAt || null, timezone: input.timezone, location: input.location || input.mapUrl ? { label: input.location || undefined, address: input.location || undefined, map_url: input.mapUrl || undefined } : null, notes: input.notes || null, applies_to_all_travelers: appliesToAll, is_all_day: Boolean(input.isAllDay), completed_at: input.completedAt ?? existing.completed_at ?? null, timing_mode: input.timingMode ?? existing.timing_mode ?? (input.isAllDay ? "all_day" : "exact"), scheduled_date: input.scheduledDate ?? null, anchor_itinerary_item_id: input.anchorItineraryItemId ?? null, relative_position: input.relativePosition ?? null, event_status: input.eventStatus ?? existing.event_status ?? "planned", sort_key: input.sortKey ?? existing.sort_key ?? `${input.startsAt}:${input.id}` };
  if (!navigator.onLine) {
    const updated = { ...existing, ...patch, version: (existing.version ?? 1) + 1, updated_at: new Date().toISOString() };
    const parent = await queueUpdate({ entityType: `itinerary:${input.tripId}`, table: "itinerary_items", row: updated, patch, baseVersion: existing.version });
    const profileId = await currentUserId();
    const { database } = await import("../../lib/local-db/database");
    const current = (await database.entities.where("profileId").equals(profileId).filter((row) => row.entityType === `itinerary-participants:${input.tripId}` && (row.data as { itinerary_item_id?: string }).itinerary_item_id === input.id).toArray()).map((row) => row.data as { traveler_id: string });
    const removals: string[] = [];
    for (const row of current.filter((row) => !(input.travelerIds ?? []).includes(row.traveler_id))) removals.push(await queueDelete({ entityType: `itinerary-participants:${input.tripId}`, table: "itinerary_participants", entityId: `${input.id}:${row.traveler_id}`, match: { itinerary_item_id: input.id, traveler_id: row.traveler_id }, hard: true, dependsOn: [parent] }));
    for (const travelerId of input.travelerIds ?? []) if (!current.some((row) => row.traveler_id === travelerId)) await queueCreate({ entityType: `itinerary-participants:${input.tripId}`, table: "itinerary_participants", row: { id: `${input.id}:${travelerId}`, itinerary_item_id: input.id, traveler_id: travelerId }, serverRow: { itinerary_item_id: input.id, traveler_id: travelerId }, dependsOn: [parent, ...removals] });
    return updated;
  }
  let request = client().from("itinerary_items").update(patch).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select(itinerarySelect).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This itinerary item changed on another device. Refresh before saving.");
  const { error: removeError } = await client().from("itinerary_participants").delete().eq("itinerary_item_id", input.id); if (removeError) throw removeError;
  if (input.travelerIds?.length) { const { error: participantError } = await client().from("itinerary_participants").insert(input.travelerIds.map((travelerId) => ({ itinerary_item_id: input.id, traveler_id: travelerId }))); if (participantError) throw participantError; }
  await cacheEntity(`itinerary:${input.tripId}`, data as ItineraryItem);
  return data as ItineraryItem;
}

export async function archiveItineraryItem(item: ItineraryItem) {
  if (!navigator.onLine) {
    const profileId = await currentUserId();
    const { database } = await import("../../lib/local-db/database");
    const group = item.booking_id
      ? (await readEntityList<ItineraryItem>(`itinerary:${item.trip_id}`)).filter((candidate) => candidate.booking_id === item.booking_id)
      : [item];
    if (item.booking_id) {
      const bookingDelete = await queueDelete({ entityType: `bookings:${item.trip_id}`, table: "bookings", entityId: item.booking_id });
      await database.entities.delete([profileId, `bookings:${item.trip_id}`, item.booking_id]);
      for (const candidate of group) {
        await database.entities.delete([profileId, `itinerary:${item.trip_id}`, candidate.id]);
        await queueDelete({ entityType: `itinerary:${item.trip_id}`, table: "itinerary_items", entityId: candidate.id, dependsOn: [bookingDelete] });
      }
    } else {
      await database.entities.delete([profileId, `itinerary:${item.trip_id}`, item.id]);
      await queueDelete({ entityType: `itinerary:${item.trip_id}`, table: "itinerary_items", entityId: item.id });
    }
    return;
  }
  const { error } = await client().rpc("archive_trip_item", { requested_itinerary_item_id: item.id }); if (error) throw error;
}

export async function restoreItineraryItem(itemId: string) {
  if (!navigator.onLine) throw new Error("Restoring an archived item requires a connection.");
  const { error } = await client().rpc("restore_trip_item", { requested_itinerary_item_id: itemId });
  if (error) throw error;
}

export async function listArchivedTripItems(tripId: string): Promise<ArchivedTripItem[]> {
  if (!navigator.onLine) return [];
  const [{ data: events, error: eventError }, { data: costs, error: costError }] = await Promise.all([
    client().from("itinerary_items").select("id,title,deleted_at,booking_id").eq("trip_id", tripId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    client().from("trip_costs").select("id,title,deleted_at").eq("trip_id", tripId).not("deleted_at", "is", null).order("deleted_at", { ascending: false })
  ]);
  if (eventError) throw eventError;
  if (costError) throw costError;
  const seenBookings = new Set<string>();
  const eventItems = (events ?? []).flatMap((event) => {
    const bookingId = event.booking_id ? String(event.booking_id) : null;
    if (bookingId && seenBookings.has(bookingId)) return [];
    if (bookingId) seenBookings.add(bookingId);
    return [{ id: String(event.id), kind: bookingId ? "booking" as const : "event" as const, title: String(event.title), archived_at: String(event.deleted_at) }];
  });
  return [...eventItems, ...(costs ?? []).map((cost) => ({ id: String(cost.id), kind: "cost" as const, title: String(cost.title), archived_at: String(cost.deleted_at) }))]
    .sort((left, right) => right.archived_at.localeCompare(left.archived_at));
}

export async function setItineraryItemStatus(item: ItineraryItem, status: EventStatus) {
  const completedAt = status === "done" ? new Date().toISOString() : null;
  const patch = { event_status: status, completed_at: completedAt };
  if (!navigator.onLine) {
    const updated = { ...item, ...patch, version: (item.version ?? 1) + 1, updated_at: new Date().toISOString() };
    await queueUpdate({ entityType: `itinerary:${item.trip_id}`, table: "itinerary_items", row: updated, patch, baseVersion: item.version });
    return updated;
  }
  const { data, error } = await client().from("itinerary_items").update(patch).eq("id", item.id).select(itinerarySelect).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This event changed on another device. Refresh before updating it.");
  await cacheEntity(`itinerary:${item.trip_id}`, data as ItineraryItem);
  return data as ItineraryItem;
}

export async function setItineraryItemCompleted(item: ItineraryItem, completed: boolean) {
  const completedAt = completed ? new Date().toISOString() : null;
  const patch = { completed_at: completedAt };
  if (!navigator.onLine) {
    const updated: ItineraryItem = { ...item, completed_at: completedAt, version: (item.version ?? 1) + 1, updated_at: new Date().toISOString() };
    await queueUpdate({ entityType: `itinerary:${item.trip_id}`, table: "itinerary_items", row: updated, patch, baseVersion: item.version });
    return updated;
  }
  let request = client().from("itinerary_items").update(patch).eq("id", item.id);
  if (item.version !== undefined) request = request.eq("version", item.version);
  const { data, error } = await request.select(itinerarySelect).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This preparation item changed on another device. Refresh before saving.");
  await cacheEntity(`itinerary:${item.trip_id}`, data as ItineraryItem);
  return data as ItineraryItem;
}

export async function reorderItineraryItems(items: ItineraryItem[], itemId: string, direction: "up" | "down") {
  const reordered = moveEqualTimeItem(items, itemId, direction);
  if (reordered === items) return items;
  const changed = reordered.filter((item, index) => item.sort_key !== items.find((existing) => existing.id === item.id)?.sort_key || item.id !== items[index]?.id);
  if (!navigator.onLine) {
    for (const item of changed) {
      const original = items.find((existing) => existing.id === item.id)!;
      await queueUpdate({ entityType: `itinerary:${item.trip_id}`, table: "itinerary_items", row: { ...item, version: (original.version ?? 1) + 1 }, patch: { sort_key: item.sort_key }, baseVersion: original.version });
    }
    return reordered;
  }
  const tripId = reordered[0]?.trip_id;
  if (!tripId) return reordered;
  const { error } = await client().rpc("reorder_itinerary_items", { requested_trip_id: tripId, requested_ids: reordered.map((item) => item.id) });
  if (error) throw error;
  return listItinerary(tripId);
}

export async function listCosts(tripId: string): Promise<TripCost[]> {
  return networkWithCache(`costs:${tripId}`, async () => { const { data, error } = await client()
    .from("trip_costs")
    .select(costSelect)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as CostResponse[]).map(normalizeCost); });
}

export async function addTripCost(input: CreateCostInput): Promise<TripCost> {
  const userId = await currentUserId();
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const participants = [...new Set(input.participantTravelerIds ?? [])].map((traveler_id) => ({ traveler_id, share_amount_minor: null }));
  const cost: TripCost = { id, trip_id: input.tripId, booking_id: input.bookingId || null, itinerary_item_id: input.itineraryItemId || null, title: input.title, category: input.category, amount_minor: input.amountMinor, currency_code: input.currencyCode, payment_status: input.paymentStatus, paid_by_traveler_id: input.paidByTravelerId || null, participants, notes: input.notes || null, created_at: now, updated_at: now };
  const row = { ...cost, participants: undefined, created_by: userId, paid_by: input.paymentStatus === "paid" ? userId : null };
  if (!navigator.onLine) { const parent = await queueCreate({ entityType: `costs:${input.tripId}`, table: "trip_costs", row, dependsOn: input.dependsOn }); for (const participant of participants) await queueCreate({ entityType: `cost-participants:${input.tripId}`, table: "trip_cost_participants", row: { id: `${id}:${participant.traveler_id}`, cost_id: id, ...participant }, serverRow: { cost_id: id, ...participant }, dependsOn: [parent] }); return cost; }
  const { data, error } = await client()
    .from("trip_costs")
    .insert({
      id, trip_id: input.tripId,
      booking_id: input.bookingId || null,
      itinerary_item_id: input.itineraryItemId || null,
      title: input.title,
      category: input.category,
      amount_minor: input.amountMinor,
      currency_code: input.currencyCode,
      payment_status: input.paymentStatus,
      paid_by_traveler_id: input.paidByTravelerId || null,
      notes: input.notes || null,
      created_by: userId,
      paid_by: input.paymentStatus === "paid" ? userId : null
    })
    .select(costSelect)
    .single();
  if (error) throw error;
  if (participants.length) { const { error: participantError } = await client().from("trip_cost_participants").insert(participants.map((participant) => ({ cost_id: id, ...participant }))); if (participantError) throw participantError; }
  const created = { ...normalizeCost(data as unknown as CostResponse), participants };
  await cacheEntity(`costs:${input.tripId}`, created);
  return created;
}

export async function updateTripCost(input: UpdateCostInput): Promise<TripCost> {
  const existing = (await readEntityList<TripCost>(`costs:${input.tripId}`)).find((cost) => cost.id === input.id);
  if (!existing) throw new Error("Refresh the cost list before editing this item.");
  const patch = { booking_id: input.bookingId || existing.booking_id || null, itinerary_item_id: input.itineraryItemId || existing.itinerary_item_id || null, title: input.title, category: input.category, amount_minor: input.amountMinor, currency_code: input.currencyCode, payment_status: input.paymentStatus, paid_by_traveler_id: input.paidByTravelerId || null, notes: input.notes || null };
  if (!navigator.onLine) {
    const participants = [...new Set(input.participantTravelerIds ?? [])].map((traveler_id) => ({ traveler_id, share_amount_minor: null }));
    const updated = { ...existing, ...patch, participants, version: (existing.version ?? 1) + 1, updated_at: new Date().toISOString() };
    const parent = await queueUpdate({ entityType: `costs:${input.tripId}`, table: "trip_costs", row: updated, patch, baseVersion: existing.version });
    const removals = await Promise.all((existing.participants ?? []).map((participant) => queueDelete({ entityType: `cost-participants:${input.tripId}`, table: "trip_cost_participants", entityId: `${input.id}:${participant.traveler_id}`, match: { cost_id: input.id, traveler_id: participant.traveler_id }, hard: true, dependsOn: [parent] })));
    for (const participant of participants) await queueCreate({ entityType: `cost-participants:${input.tripId}`, table: "trip_cost_participants", row: { id: `${input.id}:${participant.traveler_id}`, cost_id: input.id, ...participant }, serverRow: { cost_id: input.id, ...participant }, dependsOn: [parent, ...removals] });
    return updated;
  }
  let request = client().from("trip_costs").update(patch).eq("id", input.id); if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select(costSelect).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This cost changed on another device. Refresh before saving.");
  const { error: removeParticipantsError } = await client().from("trip_cost_participants").delete().eq("cost_id", input.id); if (removeParticipantsError) throw removeParticipantsError;
  const participants = [...new Set(input.participantTravelerIds ?? [])].map((traveler_id) => ({ traveler_id, share_amount_minor: null }));
  if (participants.length) { const { error: participantError } = await client().from("trip_cost_participants").insert(participants.map((participant) => ({ cost_id: input.id, ...participant }))); if (participantError) throw participantError; }
  const updated = { ...normalizeCost(data as unknown as CostResponse), participants };
  await cacheEntity(`costs:${input.tripId}`, updated); return updated;
}

export async function archiveTripCost(cost: TripCost) {
  if (!navigator.onLine) {
    const profileId = await currentUserId(); const { database } = await import("../../lib/local-db/database");
    await database.entities.delete([profileId, `costs:${cost.trip_id}`, cost.id]); await queueDelete({ entityType: `costs:${cost.trip_id}`, table: "trip_costs", entityId: cost.id }); return;
  }
  const { error } = await client().from("trip_costs").update({ deleted_at: new Date().toISOString() }).eq("id", cost.id); if (error) throw error;
}

export async function restoreTripCost(costId: string) {
  if (!navigator.onLine) throw new Error("Restoring an archived cost requires a connection.");
  const { error } = await client().from("trip_costs").update({ deleted_at: null }).eq("id", costId);
  if (error) throw error;
}

export async function listReminders(): Promise<Reminder[]> {
  return networkWithCache("reminders", async () => { const { data, error } = await client()
    .from("reminders")
    .select("id,trip_id,title,due_at,severity,completed_at")
    .is("completed_at", null)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Reminder[]; });
}

export async function listDocuments(): Promise<TripDocument[]> {
  const { data, error } = await client()
    .from("documents")
    .select("id,trip_id,title,category,purpose,short_label,visibility,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TripDocument[];
}

export async function listAlertStates(): Promise<AlertState[]> {
  const userId = await currentUserId();
  const rows = await networkWithCache("alert-states", async () => {
    const { data, error } = await client().from("alert_states").select("alert_key,read_at,dismissed_at,snoozed_until").eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row, id: row.alert_key })) as (AlertState & { id: string })[];
  });
  return rows;
}

export async function setAlertState(input: { alertKey: string; read?: boolean; dismissed?: boolean; snoozedUntil?: string | null }) {
  const userId = await currentUserId();
  const now = new Date().toISOString();
  const existing = (await readEntityList<AlertState & { id?: string }>("alert-states")).find((state) => state.alert_key === input.alertKey);
  const serverRow = {
    user_id: userId,
    alert_key: input.alertKey,
    read_at: input.read === undefined ? existing?.read_at ?? null : input.read ? now : null,
    dismissed_at: input.dismissed === undefined ? existing?.dismissed_at ?? null : input.dismissed ? now : null,
    snoozed_until: input.snoozedUntil === undefined ? existing?.snoozed_until ?? null : input.snoozedUntil
  };
  const localRow = { ...serverRow, id: input.alertKey };
  if (!navigator.onLine) { await queueCreate({ entityType: "alert-states", table: "alert_states", row: localRow, serverRow }); return; }
  const { error } = await client().from("alert_states").upsert(serverRow);
  if (error) throw error;
  await cacheEntity("alert-states", localRow);
}

export async function addReminder(input: { tripId?: string; title: string; dueAt: string; severity: Reminder["severity"] }) {
  const userId = await currentUserId();
  const id = crypto.randomUUID(); const reminder: Reminder = { id, trip_id: input.tripId || null, title: input.title, due_at: input.dueAt, severity: input.severity, completed_at: null }; const row = { ...reminder, user_id: userId };
  if (!navigator.onLine) { await queueCreate({ entityType: "reminders", table: "reminders", row }); return reminder; }
  const { data, error } = await client().from("reminders").insert({ id, user_id: userId, trip_id: input.tripId || null, title: input.title, due_at: input.dueAt, severity: input.severity }).select("id,trip_id,title,due_at,severity,completed_at").single();
  if (error) throw error;
  await cacheEntity("reminders", data as Reminder);
  return data as Reminder;
}
