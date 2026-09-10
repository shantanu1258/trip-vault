import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase/client";
import { database } from "../../lib/local-db/database";
import { storeOfflineFile } from "../../lib/storage/offlineFiles";
import { cacheEntity, cacheEntityList, localProfileId, networkWithCache, queueCreate, queueDelete, queueDocumentUpload, queueUpdate, readEntityById, readEntityList, syncOutbox } from "../sync/localSync";
import type { ItineraryItem } from "../trips/types";
import { listAvailableAirlines } from "../metadata/publishedConfig";
import type {
  Booking,
  CreateBookingInput,
  CreateFlightInput,
  DocumentCategory,
  DocumentVersion,
  DocumentPurpose,
  DocumentVisibility,
  EventDocumentLink,
  FlightLeg,
  FlightTraveler,
  FlightStatus,
  MemberRole,
  ParticipationType,
  Requirement,
  RequirementStatus,
  RequirementType,
  RequirementInput,
  Traveler,
  TravelerManager,
  TripMember,
  TripInvitation,
  TripAirline,
  TripNote,
  UserProfile,
  UpdateBookingInput,
  UpdateRequirementInput,
  VaultDocument
} from "./types";

export const MAX_DOCUMENT_BYTES = 5_000_000;
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function client(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not connected.");
  return supabase;
}

async function userId() {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Please sign in again.");
  return profileId;
}

export async function listTravelers(tripId: string): Promise<Traveler[]> {
  return networkWithCache(`travelers:${tripId}`, async () => { const { data, error } = await client().from("travelers").select("id,trip_id,display_name,is_minor,status,version,created_at").eq("trip_id", tripId).is("removed_at", null).order("created_at");
  if (error) throw error;
  return (data ?? []) as Traveler[]; });
}

export async function addTraveler(input: { tripId: string; displayName: string; isMinor: boolean }): Promise<Traveler> {
  const actor = await userId();
  const id = crypto.randomUUID(); const created_at = new Date().toISOString(); const traveler: Traveler = { id, trip_id: input.tripId, display_name: input.displayName, is_minor: input.isMinor, created_at }; const row = { ...traveler, created_by: actor };
  if (!navigator.onLine) { await queueCreate({ entityType: `travelers:${input.tripId}`, table: "travelers", row }); return traveler; }
  const { data, error } = await client().from("travelers").insert({ id, trip_id: input.tripId, display_name: input.displayName, is_minor: input.isMinor, created_by: actor }).select("id,trip_id,display_name,is_minor,status,version,created_at").single();
  if (error) throw error;
  await cacheEntity(`travelers:${input.tripId}`, data as Traveler);
  return data as Traveler;
}

export async function updateTraveler(input: { traveler: Traveler; displayName: string; isMinor: boolean }) {
  const patch = { display_name: input.displayName, is_minor: input.isMinor };
  if (!navigator.onLine) {
    const updated = { ...input.traveler, ...patch, version: (input.traveler.version ?? 1) + 1 };
    await queueUpdate({ entityType: `travelers:${input.traveler.trip_id}`, table: "travelers", row: updated, patch, baseVersion: input.traveler.version }); return updated;
  }
  let request = client().from("travelers").update(patch).eq("id", input.traveler.id); if (input.traveler.version !== undefined) request = request.eq("version", input.traveler.version);
  const { data, error } = await request.select("id,trip_id,display_name,is_minor,status,version,created_at").maybeSingle();
  if (error) throw error; if (!data) throw new Error("This traveler changed on another device. Refresh before saving.");
  await cacheEntity(`travelers:${input.traveler.trip_id}`, data as Traveler); return data as Traveler;
}

export async function removeTraveler(traveler: Traveler) {
  const patch = { status: "removed", removed_at: new Date().toISOString() };
  if (!navigator.onLine) {
    const profileId = await userId(); await database.entities.delete([profileId, `travelers:${traveler.trip_id}`, traveler.id]);
    await queueUpdate({ entityType: `travelers:${traveler.trip_id}`, table: "travelers", row: { ...traveler, status: "removed" as const }, patch, baseVersion: traveler.version }); return;
  }
  const { error } = await client().from("travelers").update(patch).eq("id", traveler.id); if (error) throw error;
}

export async function listMembers(tripId: string): Promise<TripMember[]> {
  if (!navigator.onLine) return readEntityList<TripMember>(`members:${tripId}`);
  const { data, error } = await client().from("trip_members").select("user_id,role,participation_type,joined_at").eq("trip_id", tripId).eq("status", "active");
  if (error) throw error;
  const rows = (data ?? []) as Omit<TripMember, "display_name">[];
  if (!rows.length) return [];
  const { data: profiles } = await client().from("profiles").select("id,display_name").in("id", rows.map((row) => row.user_id));
  const names = new Map((profiles ?? []).map((profile) => [profile.id as string, profile.display_name as string]));
  const members = rows.map((row) => ({ ...row, display_name: names.get(row.user_id) ?? "Trip member" }));
  await cacheEntityList(`members:${tripId}`, members.map((member) => ({ ...member, id: member.user_id })));
  return members;
}

export async function updateMemberRole(tripId: string, memberUserId: string, role: Exclude<MemberRole, "owner">) {
  if (!navigator.onLine) throw new Error("Membership changes require a connection.");
  const { error } = await client().from("trip_members").update({ role }).eq("trip_id", tripId).eq("user_id", memberUserId);
  if (error) throw error;
}

export async function removeMember(tripId: string, memberUserId: string) {
  if (!navigator.onLine) throw new Error("Membership changes require a connection.");
  const { error } = await client().from("trip_members").update({ status: "removed", removed_at: new Date().toISOString() }).eq("trip_id", tripId).eq("user_id", memberUserId);
  if (error) throw error;
}

export async function listTravelerManagers(tripId: string): Promise<TravelerManager[]> {
  return networkWithCache(`traveler-managers:${tripId}`, async () => {
    const travelers = await listTravelers(tripId); if (!travelers.length) return [];
    const { data, error } = await client().from("traveler_managers").select("traveler_id,user_id,can_view_documents,can_manage_documents,can_edit_profile").in("traveler_id", travelers.map((traveler) => traveler.id)).is("revoked_at", null);
    if (error) throw error; return (data ?? []).map((row) => ({ ...row, id: `${row.traveler_id}:${row.user_id}` })) as (TravelerManager & { id: string })[];
  });
}

export async function cacheTripRelationships(tripId: string, itinerary: ItineraryItem[], bookings: Booking[], requirements: Requirement[], travelers: Traveler[]) {
  if (!navigator.onLine) return;
  const [bookingRows, itineraryRows, requirementRows, accountRows] = await Promise.all([
    bookings.length ? client().from("booking_travelers").select("booking_id,traveler_id,updated_at").in("booking_id", bookings.map((item) => item.id)) : Promise.resolve({ data: [], error: null }),
    itinerary.length ? client().from("itinerary_participants").select("itinerary_item_id,traveler_id,updated_at").in("itinerary_item_id", itinerary.map((item) => item.id)) : Promise.resolve({ data: [], error: null }),
    requirements.length ? client().from("requirement_assignees").select("requirement_id,traveler_id,completed_at,updated_at").in("requirement_id", requirements.map((item) => item.id)) : Promise.resolve({ data: [], error: null }),
    travelers.length ? client().from("traveler_accounts").select("traveler_id,user_id,invitation_id,linked_at").in("traveler_id", travelers.map((item) => item.id)) : Promise.resolve({ data: [], error: null })
  ]);
  const failure = [bookingRows, itineraryRows, requirementRows, accountRows].find((result) => result.error)?.error; if (failure) throw failure;
  await Promise.all([
    cacheEntityList(`booking-travelers:${tripId}`, (bookingRows.data ?? []).map((row) => ({ ...row, id: `${row.booking_id}:${row.traveler_id}` }))),
    cacheEntityList(`itinerary-participants:${tripId}`, (itineraryRows.data ?? []).map((row) => ({ ...row, id: `${row.itinerary_item_id}:${row.traveler_id}` }))),
    cacheEntityList(`requirement-assignees:${tripId}`, (requirementRows.data ?? []).map((row) => ({ ...row, id: `${row.requirement_id}:${row.traveler_id}` }))),
    cacheEntityList(`traveler-accounts:${tripId}`, (accountRows.data ?? []).map((row) => ({ ...row, id: row.traveler_id })))
  ]);
}

export async function setTravelerManager(input: TravelerManager) {
  if (!navigator.onLine) throw new Error("Traveler delegation requires a connection.");
  const actor = await userId();
  const { error } = await client().from("traveler_managers").upsert({ ...input, assigned_by: actor, revoked_at: null });
  if (error) throw error;
}

export async function revokeTravelerManager(travelerId: string, managerUserId: string) {
  if (!navigator.onLine) throw new Error("Traveler delegation requires a connection.");
  const { error } = await client().from("traveler_managers").update({ revoked_at: new Date().toISOString() }).eq("traveler_id", travelerId).eq("user_id", managerUserId);
  if (error) throw error;
}

export async function createInvitation(input: { tripId: string; targetType: "traveler" | "collaborator"; travelerId?: string; role: Exclude<MemberRole, "owner"> }) {
  const { data, error } = await client().rpc("create_trip_invitation", {
    requested_trip_id: input.tripId,
    requested_target_type: input.targetType,
    requested_traveler_id: input.travelerId ?? null,
    requested_role: input.role
  });
  if (error) throw error;
  return String(data);
}

export async function listInvitations(tripId: string): Promise<TripInvitation[]> {
  if (!navigator.onLine) return [];
  const { data, error } = await client().from("trip_invitations").select("id,trip_id,target_type,traveler_id,role,expires_at,redeemed_at,revoked_at,created_at").eq("trip_id", tripId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TripInvitation[];
}

export async function revokeInvitation(invitationId: string) {
  if (!navigator.onLine) throw new Error("Invitation changes require a connection.");
  const { error } = await client().from("trip_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invitationId).is("redeemed_at", null);
  if (error) throw error;
}

export async function redeemInvitation(code: string) {
  const { data, error } = await client().rpc("redeem_trip_invitation", { submitted_code: code });
  if (error || !data) throw new Error("This code could not be used. Check it and ask the organizer for a new one if needed.");
  return String(data);
}

const bookingSelect = "id,trip_id,type,title,provider,reference_code,start_at,end_at,source_timezone,location,details,version,created_at,updated_at";

export async function listBookings(tripId: string): Promise<Booking[]> {
  return networkWithCache(`bookings:${tripId}`, async () => { const { data, error } = await client().from("bookings").select(bookingSelect).eq("trip_id", tripId).is("deleted_at", null).order("start_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Booking[]; });
}

export async function getBooking(bookingId: string): Promise<Booking> {
  if (!navigator.onLine) {
    const cached = await readEntityById<Booking>("bookings:", bookingId); if (cached) return cached;
  }
  const { data, error } = await client().from("bookings").select(bookingSelect).eq("id", bookingId).is("deleted_at", null).single();
  if (error) throw error;
  return data as Booking;
}

export async function addBooking(input: CreateBookingInput): Promise<Booking> {
  const actor = await userId();
  const id = crypto.randomUUID(); const created_at = new Date().toISOString(); const booking: Booking = { id, trip_id: input.tripId, type: input.type, title: input.title, provider: input.provider || null, reference_code: input.referenceCode || null, start_at: input.startsAt || null, end_at: input.endsAt || null, source_timezone: input.timezone || null, location: input.location ? { label: input.location, address: input.location } : null, details: input.notes ? { notes: input.notes } : {}, created_at, updated_at: created_at }; const row = { ...booking, created_by: actor };
  if (!navigator.onLine) {
    const parentOperation = await queueCreate({ entityType: `bookings:${input.tripId}`, table: "bookings", row });
    for (const travelerId of input.travelerIds ?? []) await queueCreate({ entityType: `booking-travelers:${id}`, table: "booking_travelers", row: { id: `${id}:${travelerId}`, booking_id: id, traveler_id: travelerId }, serverRow: { booking_id: id, traveler_id: travelerId }, dependsOn: [parentOperation] });
    return booking;
  }
  const { data, error } = await client().from("bookings").insert({
    id, trip_id: input.tripId, type: input.type, title: input.title, provider: input.provider || null,
    reference_code: input.referenceCode || null, start_at: input.startsAt || null, end_at: input.endsAt || null,
    source_timezone: input.timezone || null, location: input.location ? { label: input.location, address: input.location } : null,
    details: input.notes ? { notes: input.notes } : {}, created_by: actor
  }).select(bookingSelect).single();
  if (error) throw error;
  if (input.travelerIds?.length) { const { error: travelersError } = await client().from("booking_travelers").insert(input.travelerIds.map((travelerId) => ({ booking_id: id, traveler_id: travelerId }))); if (travelersError) throw travelersError; }
  await cacheEntity(`bookings:${input.tripId}`, data as Booking);
  return data as Booking;
}

export async function listBookingTravelerIds(bookingId: string, tripId: string): Promise<string[]> {
  const key = `booking-travelers:${tripId}`;
  if (!navigator.onLine) return (await readEntityList<{ booking_id: string; traveler_id: string }>(key)).filter((row) => row.booking_id === bookingId).map((row) => row.traveler_id);
  const { data, error } = await client().from("booking_travelers").select("booking_id,traveler_id,updated_at").eq("booking_id", bookingId);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({ ...row, id: `${row.booking_id}:${row.traveler_id}` }));
  const cached = await readEntityList<typeof rows[number]>(key);
  await cacheEntityList(key, [...cached.filter((row) => row.booking_id !== bookingId), ...rows]);
  return rows.map((row) => String(row.traveler_id));
}

export async function listItineraryParticipantIds(itineraryItemId: string, tripId: string): Promise<string[]> {
  const key = `itinerary-participants:${tripId}`;
  if (!navigator.onLine) return (await readEntityList<{ itinerary_item_id: string; traveler_id: string }>(key)).filter((row) => row.itinerary_item_id === itineraryItemId).map((row) => row.traveler_id);
  const { data, error } = await client().from("itinerary_participants").select("itinerary_item_id,traveler_id,updated_at").eq("itinerary_item_id", itineraryItemId);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({ ...row, id: `${row.itinerary_item_id}:${row.traveler_id}` }));
  const cached = await readEntityList<typeof rows[number]>(key);
  await cacheEntityList(key, [...cached.filter((row) => row.itinerary_item_id !== itineraryItemId), ...rows]);
  return rows.map((row) => String(row.traveler_id));
}

export async function updateBooking(input: UpdateBookingInput): Promise<Booking> {
  const existing = await getBooking(input.id);
  const patch = { type: input.type, title: input.title, provider: input.provider || null, reference_code: input.referenceCode || null, start_at: input.startsAt || null, end_at: input.endsAt || null, source_timezone: input.timezone || null, location: input.location ? { label: input.location, address: input.location } : null, details: input.notes ? { ...existing.details, notes: input.notes } : Object.fromEntries(Object.entries(existing.details).filter(([key]) => key !== "notes")) };
  const currentTravelerIds = await listBookingTravelerIds(input.id, input.tripId);
  if (!navigator.onLine) {
    const updated = { ...existing, ...patch, version: (existing.version ?? 1) + 1, updated_at: new Date().toISOString() };
    const parent = await queueUpdate({ entityType: `bookings:${input.tripId}`, table: "bookings", row: updated, patch, baseVersion: existing.version });
    const removals: string[] = [];
    for (const travelerId of currentTravelerIds.filter((id) => !(input.travelerIds ?? []).includes(id))) removals.push(await queueDelete({ entityType: `booking-travelers:${input.tripId}`, table: "booking_travelers", entityId: `${input.id}:${travelerId}`, match: { booking_id: input.id, traveler_id: travelerId }, hard: true, dependsOn: [parent] }));
    for (const travelerId of input.travelerIds ?? []) if (!currentTravelerIds.includes(travelerId)) await queueCreate({ entityType: `booking-travelers:${input.tripId}`, table: "booking_travelers", row: { id: `${input.id}:${travelerId}`, booking_id: input.id, traveler_id: travelerId }, serverRow: { booking_id: input.id, traveler_id: travelerId }, dependsOn: [parent, ...removals] });
    return updated;
  }
  let request = client().from("bookings").update(patch).eq("id", input.id); if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select(bookingSelect).maybeSingle(); if (error) throw error; if (!data) throw new Error("This booking changed on another device. Refresh before saving.");
  const { error: clearError } = await client().from("booking_travelers").delete().eq("booking_id", input.id); if (clearError) throw clearError;
  if (input.travelerIds?.length) { const { error: participantError } = await client().from("booking_travelers").insert(input.travelerIds.map((travelerId) => ({ booking_id: input.id, traveler_id: travelerId }))); if (participantError) throw participantError; }
  await cacheEntity(`bookings:${input.tripId}`, data as Booking); return data as Booking;
}

export async function archiveBooking(booking: Booking) {
  if (!navigator.onLine) {
    const profileId = await userId(); await database.entities.delete([profileId, `bookings:${booking.trip_id}`, booking.id]);
    await queueDelete({ entityType: `bookings:${booking.trip_id}`, table: "bookings", entityId: booking.id }); return;
  }
  const { error } = await client().from("bookings").update({ deleted_at: new Date().toISOString() }).eq("id", booking.id); if (error) throw error;
}

export async function addFlightBooking(input: CreateFlightInput): Promise<{ booking: Booking; flight: FlightLeg }> {
  const actor = await userId();
  const booking = await addBooking({ tripId: input.tripId, type: "flight", title: input.title, provider: input.airlineName, referenceCode: input.referenceCode, startsAt: input.departureAt, endsAt: input.arrivalAt, timezone: input.departureTimezone, travelerIds: input.travelerIds });
  const bookingOperation = !navigator.onLine ? await database.outbox.where("entityId").equals(booking.id).filter((operation) => operation.operation === "create").first() : undefined;
  let airlineId: string = crypto.randomUUID();
  const selectedAirline = (await listAvailableAirlines()).find((airline) => airline.name.toLocaleLowerCase() === input.airlineName.toLocaleLowerCase());
  let airlineRow = { id: airlineId, trip_id: input.tripId, name: input.airlineName, iata_code: selectedAirline?.iataCode ?? null, icao_code: selectedAirline?.icaoCode ?? null, tracker_url_template: selectedAirline?.trackerUrlTemplate ?? null, status_url_template: selectedAirline?.statusUrlTemplate ?? null, check_in_url_template: selectedAirline?.checkInUrlTemplate ?? null, manage_booking_url_template: selectedAirline?.manageBookingUrlTemplate ?? null, brand_color: selectedAirline?.brandColor ?? null, logo_asset_key: selectedAirline?.logoAssetPath ?? null, banner_asset_key: selectedAirline?.bannerAssetPath ?? null, metadata_source: selectedAirline ? selectedAirline.sourceVersion ? "published_catalog" : "bundled_fallback" : "manual", source_catalog_key: selectedAirline?.stableKey ?? null, source_config_version: selectedAirline?.sourceVersion || null, created_by: actor };
  let airlineOperation: string | undefined;
  if (!navigator.onLine) airlineOperation = await queueCreate({ entityType: `trip-airlines:${input.tripId}`, table: "trip_airlines", row: airlineRow });
  else {
    const { data: existingAirline, error: lookupError } = await client().from("trip_airlines").select("id").eq("trip_id", input.tripId).ilike("name", input.airlineName).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (existingAirline?.id) { airlineId = String(existingAirline.id); airlineRow = { ...airlineRow, id: airlineId }; }
    else { const { error: airlineError } = await client().from("trip_airlines").insert(airlineRow); if (airlineError) throw airlineError; }
  }
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const flight: FlightLeg = { id, booking_id: booking.id, segment_order: 0, airline_name: input.airlineName, marketing_airline_id: airlineId, operating_airline_id: null, flight_number: input.flightNumber, departure_airport_code: input.departureCode || null, departure_airport_name: input.departureName, arrival_airport_code: input.arrivalCode || null, arrival_airport_name: input.arrivalName, scheduled_departure_at: input.departureAt, scheduled_arrival_at: input.arrivalAt, estimated_departure_at: null, estimated_arrival_at: null, actual_departure_at: null, actual_arrival_at: null, departure_timezone: input.departureTimezone, arrival_timezone: input.arrivalTimezone, boarding_at: null, departure_terminal: null, departure_gate: null, arrival_terminal: null, arrival_gate: null, baggage_claim: null, status: "scheduled", status_note: null, status_updated_by: actor, status_updated_at: now };
  if (!navigator.onLine) {
    const flightOperation = await queueCreate({ entityType: `flights:${input.tripId}`, table: "flight_legs", row: flight, dependsOn: [bookingOperation?.operationId, airlineOperation].filter((operationId): operationId is string => Boolean(operationId)) });
    for (const travelerId of input.travelerIds ?? []) await queueCreate({ entityType: `flight-travelers:${id}`, table: "flight_leg_travelers", row: { id: `${id}:${travelerId}`, flight_leg_id: id, traveler_id: travelerId, seat: null, boarding_group: null, ticket_number: null }, serverRow: { flight_leg_id: id, traveler_id: travelerId }, dependsOn: [flightOperation] });
    return { booking, flight };
  }
  const { data, error } = await client().from("flight_legs").insert({
    id, booking_id: booking.id, segment_order: 0, airline_name: input.airlineName, marketing_airline_id: airlineId, flight_number: input.flightNumber,
    departure_airport_code: input.departureCode || null, departure_airport_name: input.departureName,
    arrival_airport_code: input.arrivalCode || null, arrival_airport_name: input.arrivalName,
    scheduled_departure_at: input.departureAt, scheduled_arrival_at: input.arrivalAt,
    departure_timezone: input.departureTimezone, arrival_timezone: input.arrivalTimezone,
    status: "scheduled", status_updated_by: actor
  }).select("*").single();
  if (error) throw error;
  if (input.travelerIds?.length) { const { error: travelersError } = await client().from("flight_leg_travelers").insert(input.travelerIds.map((travelerId) => ({ flight_leg_id: id, traveler_id: travelerId }))); if (travelersError) throw travelersError; }
  await cacheEntity(`flights:${input.tripId}`, data as FlightLeg);
  return { booking, flight: data as FlightLeg };
}

export async function listFlightTravelers(flightLegId: string): Promise<FlightTraveler[]> {
  return networkWithCache(`flight-travelers:${flightLegId}`, async () => {
    const { data, error } = await client().from("flight_leg_travelers").select("flight_leg_id,traveler_id,seat,boarding_group,ticket_number").eq("flight_leg_id", flightLegId);
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row, id: `${row.flight_leg_id}:${row.traveler_id}` })) as FlightTraveler[];
  });
}

export async function setFlightTravelerDetails(input: { tripId: string; flightLegId: string; travelerId: string; seat?: string; boardingGroup?: string; ticketNumber?: string }) {
  const row: FlightTraveler = { id: `${input.flightLegId}:${input.travelerId}`, flight_leg_id: input.flightLegId, traveler_id: input.travelerId, seat: input.seat || null, boarding_group: input.boardingGroup || null, ticket_number: input.ticketNumber || null };
  const serverRow = { flight_leg_id: input.flightLegId, traveler_id: input.travelerId, seat: row.seat, boarding_group: row.boarding_group, ticket_number: row.ticket_number };
  if (!navigator.onLine) { await queueCreate({ entityType: `flight-travelers:${input.flightLegId}`, table: "flight_leg_travelers", row, serverRow }); return row; }
  const { data, error } = await client().from("flight_leg_travelers").upsert(serverRow).select("flight_leg_id,traveler_id,seat,boarding_group,ticket_number").single();
  if (error) throw error;
  const result = { ...data, id: `${data.flight_leg_id}:${data.traveler_id}` } as FlightTraveler;
  await cacheEntity(`flight-travelers:${input.flightLegId}`, result);
  return result;
}

export async function listFlightLegsForTrip(tripId: string): Promise<FlightLeg[]> {
  return networkWithCache(`flights:${tripId}`, async () => {
    const bookings = await listBookings(tripId);
    const flightIds = bookings.filter((booking) => booking.type === "flight").map((booking) => booking.id);
    if (!flightIds.length) return [];
    const { data, error } = await client().from("flight_legs").select("*").in("booking_id", flightIds).is("deleted_at", null).order("scheduled_departure_at");
    if (error) throw error;
    return (data ?? []) as FlightLeg[];
  });
}

export async function listTripAirlines(tripId: string): Promise<TripAirline[]> {
  return networkWithCache(`trip-airlines:${tripId}`, async () => {
    const { data, error } = await client().from("trip_airlines").select("id,trip_id,name,iata_code,icao_code,check_in_url_template,manage_booking_url_template,status_url_template,tracker_url_template,brand_color,metadata_source,source_catalog_key,source_config_version,version").eq("trip_id", tripId).order("name");
    if (error) throw error;
    return (data ?? []) as TripAirline[];
  });
}

export async function updateTripAirline(input: TripAirline) {
  const patch = { name: input.name, iata_code: input.iata_code, icao_code: input.icao_code, check_in_url_template: input.check_in_url_template, manage_booking_url_template: input.manage_booking_url_template, status_url_template: input.status_url_template, tracker_url_template: input.tracker_url_template, brand_color: input.brand_color, metadata_source: "manual", last_verified_at: new Date().toISOString() };
  if (!navigator.onLine) { const updated = { ...input, ...patch, version: input.version + 1 }; await queueUpdate({ entityType: `trip-airlines:${input.trip_id}`, table: "trip_airlines", row: updated, patch, baseVersion: input.version }); return updated; }
  const { data, error } = await client().from("trip_airlines").update(patch).eq("id", input.id).eq("version", input.version).select("id,trip_id,name,iata_code,icao_code,check_in_url_template,manage_booking_url_template,status_url_template,tracker_url_template,brand_color,metadata_source,source_catalog_key,source_config_version,version").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This airline metadata changed on another device. Refresh before saving.");
  await cacheEntity(`trip-airlines:${input.trip_id}`, data as TripAirline); return data as TripAirline;
}

export async function getFlightLeg(flightLegId: string): Promise<FlightLeg> {
  if (!navigator.onLine) { const cached = await readEntityById<FlightLeg>("flights:", flightLegId); if (cached) return cached; }
  const { data, error } = await client().from("flight_legs").select("*").eq("id", flightLegId).is("deleted_at", null).single();
  if (error) throw error;
  return data as FlightLeg;
}

export async function updateFlightLeg(input: Partial<FlightLeg> & { id: string; tripId?: string; status: FlightStatus }): Promise<FlightLeg> {
  const actor = await userId();
  const allowed = {
    status: input.status, estimated_departure_at: input.estimated_departure_at || null, estimated_arrival_at: input.estimated_arrival_at || null,
    actual_departure_at: input.actual_departure_at || null, actual_arrival_at: input.actual_arrival_at || null, boarding_at: input.boarding_at || null,
    departure_terminal: input.departure_terminal || null, departure_gate: input.departure_gate || null,
    arrival_terminal: input.arrival_terminal || null, arrival_gate: input.arrival_gate || null, baggage_claim: input.baggage_claim || null,
    status_note: input.status_note || null, status_updated_by: actor, status_updated_at: new Date().toISOString()
  };
  if (!navigator.onLine && input.tripId) {
    const existing = await readEntityById<FlightLeg>("flights:", input.id); if (!existing) throw new Error("This flight was not cached for offline editing.");
    const updated = { ...existing, ...allowed, version: (existing.version ?? 1) + 1 };
    await queueUpdate({ entityType: `flights:${input.tripId}`, table: "flight_legs", row: updated, patch: allowed, baseVersion: existing.version }); return updated;
  }
  let request = client().from("flight_legs").update(allowed).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This flight changed on another device. Refresh and choose which update to keep.");
  if (input.tripId) await cacheEntity(`flights:${input.tripId}`, data as FlightLeg);
  return data as FlightLeg;
}

export async function listRequirements(tripId: string): Promise<Requirement[]> {
  return networkWithCache(`requirements:${tripId}`, async () => { const { data, error } = await client().from("trip_requirements").select("*").eq("trip_id", tripId).is("deleted_at", null).order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Requirement[]; });
}

export async function addRequirement(input: RequirementInput): Promise<Requirement> {
  const actor = await userId();
  const id = crypto.randomUUID(); const requirement = { id, trip_id: input.tripId, type: input.type, title: input.title, status: input.status, destination_country_code: input.destinationCountryCode || null, visa_type: input.visaType || null, due_date: input.dueDate || null, issued_on: input.issuedOn || null, expires_on: input.expiresOn || null, validity_buffer_days: input.validityBufferDays ?? null, official_guidance_url: input.officialGuidanceUrl || null, guidance_checked_at: input.officialGuidanceUrl ? new Date().toISOString() : null, linked_document_id: input.linkedDocumentId || null, notes: input.notes || null } satisfies Requirement; const row = { ...requirement, created_by: actor };
  if (!navigator.onLine) {
    const parentOperation = await queueCreate({ entityType: `requirements:${input.tripId}`, table: "trip_requirements", row });
    for (const travelerId of input.travelerIds ?? []) await queueCreate({ entityType: `requirement-assignees:${id}`, table: "requirement_assignees", row: { id: `${id}:${travelerId}`, requirement_id: id, traveler_id: travelerId, completed_at: null }, serverRow: { requirement_id: id, traveler_id: travelerId }, dependsOn: [parentOperation] });
    return requirement;
  }
  const { data, error } = await client().from("trip_requirements").insert({
    id, trip_id: input.tripId, type: input.type, title: input.title, status: input.status,
    destination_country_code: input.destinationCountryCode || null, visa_type: input.visaType || null,
    due_date: input.dueDate || null, issued_on: input.issuedOn || null, expires_on: input.expiresOn || null, validity_buffer_days: input.validityBufferDays ?? null,
    official_guidance_url: input.officialGuidanceUrl || null, guidance_checked_at: input.officialGuidanceUrl ? new Date().toISOString() : null,
    linked_document_id: input.linkedDocumentId || null, notes: input.notes || null, created_by: actor
  }).select("*").single();
  if (error) throw error;
  if (input.travelerIds?.length) { const { error: assigneesError } = await client().from("requirement_assignees").insert(input.travelerIds.map((travelerId) => ({ requirement_id: id, traveler_id: travelerId }))); if (assigneesError) throw assigneesError; }
  await cacheEntity(`requirements:${input.tripId}`, data as Requirement);
  return data as Requirement;
}

export async function listRequirementAssigneeIds(requirementId: string, tripId: string): Promise<string[]> {
  const key = `requirement-assignees:${tripId}`;
  if (!navigator.onLine) return (await readEntityList<{ requirement_id: string; traveler_id: string }>(key)).filter((row) => row.requirement_id === requirementId).map((row) => row.traveler_id);
  const { data, error } = await client().from("requirement_assignees").select("requirement_id,traveler_id,completed_at,updated_at").eq("requirement_id", requirementId);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({ ...row, id: `${row.requirement_id}:${row.traveler_id}` }));
  const cached = await readEntityList<typeof rows[number]>(key);
  await cacheEntityList(key, [...cached.filter((row) => row.requirement_id !== requirementId), ...rows]);
  return rows.map((row) => String(row.traveler_id));
}

export async function updateRequirement(input: UpdateRequirementInput): Promise<Requirement> {
  const existing = (await readEntityList<Requirement>(`requirements:${input.tripId}`)).find((item) => item.id === input.id);
  if (!existing) throw new Error("Refresh readiness before editing this item.");
  const patch = {
    type: input.type,
    title: input.title,
    status: input.status,
    destination_country_code: input.destinationCountryCode || null,
    visa_type: input.visaType || null,
    due_date: input.dueDate || null,
    issued_on: input.issuedOn || null,
    expires_on: input.expiresOn || null,
    validity_buffer_days: input.validityBufferDays ?? null,
    official_guidance_url: input.officialGuidanceUrl || null,
    guidance_checked_at: input.officialGuidanceUrl ? new Date().toISOString() : null,
    linked_document_id: input.linkedDocumentId || null,
    notes: input.notes || null
  };
  const currentAssignees = await listRequirementAssigneeIds(input.id, input.tripId);
  if (!navigator.onLine) {
    const updated = { ...existing, ...patch, version: (existing.version ?? 1) + 1 };
    const parent = await queueUpdate({ entityType: `requirements:${input.tripId}`, table: "trip_requirements", row: updated, patch, baseVersion: existing.version });
    const removals: string[] = [];
    for (const travelerId of currentAssignees.filter((id) => !(input.travelerIds ?? []).includes(id))) removals.push(await queueDelete({ entityType: `requirement-assignees:${input.tripId}`, table: "requirement_assignees", entityId: `${input.id}:${travelerId}`, match: { requirement_id: input.id, traveler_id: travelerId }, hard: true, dependsOn: [parent] }));
    for (const travelerId of input.travelerIds ?? []) if (!currentAssignees.includes(travelerId)) await queueCreate({ entityType: `requirement-assignees:${input.tripId}`, table: "requirement_assignees", row: { id: `${input.id}:${travelerId}`, requirement_id: input.id, traveler_id: travelerId, completed_at: null }, serverRow: { requirement_id: input.id, traveler_id: travelerId }, dependsOn: [parent, ...removals] });
    return updated;
  }
  let request = client().from("trip_requirements").update(patch).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This readiness item changed on another device. Refresh before saving.");
  const { error: clearError } = await client().from("requirement_assignees").delete().eq("requirement_id", input.id);
  if (clearError) throw clearError;
  if (input.travelerIds?.length) {
    const { error: assigneesError } = await client().from("requirement_assignees").insert(input.travelerIds.map((travelerId) => ({ requirement_id: input.id, traveler_id: travelerId })));
    if (assigneesError) throw assigneesError;
  }
  await cacheEntity(`requirements:${input.tripId}`, data as Requirement);
  return data as Requirement;
}

export async function archiveRequirement(requirement: Requirement) {
  if (!navigator.onLine) {
    const profileId = await userId();
    await database.entities.delete([profileId, `requirements:${requirement.trip_id}`, requirement.id]);
    await queueDelete({ entityType: `requirements:${requirement.trip_id}`, table: "trip_requirements", entityId: requirement.id });
    return;
  }
  const { error } = await client().from("trip_requirements").update({ deleted_at: new Date().toISOString() }).eq("id", requirement.id);
  if (error) throw error;
}

export async function updateRequirementStatus(id: string, status: RequirementStatus, tripId?: string) {
  if (!navigator.onLine && tripId) {
    const existing = await readEntityById<Requirement>("requirements:", id); if (!existing) throw new Error("This readiness item was not cached.");
    const updated = { ...existing, status, version: (existing.version ?? 1) + 1 };
    await queueUpdate({ entityType: `requirements:${tripId}`, table: "trip_requirements", row: updated, patch: { status }, baseVersion: existing.version }); return updated;
  }
  const existing = tripId ? await readEntityById<Requirement>("requirements:", id) : undefined;
  let request = client().from("trip_requirements").update({ status }).eq("id", id); if (existing?.version !== undefined) request = request.eq("version", existing.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This readiness item changed on another device. Refresh before editing it.");
  if (tripId) await cacheEntity(`requirements:${tripId}`, data as Requirement); return data as Requirement;
}

const documentSelect = "id,trip_id,booking_id,flight_leg_id,traveler_id,title,category,purpose,short_label,visibility,uploaded_by,current_version_id,version,updated_at,deleted_at,current_version:document_versions!documents_current_version_id_fkey(id,storage_path,original_filename,mime_type,byte_size,sha256,version_number,created_at)";

export async function listVaultDocuments(tripId?: string): Promise<VaultDocument[]> {
  const key = tripId ? `documents:${tripId}` : "documents";
  const documents = await networkWithCache(key, async () => {
  let query = client().from("documents").select(documentSelect).is("deleted_at", null).order("updated_at", { ascending: false });
  if (tripId) query = query.eq("trip_id", tripId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as VaultDocument[]; });
  if (tripId) {
    const crossTripDocuments = await readEntityList<VaultDocument>("documents");
    await cacheEntityList("documents", [...crossTripDocuments.filter((document) => document.trip_id !== tripId), ...documents]);
    const profileId = await localProfileId(); const manifest = profileId ? await database.offlineManifests.get([profileId, tripId]) : undefined;
    if (manifest && ["ready", "essentials_ready"].includes(manifest.state)) {
      const current = documents.flatMap((document) => document.current_version ? [document.current_version.id] : []).sort();
      const expected = [...manifest.expectedVersionIds].sort();
      const changed = manifest.state === "ready" ? current.length !== expected.length || current.some((id, index) => id !== expected[index]) : expected.some((id) => !current.includes(id));
      if (changed) await database.offlineManifests.update([profileId!, tripId], { state: "stale" });
    }
  }
  return documents;
}

export async function getVaultDocument(documentId: string): Promise<VaultDocument> {
  if (!navigator.onLine) { const match = await readEntityById<VaultDocument>("documents", documentId); if (match) return match; }
  const { data, error } = await client().from("documents").select(documentSelect).eq("id", documentId).is("deleted_at", null).single();
  if (error) throw error;
  return data as unknown as VaultDocument;
}

export async function listArchivedVaultDocuments(): Promise<VaultDocument[]> {
  if (!navigator.onLine) return [];
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await client().from("documents").select(documentSelect).not("deleted_at", "is", null).gte("deleted_at", cutoff).order("deleted_at", { ascending: false });
  if (error) throw error; return (data ?? []) as unknown as VaultDocument[];
}

export async function restoreDocument(document: VaultDocument) {
  if (!navigator.onLine) throw new Error("Restoring a document requires a connection.");
  const { data, error } = await client().from("documents").update({ deleted_at: null }).eq("id", document.id).select(documentSelect).maybeSingle();
  if (error) throw error; if (!data) throw new Error("This document can no longer be restored."); return data as unknown as VaultDocument;
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  if (!navigator.onLine) return [];
  const { data, error } = await client().from("document_versions").select("id,storage_path,original_filename,mime_type,byte_size,sha256,version_number,created_at").eq("document_id", documentId).order("version_number", { ascending: false });
  if (error) throw error; return (data ?? []) as DocumentVersion[];
}

export async function documentStorageUsage() {
  const profileId = await localProfileId();
  const localRows = profileId ? await database.localDocuments.where("profileId").equals(profileId).toArray() : [];
  const documents = await listVaultDocuments();
  return { localBytes: localRows.reduce((sum, row) => sum + row.byteSize, 0), cloudBytes: documents.reduce((sum, document) => sum + (document.current_version?.byte_size ?? 0), 0), localFiles: localRows.length, cloudFiles: documents.filter((document) => document.current_version).length };
}

export function validateDocumentFile(file: File) {
  if (file.size >= MAX_DOCUMENT_BYTES) throw new Error(`${file.name} is ${(file.size / 1_000_000).toFixed(2)} MB. Choose a file smaller than 5 MB.`);
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) throw new Error("Use a PDF, JPEG, PNG, or WebP file.");
}

export async function sha256(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function sanitizeFilename(filename: string) {
  const cleaned = filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+\./g, ".").replace(/^[._-]+|[._-]+$/g, "").slice(0, 100);
  return cleaned || "document";
}

export async function uploadDocument(input: { tripId: string; title: string; category: DocumentCategory; purpose: DocumentPurpose; visibility: DocumentVisibility; file: File; travelerId?: string; bookingId?: string; flightLegId?: string; shortLabel?: string; selectedUserIds?: string[] }): Promise<VaultDocument> {
  validateDocumentFile(input.file);
  const actor = await userId();
  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const storagePath = `trips/${input.tripId}/documents/${documentId}/versions/${versionId}/${sanitizeFilename(input.file.name)}`;
  const checksum = await sha256(input.file);
  const createdAt = new Date().toISOString();
  const documentRow = { id: documentId, trip_id: input.tripId, booking_id: input.bookingId || null, flight_leg_id: input.flightLegId || null, traveler_id: input.travelerId || null, title: input.title, category: input.category, purpose: input.purpose, short_label: input.shortLabel || null, visibility: input.visibility, uploaded_by: actor };
  const versionRow = { id: versionId, document_id: documentId, version_number: 1, storage_path: storagePath, original_filename: input.file.name, mime_type: input.file.type, byte_size: input.file.size, sha256: checksum, created_by: actor };
  const document: VaultDocument = { ...documentRow, current_version_id: versionId, updated_at: createdAt, current_version: { ...versionRow, created_at: createdAt } };
  await storeOfflineFile({ profileId: actor, versionId, blob: input.file, sha256: checksum, pinReason: "created" });
  await Promise.all([cacheEntity(`documents:${input.tripId}`, document), cacheEntity("documents", document)]);
  const uploadOperation = await queueDocumentUpload({ document: documentRow, version: versionRow, storagePath });
  for (const selectedUserId of input.selectedUserIds ?? []) await queueCreate({ entityType: `document-access:${documentId}`, table: "document_access", row: { id: `${documentId}:${selectedUserId}`, document_id: documentId, user_id: selectedUserId }, serverRow: { document_id: documentId, user_id: selectedUserId, granted_by: actor }, dependsOn: [uploadOperation] });
  if (navigator.onLine) {
    await syncOutbox();
    try { return await getVaultDocument(documentId); } catch { /* local queued copy remains authoritative until retry */ }
  }
  return document;
}

export async function downloadDocumentVersion(document: VaultDocument) {
  if (!document.current_version) throw new Error("This document does not have an uploaded file yet.");
  const { data, error } = await client().storage.from("trip-documents").download(document.current_version.storage_path);
  if (error) throw error;
  const checksum = await sha256(data);
  if (checksum !== document.current_version.sha256) throw new Error("The downloaded file failed its integrity check.");
  return data;
}

export async function replaceDocumentVersion(document: VaultDocument, file: File) {
  validateDocumentFile(file); const actor = await userId(); const versionId = crypto.randomUUID(); const checksum = await sha256(file); const now = new Date().toISOString();
  const storagePath = `trips/${document.trip_id}/documents/${document.id}/versions/${versionId}/${sanitizeFilename(file.name)}`;
  const versionRow = { id: versionId, document_id: document.id, version_number: (document.current_version?.version_number ?? 0) + 1, storage_path: storagePath, original_filename: file.name, mime_type: file.type, byte_size: file.size, sha256: checksum, created_by: actor };
  const documentRow = { id: document.id, trip_id: document.trip_id, booking_id: document.booking_id, flight_leg_id: document.flight_leg_id, traveler_id: document.traveler_id, title: document.title, category: document.category, purpose: document.purpose, short_label: document.short_label, visibility: document.visibility, uploaded_by: actor };
  const updated: VaultDocument = { ...document, current_version_id: versionId, current_version: { ...versionRow, created_at: now }, updated_at: now };
  await storeOfflineFile({ profileId: actor, versionId, blob: file, sha256: checksum, pinReason: "created" });
  await Promise.all([cacheEntity(`documents:${document.trip_id}`, updated), cacheEntity("documents", updated)]);
  await queueDocumentUpload({ document: documentRow, version: versionRow, storagePath });
  if (navigator.onLine) {
    await syncOutbox();
    try { return await getVaultDocument(document.id); } catch { /* keep queued local version for foreground retry */ }
  }
  return updated;
}

export async function archiveDocument(document: VaultDocument) {
  const archived = { ...document, updated_at: new Date().toISOString() };
  if (!navigator.onLine) {
    const profileId = await localProfileId();
    if (profileId) await Promise.all([database.entities.delete([profileId, `documents:${document.trip_id}`, document.id]), database.entities.delete([profileId, "documents", document.id])]);
    await queueDelete({ entityType: `documents:${document.trip_id}`, table: "documents", entityId: document.id }); return archived;
  }
  const { error } = await client().from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", document.id); if (error) throw error;
  return archived;
}

export async function listEventDocumentLinks(itineraryItemId: string): Promise<EventDocumentLink[]> {
  return networkWithCache(`event-documents:${itineraryItemId}`, async () => {
    const { data, error } = await client().from("itinerary_item_documents").select(`itinerary_item_id,document_id,label,sort_order,document:documents!inner(${documentSelect.replaceAll("current_version:", "current_version:")})`).eq("itinerary_item_id", itineraryItemId).is("deleted_at", null).order("sort_order");
    if (error) throw error;
    const rows = (data ?? []) as unknown as EventDocumentLink[];
    return rows.map((row) => ({ ...row, id: `${row.itinerary_item_id}:${row.document_id}` }));
  });
}

export async function attachDocumentsToEvent(itineraryItem: ItineraryItem, documentIds: string[]) {
  const actor = await userId();
  const existing = await listEventDocumentLinks(itineraryItem.id);
  const newIds = documentIds.filter((id) => !existing.some((link) => link.document_id === id));
  if (!newIds.length) return existing;
  if (!navigator.onLine) {
    const documents = await readEntityList<VaultDocument>(`documents:${itineraryItem.trip_id}`);
    const profileId = await localProfileId();
    const pendingUploads = profileId ? await database.outbox.where("profileId").equals(profileId).filter((operation) => operation.operation === "upload_document" && newIds.includes(operation.entityId)).toArray() : [];
    const created = newIds.map((documentId, index) => ({ id: `${itineraryItem.id}:${documentId}`, itinerary_item_id: itineraryItem.id, document_id: documentId, label: null, sort_order: existing.length + index, document: documents.find((document) => document.id === documentId)! })).filter((link) => link.document);
    for (const link of created) await queueCreate({ entityType: `event-documents:${itineraryItem.id}`, table: "itinerary_item_documents", row: link, serverRow: { itinerary_item_id: link.itinerary_item_id, document_id: link.document_id, sort_order: link.sort_order, created_by: actor }, dependsOn: pendingUploads.filter((operation) => operation.entityId === link.document_id).map((operation) => operation.operationId) });
    return [...existing, ...created];
  }
  const { error } = await client().from("itinerary_item_documents").insert(newIds.map((documentId, index) => ({ itinerary_item_id: itineraryItem.id, document_id: documentId, sort_order: existing.length + index, created_by: actor })));
  if (error) throw error;
  return listEventDocumentLinks(itineraryItem.id);
}

export async function unlinkDocumentFromEvent(itineraryItemId: string, documentId: string) {
  if (!navigator.onLine) {
    const profile = await localProfileId();
    if (profile) await database.entities.delete([profile, `event-documents:${itineraryItemId}`, `${itineraryItemId}:${documentId}`]);
    await queueDelete({ entityType: `event-documents:${itineraryItemId}`, table: "itinerary_item_documents", entityId: `${itineraryItemId}:${documentId}`, match: { itinerary_item_id: itineraryItemId, document_id: documentId } });
    return;
  }
  const { error } = await client().from("itinerary_item_documents").update({ deleted_at: new Date().toISOString() }).eq("itinerary_item_id", itineraryItemId).eq("document_id", documentId);
  if (error) throw error;
}

export async function reorderEventDocuments(itineraryItemId: string, orderedDocumentIds: string[]) {
  if (!navigator.onLine) {
    const existing = await readEntityList<EventDocumentLink & { id: string }>(`event-documents:${itineraryItemId}`);
    for (const [sortOrder, documentId] of orderedDocumentIds.entries()) {
      const link = existing.find((item) => item.document_id === documentId); if (!link) continue;
      await queueCreate({ entityType: `event-documents:${itineraryItemId}`, table: "itinerary_item_documents", row: { ...link, sort_order: sortOrder }, serverRow: { itinerary_item_id: itineraryItemId, document_id: documentId, sort_order: sortOrder } });
    }
    return;
  }
  const results = await Promise.all(orderedDocumentIds.map((documentId, sortOrder) => client().from("itinerary_item_documents").update({ sort_order: sortOrder }).eq("itinerary_item_id", itineraryItemId).eq("document_id", documentId)));
  const failure = results.find((result) => result.error)?.error; if (failure) throw failure;
}

type MapLocation = string | { label?: string; address?: string; latitude?: number | null; longitude?: number | null };

function mapDestination(location: MapLocation) {
  if (typeof location === "string") return location;
  if (typeof location.latitude === "number" && typeof location.longitude === "number") return `${location.latitude},${location.longitude}`;
  return location.address || location.label || "";
}

export function googleMapsSearchUrl(location: MapLocation) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapDestination(location))}`;
}

export function googleMapsDirectionsUrl(location: MapLocation) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapDestination(location))}`;
}

export function normalizeJoinCode(code: string) {
  return code.replace(/[^0-9A-Z]/gi, "").toUpperCase();
}

export function canEdit(role: MemberRole | undefined) {
  return role === "owner" || role === "editor";
}

export function isTravelerParticipation(type: ParticipationType) {
  return type === "traveler";
}

export async function getProfile(): Promise<{ profile: UserProfile; email: string }> {
  const actor = await userId();
  if (!navigator.onLine) {
    const cached = (await readEntityList<UserProfile & { email?: string }>("profiles")).find((profile) => profile.id === actor);
    if (!cached) throw new Error("Open Profile once while connected to keep these account details offline.");
    return { profile: cached, email: cached.email ?? "" };
  }
  const { data: authData } = await client().auth.getUser();
  const { data, error } = await client().from("profiles").select("id,display_name,home_timezone,avatar_path").eq("id", actor).single();
  if (error) throw error;
  const profile = { ...(data as UserProfile), email: authData.user?.email ?? "" };
  await cacheEntity("profiles", profile);
  return { profile, email: profile.email };
}

export async function updateProfile(input: { displayName: string; homeTimezone: string }) {
  const actor = await userId();
  if (!navigator.onLine) {
    const current = await getProfile();
    const profile = { ...current.profile, display_name: input.displayName, home_timezone: input.homeTimezone, email: current.email };
    await queueUpdate({ entityType: "profiles", table: "profiles", row: profile, patch: { display_name: input.displayName, home_timezone: input.homeTimezone } });
    return profile;
  }
  const { data, error } = await client().from("profiles").update({ display_name: input.displayName, home_timezone: input.homeTimezone }).eq("id", actor).select("id,display_name,home_timezone,avatar_path").single();
  if (error) throw error;
  const profile = data as UserProfile;
  const { data: authData } = await client().auth.getUser();
  await cacheEntity("profiles", { ...profile, email: authData.user?.email ?? "" });
  return profile;
}

export async function listNotes(tripId: string): Promise<TripNote[]> {
  return networkWithCache(`notes:${tripId}`, async () => {
    const { data, error } = await client().from("notes").select("id,trip_id,title,body,version,created_at,updated_at").eq("trip_id", tripId).is("deleted_at", null).order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as TripNote[];
  });
}

export async function addNote(input: { tripId: string; title?: string; body: string }) {
  const actor = await userId(); const now = new Date().toISOString();
  const note: TripNote = { id: crypto.randomUUID(), trip_id: input.tripId, title: input.title || null, body: input.body, created_at: now, updated_at: now };
  const row = { ...note, created_by: actor };
  if (!navigator.onLine) { await queueCreate({ entityType: `notes:${input.tripId}`, table: "notes", row }); return note; }
  const { data, error } = await client().from("notes").insert(row).select("id,trip_id,title,body,version,created_at,updated_at").single();
  if (error) throw error;
  await cacheEntity(`notes:${input.tripId}`, data as TripNote); return data as TripNote;
}

export async function updateNote(input: { note: TripNote; title?: string; body: string }) {
  const patch = { title: input.title || null, body: input.body };
  if (!navigator.onLine) { const updated = { ...input.note, ...patch, version: (input.note.version ?? 1) + 1, updated_at: new Date().toISOString() }; await queueUpdate({ entityType: `notes:${input.note.trip_id}`, table: "notes", row: updated, patch, baseVersion: input.note.version }); return updated; }
  let request = client().from("notes").update(patch).eq("id", input.note.id); if (input.note.version !== undefined) request = request.eq("version", input.note.version);
  const { data, error } = await request.select("id,trip_id,title,body,version,created_at,updated_at").maybeSingle(); if (error) throw error; if (!data) throw new Error("This note changed on another device. Refresh before saving.");
  await cacheEntity(`notes:${input.note.trip_id}`, data as TripNote); return data as TripNote;
}

export async function archiveNote(note: TripNote) {
  if (!navigator.onLine) { const profileId = await userId(); await database.entities.delete([profileId, `notes:${note.trip_id}`, note.id]); await queueDelete({ entityType: `notes:${note.trip_id}`, table: "notes", entityId: note.id }); return; }
  const { error } = await client().from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", note.id); if (error) throw error;
}
