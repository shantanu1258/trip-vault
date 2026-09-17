import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabase } from "../../lib/supabase/client";
import { database } from "../../lib/local-db/database";
import {
  ensureBlobMimeType,
  removeOfflineFile,
  storeOfflineFile
} from "../../lib/storage/offlineFiles";
import {
  cacheEntity,
  cacheEntityList,
  discardDocumentUploadOperations,
  localProfileId,
  networkWithCache,
  queueAccountDocumentUpload,
  queueCreate,
  queueDelete,
  queueDocumentAssociation,
  queueDocumentUpload,
  queueUpdate,
  queueUpsert,
  readEntityById,
  readEntityList,
  syncOutbox
} from "../sync/localSync";
import type {
  CreateCostInput,
  CreateItineraryInput,
  ItineraryItem,
  TimelineEventType
} from "../trips/types";
import { addItineraryItem, addTripCost } from "../trips/api";
import { normalizeParticipantSelection } from "../trips/participantScope";
import {
  cacheParticipantAssignments,
  queueBookingParticipantSync,
  syncBookingParticipants
} from "../trips/participantSync";
import { listAvailableAirlines } from "../metadata/publishedConfig";
import type {
  Booking,
  BookingTraveler,
  AccountDocumentUpload,
  AssociatedAccount,
  AddFlightConnectionInput,
  CreateBookingInput,
  CreateFlightInput,
  CreateJourneyInput,
  DocumentCategory,
  DocumentAssignmentMode,
  DocumentVersion,
  DocumentPurpose,
  DocumentVisibility,
  EventDocumentLink,
  FlightLeg,
  FlightTraveler,
  FlightStatus,
  JourneyLeg,
  JourneyLegDetails,
  JourneyLegTraveler,
  MemberRole,
  ParticipationType,
  Requirement,
  RequirementAssignee,
  RequirementStatus,
  RequirementType,
  RequirementInput,
  Traveler,
  TravelerManager,
  TripMember,
  TripInvitation,
  TripMembershipOffer,
  TripAirline,
  TripNote,
  UserProfile,
  UpdateBookingInput,
  UpdateJourneyLegInput,
  UpdateRequirementInput,
  VaultDocument
} from "./types";
import { findDuplicateDocument } from "./documentModel";
import { saveOptionalCreationCost } from "./creationCompletion";

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
  return networkWithCache(`travelers:${tripId}`, async () => {
    const { data, error } = await client()
      .from("travelers")
      .select("id,trip_id,display_name,is_minor,status,version,created_at")
      .eq("trip_id", tripId)
      .is("removed_at", null)
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as Traveler[];
  });
}

export async function addTraveler(input: {
  tripId: string;
  displayName: string;
  isMinor: boolean;
}): Promise<Traveler> {
  const actor = await userId();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  const traveler: Traveler = {
    id,
    trip_id: input.tripId,
    display_name: input.displayName,
    is_minor: input.isMinor,
    created_at
  };
  const row = { ...traveler, created_by: actor };
  if (!navigator.onLine) {
    await queueCreate({ entityType: `travelers:${input.tripId}`, table: "travelers", row });
    return traveler;
  }
  const { data, error } = await client()
    .from("travelers")
    .insert({
      id,
      trip_id: input.tripId,
      display_name: input.displayName,
      is_minor: input.isMinor,
      created_by: actor
    })
    .select("id,trip_id,display_name,is_minor,status,version,created_at")
    .single();
  if (error) throw error;
  await cacheEntity(`travelers:${input.tripId}`, data as Traveler);
  return data as Traveler;
}

export async function updateTraveler(input: {
  traveler: Traveler;
  displayName: string;
  isMinor: boolean;
}) {
  const patch = { display_name: input.displayName, is_minor: input.isMinor };
  if (!navigator.onLine) {
    const updated = { ...input.traveler, ...patch, version: (input.traveler.version ?? 1) + 1 };
    await queueUpdate({
      entityType: `travelers:${input.traveler.trip_id}`,
      table: "travelers",
      row: updated,
      patch,
      baseVersion: input.traveler.version
    });
    return updated;
  }
  let request = client().from("travelers").update(patch).eq("id", input.traveler.id);
  if (input.traveler.version !== undefined) request = request.eq("version", input.traveler.version);
  const { data, error } = await request
    .select("id,trip_id,display_name,is_minor,status,version,created_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This traveler changed on another device. Refresh before saving.");
  await cacheEntity(`travelers:${input.traveler.trip_id}`, data as Traveler);
  return data as Traveler;
}

export async function removeTraveler(traveler: Traveler) {
  const patch = { status: "removed", removed_at: new Date().toISOString() };
  if (!navigator.onLine) {
    const profileId = await userId();
    await database.entities.delete([profileId, `travelers:${traveler.trip_id}`, traveler.id]);
    await queueUpdate({
      entityType: `travelers:${traveler.trip_id}`,
      table: "travelers",
      row: { ...traveler, status: "removed" as const },
      patch,
      baseVersion: traveler.version
    });
    return;
  }
  const { error } = await client().from("travelers").update(patch).eq("id", traveler.id);
  if (error) throw error;
}

export async function listMembers(tripId: string): Promise<TripMember[]> {
  if (!navigator.onLine) return readEntityList<TripMember>(`members:${tripId}`);
  const { data, error } = await client()
    .from("trip_members")
    .select("user_id,role,participation_type,joined_at")
    .eq("trip_id", tripId)
    .eq("status", "active");
  if (error) throw error;
  const rows = (data ?? []) as Omit<TripMember, "display_name">[];
  if (!rows.length) return [];
  const { data: profiles } = await client()
    .from("profiles")
    .select("id,display_name")
    .in(
      "id",
      rows.map((row) => row.user_id)
    );
  const names = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile.display_name as string])
  );
  const members = rows.map((row) => ({
    ...row,
    display_name: names.get(row.user_id) ?? "Trip member"
  }));
  await cacheEntityList(
    `members:${tripId}`,
    members.map((member) => ({ ...member, id: member.user_id }))
  );
  return members;
}

export async function updateMemberRole(
  tripId: string,
  memberUserId: string,
  role: Exclude<MemberRole, "owner">
) {
  if (!navigator.onLine) throw new Error("Membership changes require a connection.");
  const { error } = await client()
    .from("trip_members")
    .update({ role })
    .eq("trip_id", tripId)
    .eq("user_id", memberUserId);
  if (error) throw error;
}

export async function removeMember(tripId: string, memberUserId: string) {
  if (!navigator.onLine) throw new Error("Membership changes require a connection.");
  const { error } = await client()
    .from("trip_members")
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .eq("trip_id", tripId)
    .eq("user_id", memberUserId);
  if (error) throw error;
}

export async function listTravelerManagers(tripId: string): Promise<TravelerManager[]> {
  return networkWithCache(`traveler-managers:${tripId}`, async () => {
    const travelers = await listTravelers(tripId);
    if (!travelers.length) return [];
    const { data, error } = await client()
      .from("traveler_managers")
      .select("traveler_id,user_id,can_view_documents,can_manage_documents,can_edit_profile")
      .in(
        "traveler_id",
        travelers.map((traveler) => traveler.id)
      )
      .is("revoked_at", null);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      id: `${row.traveler_id}:${row.user_id}`
    })) as (TravelerManager & { id: string })[];
  });
}

export async function cacheTripRelationships(
  tripId: string,
  itinerary: ItineraryItem[],
  bookings: Booking[],
  requirements: Requirement[],
  travelers: Traveler[]
) {
  if (!navigator.onLine) return;
  const [bookingRows, itineraryRows, requirementRows, accountRows] = await Promise.all([
    bookings.length
      ? client()
          .from("booking_travelers")
          .select("booking_id,traveler_id,updated_at")
          .in(
            "booking_id",
            bookings.map((item) => item.id)
          )
      : Promise.resolve({ data: [], error: null }),
    itinerary.length
      ? client()
          .from("itinerary_participants")
          .select("itinerary_item_id,traveler_id,updated_at")
          .in(
            "itinerary_item_id",
            itinerary.map((item) => item.id)
          )
      : Promise.resolve({ data: [], error: null }),
    requirements.length
      ? client()
          .from("requirement_assignees")
          .select("requirement_id,traveler_id,completed_at,updated_at")
          .in(
            "requirement_id",
            requirements.map((item) => item.id)
          )
      : Promise.resolve({ data: [], error: null }),
    travelers.length
      ? client()
          .from("traveler_accounts")
          .select("traveler_id,user_id,invitation_id,linked_at")
          .in(
            "traveler_id",
            travelers.map((item) => item.id)
          )
      : Promise.resolve({ data: [], error: null })
  ]);
  const failure = [bookingRows, itineraryRows, requirementRows, accountRows].find(
    (result) => result.error
  )?.error;
  if (failure) throw failure;
  await Promise.all([
    cacheEntityList(
      `booking-travelers:${tripId}`,
      (bookingRows.data ?? []).map((row) => ({
        ...row,
        id: `${row.booking_id}:${row.traveler_id}`
      }))
    ),
    cacheEntityList(
      `itinerary-participants:${tripId}`,
      (itineraryRows.data ?? []).map((row) => ({
        ...row,
        id: `${row.itinerary_item_id}:${row.traveler_id}`
      }))
    ),
    cacheEntityList(
      `requirement-assignees:${tripId}`,
      (requirementRows.data ?? []).map((row) => ({
        ...row,
        id: `${row.requirement_id}:${row.traveler_id}`
      }))
    ),
    cacheEntityList(
      `traveler-accounts:${tripId}`,
      (accountRows.data ?? []).map((row) => ({ ...row, id: row.traveler_id }))
    )
  ]);
}

export async function setTravelerManager(input: TravelerManager) {
  if (!navigator.onLine) throw new Error("Traveler delegation requires a connection.");
  const actor = await userId();
  const { error } = await client()
    .from("traveler_managers")
    .upsert({ ...input, assigned_by: actor, revoked_at: null });
  if (error) throw error;
}

export async function revokeTravelerManager(travelerId: string, managerUserId: string) {
  if (!navigator.onLine) throw new Error("Traveler delegation requires a connection.");
  const { error } = await client()
    .from("traveler_managers")
    .update({ revoked_at: new Date().toISOString() })
    .eq("traveler_id", travelerId)
    .eq("user_id", managerUserId);
  if (error) throw error;
}

export async function createInvitation(input: {
  tripId: string;
  targetType: "traveler" | "collaborator";
  travelerId?: string;
  role: Exclude<MemberRole, "owner">;
}) {
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
  const { data, error } = await client()
    .from("trip_invitations")
    .select("id,trip_id,target_type,traveler_id,role,expires_at,redeemed_at,revoked_at,created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TripInvitation[];
}

export async function revokeInvitation(invitationId: string) {
  if (!navigator.onLine) throw new Error("Invitation changes require a connection.");
  const { error } = await client()
    .from("trip_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .is("redeemed_at", null);
  if (error) throw error;
}

export async function redeemInvitation(code: string) {
  const { data, error } = await client().rpc("redeem_trip_invitation", { submitted_code: code });
  if (error || !data)
    throw new Error(
      "This code could not be used. Check it and ask the organizer for a new one if needed."
    );
  return String(data);
}

export async function listAssociatedAccounts(): Promise<AssociatedAccount[]> {
  if (!navigator.onLine) return [];
  const { data, error } = await client().rpc("list_associated_accounts");
  if (error) throw error;
  return (data ?? []) as AssociatedAccount[];
}

export async function createTripMembershipOffer(input: {
  tripId: string;
  userId: string;
  targetType: "traveler" | "collaborator";
  travelerId?: string;
  role: Exclude<MemberRole, "owner">;
}) {
  if (!navigator.onLine) throw new Error("Known-account invitations require a connection.");
  const { data, error } = await client().rpc("create_trip_membership_offer", {
    requested_trip_id: input.tripId,
    requested_user_id: input.userId,
    requested_target_type: input.targetType,
    requested_traveler_id: input.travelerId ?? null,
    requested_role: input.role
  });
  if (error) throw error;
  return String(data);
}

export async function listIncomingTripOffers(): Promise<TripMembershipOffer[]> {
  if (!navigator.onLine) return [];
  const { data, error } = await client().rpc("list_incoming_trip_membership_offers");
  if (error) throw error;
  return (data ?? []) as TripMembershipOffer[];
}

export async function respondToTripOffer(offerId: string, accept: boolean) {
  if (!navigator.onLine) throw new Error("Responding to an invitation requires a connection.");
  const { data, error } = await client().rpc("respond_trip_membership_offer", {
    requested_offer_id: offerId,
    accept_offer: accept
  });
  if (error) throw error;
  return data ? String(data) : null;
}

const bookingSelect =
  "id,trip_id,type,title,provider,reference_code,start_at,end_at,source_timezone,location,details,reservation_state,participant_scope,journey_scope,booked_via_name,booked_via_url,booking_vendor_catalog_key,contact_name,contact_phone,version,created_at,updated_at";

export function bookingFields(input: CreateBookingInput & { mapUrl?: string }) {
  const participants = normalizeParticipantSelection(input.participantScope, input.travelerIds);
  return {
    type: input.type,
    title: input.title,
    provider: input.provider || null,
    reference_code: input.referenceCode || null,
    start_at: input.startsAt || null,
    end_at: input.endsAt || null,
    source_timezone: input.timezone || null,
    location:
      input.location || input.mapUrl
        ? {
            label: input.location || undefined,
            address: input.location || undefined,
            map_url: input.mapUrl || undefined
          }
        : null,
    details: { ...(input.bookingDetails ?? {}), ...(input.notes ? { notes: input.notes } : {}) },
    reservation_state: input.reservationState ?? "booked",
    participant_scope: participants.participantScope,
    journey_scope: input.journeyScope || null,
    booked_via_name: input.bookedViaName || null,
    booked_via_url: input.bookedViaUrl || null,
    booking_vendor_catalog_key: input.bookingVendorCatalogKey || null,
    contact_name: input.contactName || null,
    contact_phone: input.contactPhone || null
  };
}

export async function listBookings(tripId: string): Promise<Booking[]> {
  return networkWithCache(`bookings:${tripId}`, async () => {
    const { data, error } = await client()
      .from("bookings")
      .select(bookingSelect)
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as Booking[];
  });
}

export async function getBooking(bookingId: string): Promise<Booking> {
  if (!navigator.onLine) {
    const cached = await readEntityById<Booking>("bookings:", bookingId);
    if (cached) return cached;
  }
  const { data, error } = await client()
    .from("bookings")
    .select(bookingSelect)
    .eq("id", bookingId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data as Booking;
}

export async function addBooking(input: CreateBookingInput): Promise<Booking> {
  const actor = await userId();
  const participants = normalizeParticipantSelection(input.participantScope, input.travelerIds);
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  const booking: Booking = {
    id,
    trip_id: input.tripId,
    ...bookingFields(input),
    created_at,
    updated_at: created_at
  };
  const row = { ...booking, created_by: actor };
  if (!navigator.onLine) {
    const parentOperation = await queueCreate({
      entityType: `bookings:${input.tripId}`,
      table: "bookings",
      row
    });
    for (const travelerId of participants.travelerIds)
      await queueCreate({
        entityType: `booking-travelers:${input.tripId}`,
        table: "booking_travelers",
        row: { id: `${id}:${travelerId}`, booking_id: id, traveler_id: travelerId },
        serverRow: { booking_id: id, traveler_id: travelerId },
        dependsOn: [parentOperation]
      });
    return booking;
  }
  const { data, error } = await client()
    .from("bookings")
    .insert({ id, trip_id: input.tripId, ...bookingFields(input), created_by: actor })
    .select(bookingSelect)
    .single();
  if (error) throw error;
  if (participants.travelerIds.length) {
    const { error: travelersError } = await client()
      .from("booking_travelers")
      .insert(
        participants.travelerIds.map((travelerId) => ({ booking_id: id, traveler_id: travelerId }))
      );
    if (travelersError) {
      const { error: rollbackError } = await client()
        .from("bookings")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (rollbackError)
        throw new Error(
          `Booking travelers could not be saved, and the unfinished booking could not be archived. Booking ID: ${id}. Refresh the trip before trying again.`
        );
      throw travelersError;
    }
  }
  await cacheEntity(`bookings:${input.tripId}`, data as Booking);
  return data as Booking;
}

export async function listBookingTravelerIds(bookingId: string, tripId: string): Promise<string[]> {
  const key = `booking-travelers:${tripId}`;
  if (!navigator.onLine)
    return (await readEntityList<{ booking_id: string; traveler_id: string }>(key))
      .filter((row) => row.booking_id === bookingId)
      .map((row) => row.traveler_id);
  const { data, error } = await client()
    .from("booking_travelers")
    .select("booking_id,traveler_id,updated_at")
    .eq("booking_id", bookingId);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({ ...row, id: `${row.booking_id}:${row.traveler_id}` }));
  const cached = await readEntityList<(typeof rows)[number]>(key);
  await cacheEntityList(key, [...cached.filter((row) => row.booking_id !== bookingId), ...rows]);
  return rows.map((row) => String(row.traveler_id));
}

export async function listItineraryParticipantIds(
  itineraryItemId: string,
  tripId: string
): Promise<string[]> {
  const key = `itinerary-participants:${tripId}`;
  if (!navigator.onLine)
    return (await readEntityList<{ itinerary_item_id: string; traveler_id: string }>(key))
      .filter((row) => row.itinerary_item_id === itineraryItemId)
      .map((row) => row.traveler_id);
  const { data, error } = await client()
    .from("itinerary_participants")
    .select("itinerary_item_id,traveler_id,updated_at")
    .eq("itinerary_item_id", itineraryItemId);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    ...row,
    id: `${row.itinerary_item_id}:${row.traveler_id}`
  }));
  const cached = await readEntityList<(typeof rows)[number]>(key);
  await cacheEntityList(key, [
    ...cached.filter((row) => row.itinerary_item_id !== itineraryItemId),
    ...rows
  ]);
  return rows.map((row) => String(row.traveler_id));
}

export type ItineraryParticipant = { id: string; itinerary_item_id: string; traveler_id: string };

export async function listTripItineraryParticipants(
  tripId: string,
  itineraryItemIds: string[]
): Promise<ItineraryParticipant[]> {
  const key = `itinerary-participants:${tripId}`;
  if (!navigator.onLine) return readEntityList<ItineraryParticipant>(key);
  if (!itineraryItemIds.length) {
    await cacheEntityList(key, []);
    return [];
  }
  const { data, error } = await client()
    .from("itinerary_participants")
    .select("itinerary_item_id,traveler_id,updated_at")
    .in("itinerary_item_id", itineraryItemIds);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    ...row,
    id: `${row.itinerary_item_id}:${row.traveler_id}`
  })) as ItineraryParticipant[];
  await cacheEntityList(key, rows);
  return rows;
}

export async function listTripBookingTravelers(
  tripId: string,
  bookingIds: string[]
): Promise<BookingTraveler[]> {
  const key = `booking-travelers:${tripId}`;
  if (!navigator.onLine) return readEntityList<BookingTraveler>(key);
  if (!bookingIds.length) {
    await cacheEntityList(key, []);
    return [];
  }
  const { data, error } = await client()
    .from("booking_travelers")
    .select("booking_id,traveler_id,updated_at")
    .in("booking_id", bookingIds);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    ...row,
    id: `${row.booking_id}:${row.traveler_id}`
  })) as BookingTraveler[];
  await cacheEntityList(key, rows);
  return rows;
}

export async function listTripRequirementAssignees(
  tripId: string,
  requirementIds: string[]
): Promise<RequirementAssignee[]> {
  const key = `requirement-assignees:${tripId}`;
  if (!navigator.onLine) return readEntityList<RequirementAssignee>(key);
  if (!requirementIds.length) {
    await cacheEntityList(key, []);
    return [];
  }
  const { data, error } = await client()
    .from("requirement_assignees")
    .select("requirement_id,traveler_id,completed_at,updated_at")
    .in("requirement_id", requirementIds);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    ...row,
    id: `${row.requirement_id}:${row.traveler_id}`
  })) as RequirementAssignee[];
  await cacheEntityList(key, rows);
  return rows;
}

export async function updateBooking(input: UpdateBookingInput): Promise<Booking> {
  const existing = await getBooking(input.id);
  const participants = normalizeParticipantSelection(input.participantScope, input.travelerIds);
  const fields = bookingFields(input);
  const details = { ...existing.details, ...(input.bookingDetails ?? {}) };
  if (input.notes) details.notes = input.notes;
  else delete details.notes;
  const patch = { ...fields, details };
  const { participant_scope: _participantScope, ...nonParticipantPatch } = patch;
  const currentTravelerIds = await listBookingTravelerIds(input.id, input.tripId);
  if (!navigator.onLine) {
    const previousScope =
      existing.participant_scope ?? (currentTravelerIds.length ? "selected" : "everyone");
    const scopeChanged = previousScope !== participants.participantScope;
    const updated = {
      ...existing,
      ...patch,
      version: (existing.version ?? 1) + 1 + (scopeChanged ? 1 : 0),
      updated_at: new Date().toISOString()
    };
    const parent = await queueUpdate({
      entityType: `bookings:${input.tripId}`,
      table: "bookings",
      row: updated,
      patch: nonParticipantPatch,
      baseVersion: existing.version
    });
    const linkedItems = (await readEntityList<ItineraryItem>(`itinerary:${input.tripId}`)).filter(
      (item) => item.booking_id === input.id
    );
    const appliesToAll = participants.participantScope === "everyone";
    await Promise.all(
      linkedItems.map((item) =>
        cacheEntity(
          `itinerary:${input.tripId}`,
          item.applies_to_all_travelers === appliesToAll
            ? item
            : {
                ...item,
                applies_to_all_travelers: appliesToAll,
                version: (item.version ?? 1) + 1,
                updated_at: new Date().toISOString()
              }
        )
      )
    );
    await cacheParticipantAssignments({
      tripId: input.tripId,
      bookingId: input.id,
      itineraryItemIds: linkedItems.map((item) => item.id),
      participantScope: participants.participantScope,
      travelerIds: participants.travelerIds
    });
    await queueBookingParticipantSync(
      {
        bookingId: input.id,
        participantScope: participants.participantScope,
        travelerIds: participants.travelerIds
      },
      [parent]
    );
    return updated;
  }
  let request = client().from("bookings").update(nonParticipantPatch).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select(bookingSelect).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This booking changed on another device. Refresh before saving.");
  const synchronized = await syncBookingParticipants({
    bookingId: input.id,
    participantScope: participants.participantScope,
    travelerIds: participants.travelerIds
  });
  await Promise.all([
    cacheEntity(`bookings:${input.tripId}`, synchronized.booking),
    ...synchronized.itinerary_items.map((item) => cacheEntity(`itinerary:${input.tripId}`, item)),
    cacheParticipantAssignments({
      tripId: input.tripId,
      bookingId: input.id,
      itineraryItemIds: synchronized.itinerary_items.map((item) => item.id),
      participantScope: participants.participantScope,
      travelerIds: participants.travelerIds
    })
  ]);
  return synchronized.booking;
}

export async function archiveBooking(booking: Booking) {
  if (!navigator.onLine) {
    const profileId = await userId();
    await database.entities.delete([profileId, `bookings:${booking.trip_id}`, booking.id]);
    await queueDelete({
      entityType: `bookings:${booking.trip_id}`,
      table: "bookings",
      entityId: booking.id
    });
    return;
  }
  const { error } = await client()
    .from("bookings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", booking.id);
  if (error) throw error;
}

async function ensureTripAirline(tripId: string, airlineName: string, actor: string) {
  const existing = (await listTripAirlines(tripId)).find(
    (airline) => airline.name.toLocaleLowerCase() === airlineName.toLocaleLowerCase()
  );
  if (existing) return { id: existing.id, operationId: undefined as string | undefined };
  const selected = (await listAvailableAirlines()).find(
    (airline) => airline.name.toLocaleLowerCase() === airlineName.toLocaleLowerCase()
  );
  const id = crypto.randomUUID();
  const row = {
    id,
    trip_id: tripId,
    name: airlineName,
    iata_code: selected?.iataCode ?? null,
    icao_code: selected?.icaoCode ?? null,
    tracker_url_template: selected?.trackerUrlTemplate ?? null,
    status_url_template: selected?.statusUrlTemplate ?? null,
    check_in_url_template: selected?.checkInUrlTemplate ?? null,
    manage_booking_url_template: selected?.manageBookingUrlTemplate ?? null,
    brand_color: selected?.brandColor ?? null,
    logo_asset_key: selected?.logoAssetPath ?? null,
    banner_asset_key: selected?.bannerAssetPath ?? null,
    metadata_source: selected
      ? selected.sourceVersion
        ? "published_catalog"
        : "bundled_fallback"
      : "manual",
    source_catalog_key: selected?.stableKey ?? null,
    source_config_version: selected?.sourceVersion || null,
    created_by: actor
  };
  if (!navigator.onLine)
    return {
      id,
      operationId: await queueCreate({
        entityType: `trip-airlines:${tripId}`,
        table: "trip_airlines",
        row
      })
    };
  const { error } = await client().from("trip_airlines").insert(row);
  if (error) throw error;
  return { id, operationId: undefined as string | undefined };
}

/**
 * Saves an optional cost after its event has already been created. Any failure is
 * returned as a completion warning so callers never encourage a duplicate event
 * retry. Offline, the cost waits for every booking/itinerary row it references.
 */
export async function saveOptionalCostForCreatedEvent(
  input: CreateCostInput
): Promise<string | undefined> {
  return saveOptionalCreationCost(async () => {
    const dependsOn = [...(input.dependsOn ?? [])];
    if (!navigator.onLine) {
      for (const entityId of [input.bookingId, input.itineraryItemId]) {
        if (!entityId) continue;
        const operation = await database.outbox
          .where("entityId")
          .equals(entityId)
          .filter((row) => row.operation === "create")
          .first();
        if (operation?.operationId) dependsOn.push(operation.operationId);
      }
    }
    await addTripCost({ ...input, dependsOn: [...new Set(dependsOn)] });
  });
}

type JourneyTimelineTiming = Pick<
  CreateItineraryInput,
  | "startsAt"
  | "endsAt"
  | "timezone"
  | "timingMode"
  | "scheduledDate"
  | "anchorItineraryItemId"
  | "relativePosition"
  | "isAllDay"
  | "hasExplicitStartTime"
  | "durationMinutes"
>;

export function journeyTimelineFields(
  timing: JourneyTimelineTiming | undefined,
  fallback: Pick<CreateItineraryInput, "startsAt" | "endsAt" | "timezone">
): JourneyTimelineTiming {
  return timing ?? fallback;
}

export async function addFlightBooking(input: CreateFlightInput): Promise<{
  booking: Booking;
  flights: FlightLeg[];
  itinerary: ItineraryItem;
  costWarning?: string;
}> {
  if (!input.referenceCode.trim()) throw new Error("Enter the PNR / booking reference.");
  if (!input.legs.length) throw new Error("Add at least one flight leg.");
  const participants = normalizeParticipantSelection(input.participantScope, input.travelerIds);
  const referencedTravelerIds = [
    ...new Set([
      ...participants.travelerIds,
      ...input.legs.flatMap((leg) =>
        (leg.travelerAllocations ?? []).map((allocation) => allocation.travelerId)
      )
    ])
  ];
  if (referencedTravelerIds.length) {
    const tripTravelerIds = new Set(
      (await listTravelers(input.tripId)).map((traveler) => traveler.id)
    );
    if (referencedTravelerIds.some((travelerId) => !tripTravelerIds.has(travelerId)))
      throw new Error("Every selected flight traveler must belong to this trip.");
  }
  for (const leg of input.legs) {
    const allocatedIds = (leg.travelerAllocations ?? []).map((allocation) => allocation.travelerId);
    if (new Set(allocatedIds).size !== allocatedIds.length)
      throw new Error("Each traveler can have only one allocation per flight leg.");
    if (
      participants.participantScope === "selected" &&
      allocatedIds.some((id) => !participants.travelerIds.includes(id))
    ) {
      throw new Error("Flight allocations must belong to a selected traveler.");
    }
  }
  const actor = await userId();
  const first = input.legs[0];
  const last = input.legs[input.legs.length - 1];
  const booking = await addBooking({
    tripId: input.tripId,
    type: "flight",
    title: input.title,
    provider: [...new Set(input.legs.map((leg) => leg.airlineName))].join(" / "),
    referenceCode: input.referenceCode,
    startsAt: first.departureAt,
    endsAt: last.arrivalAt,
    timezone: first.departureTimezone,
    reservationState: input.reservationState,
    participantScope: participants.participantScope,
    journeyScope: input.journeyScope,
    bookedViaName: input.bookedViaName,
    bookedViaUrl: input.bookedViaUrl,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    travelerIds: participants.travelerIds
  });
  const bookingOperation = !navigator.onLine
    ? await database.outbox
        .where("entityId")
        .equals(booking.id)
        .filter((operation) => operation.operation === "create")
        .first()
    : undefined;
  const airlineRefs = new Map<string, Awaited<ReturnType<typeof ensureTripAirline>>>();
  for (const leg of input.legs)
    if (!airlineRefs.has(leg.airlineName.toLocaleLowerCase()))
      airlineRefs.set(
        leg.airlineName.toLocaleLowerCase(),
        await ensureTripAirline(input.tripId, leg.airlineName, actor)
      );
  const now = new Date().toISOString();
  const flights: FlightLeg[] = input.legs.map((leg, segmentOrder) => ({
    id: crypto.randomUUID(),
    booking_id: booking.id,
    segment_order: segmentOrder,
    airline_name: leg.airlineName,
    marketing_airline_id: airlineRefs.get(leg.airlineName.toLocaleLowerCase())?.id ?? null,
    operating_airline_id: null,
    flight_number: leg.flightNumber,
    departure_airport_code: leg.departureCode || null,
    departure_airport_name: leg.departureName,
    departure_country_code: leg.departureCountryCode || null,
    arrival_airport_code: leg.arrivalCode || null,
    arrival_airport_name: leg.arrivalName,
    arrival_country_code: leg.arrivalCountryCode || null,
    scheduled_departure_at: leg.departureAt,
    scheduled_arrival_at: leg.arrivalAt,
    estimated_departure_at: null,
    estimated_arrival_at: null,
    actual_departure_at: null,
    actual_arrival_at: null,
    departure_timezone: leg.departureTimezone,
    arrival_timezone: leg.arrivalTimezone,
    boarding_at: leg.boardingAt || null,
    boarding_lead_minutes: leg.boardingLeadMinutes ?? null,
    journey_scope: input.journeyScope,
    departure_terminal: leg.departureTerminal || null,
    departure_gate: leg.departureGate || null,
    arrival_terminal: leg.arrivalTerminal || null,
    arrival_gate: null,
    baggage_claim: null,
    status: "scheduled",
    status_note: null,
    status_updated_by: actor,
    status_updated_at: now
  }));
  const allocationRowsForLeg = (flight: FlightLeg) => {
    const supplied = new Map(
      (input.legs[flight.segment_order]?.travelerAllocations ?? []).map((allocation) => [
        allocation.travelerId,
        allocation
      ])
    );
    const travelerIds = [...new Set([...participants.travelerIds, ...supplied.keys()])];
    return travelerIds.map((travelerId): FlightTraveler => {
      const allocation = supplied.get(travelerId);
      return {
        id: `${flight.id}:${travelerId}`,
        flight_leg_id: flight.id,
        traveler_id: travelerId,
        seat: allocation?.seat || null,
        boarding_group: allocation?.boardingGroup || null,
        ticket_number: allocation?.ticketNumber || null
      };
    });
  };
  const flightOperationIds: string[] = [];
  if (!navigator.onLine) {
    for (const flight of flights) {
      const airlineOperation = airlineRefs.get(
        flight.airline_name.toLocaleLowerCase()
      )?.operationId;
      const flightOperation = await queueCreate({
        entityType: `flights:${input.tripId}`,
        table: "flight_legs",
        row: flight,
        dependsOn: [bookingOperation?.operationId, airlineOperation].filter((id): id is string =>
          Boolean(id)
        )
      });
      flightOperationIds.push(flightOperation);
      for (const allocation of allocationRowsForLeg(flight))
        await queueCreate({
          entityType: `flight-travelers:${flight.id}`,
          table: "flight_leg_travelers",
          row: allocation,
          serverRow: {
            flight_leg_id: flight.id,
            traveler_id: allocation.traveler_id,
            seat: allocation.seat,
            boarding_group: allocation.boarding_group,
            ticket_number: allocation.ticket_number
          },
          dependsOn: [flightOperation]
        });
    }
  } else {
    const { data, error } = await client().from("flight_legs").insert(flights).select("*");
    if (error) throw error;
    flights.splice(0, flights.length, ...((data ?? []) as FlightLeg[]));
    const allocations = flights.flatMap(allocationRowsForLeg);
    if (allocations.length) {
      const { error: travelerError } = await client()
        .from("flight_leg_travelers")
        .insert(allocations.map(({ id: _id, ...row }) => row));
      if (travelerError) throw travelerError;
    }
    await Promise.all(flights.map((flight) => cacheEntity(`flights:${input.tripId}`, flight)));
    await Promise.all(
      flights.map((flight) =>
        cacheEntityList(
          `flight-travelers:${flight.id}`,
          allocations.filter((row) => row.flight_leg_id === flight.id)
        )
      )
    );
  }
  const itinerary = await addItineraryItem({
    tripId: input.tripId,
    bookingId: booking.id,
    eventType: "flight",
    title: input.title,
    startsAt: first.departureAt,
    endsAt: last.arrivalAt,
    timezone: first.departureTimezone,
    participantScope: participants.participantScope,
    travelerIds: participants.travelerIds,
    dependsOn: [bookingOperation?.operationId, ...flightOperationIds].filter((id): id is string =>
      Boolean(id)
    )
  });
  const costWarning = input.cost
    ? await saveOptionalCostForCreatedEvent({
        tripId: input.tripId,
        bookingId: booking.id,
        itineraryItemId: itinerary.id,
        title: input.cost.title,
        category: "flight",
        amountMinor: input.cost.amountMinor,
        currencyCode: input.cost.currencyCode,
        paymentStatus: input.cost.paymentStatus,
        paidByTravelerId: input.cost.paidByTravelerId,
        participantTravelerIds: input.cost.participantTravelerIds
      })
    : undefined;
  return { booking, flights, itinerary, costWarning };
}

export async function addFlightConnection(input: AddFlightConnectionInput): Promise<FlightLeg> {
  if (!navigator.onLine)
    throw new Error("Adding a connection currently requires a connection to Supabase.");
  const actor = await userId();
  const airline = await ensureTripAirline(input.tripId, input.airlineName, actor);
  const { data, error } = await client().rpc("add_flight_connection", {
    requested_booking_id: input.bookingId,
    requested_leg: {
      airline_name: input.airlineName,
      marketing_airline_id: airline.id,
      flight_number: input.flightNumber,
      departure_airport_code: input.departureCode || null,
      departure_airport_name: input.departureName,
      departure_country_code: input.departureCountryCode || null,
      arrival_airport_code: input.arrivalCode || null,
      arrival_airport_name: input.arrivalName,
      arrival_country_code: input.arrivalCountryCode || null,
      scheduled_departure_at: input.departureAt,
      scheduled_arrival_at: input.arrivalAt,
      departure_timezone: input.departureTimezone,
      arrival_timezone: input.arrivalTimezone,
      boarding_lead_minutes: input.boardingLeadMinutes ?? null,
      journey_scope: input.journeyScope
    }
  });
  if (error) throw error;
  const created = await getFlightLeg(String(data));
  const cached = await readEntityList<FlightLeg>(`flights:${input.tripId}`);
  await cacheEntityList(`flights:${input.tripId}`, [
    ...cached.filter((leg) => leg.id !== created.id),
    created
  ]);
  return created;
}

const optionalText = z.string().optional();
const journeyDetailSchemas = {
  train: z
    .object({
      kind: z.literal("train"),
      train_name: optionalText,
      booked_from_name: optionalText,
      booked_from_code: optionalText,
      travel_class: optionalText,
      quota: optionalText,
      booking_status: optionalText,
      current_status: optionalText
    })
    .strict(),
  bus: z
    .object({
      kind: z.literal("bus"),
      bus_class_or_layout: optionalText,
      shared_ticket_number: optionalText,
      boarding_point_details: optionalText,
      dropoff_point_details: optionalText
    })
    .strict(),
  ferry: z
    .object({
      kind: z.literal("ferry"),
      direction: z.enum(["one_way", "outbound", "return"]).optional(),
      ticket_timing: z.enum(["fixed", "open_date", "open_return"]).optional(),
      seating: z.enum(["free", "assigned", "unknown"]).optional(),
      seller_reference: optionalText,
      operator_reference: optionalText,
      accommodation: optionalText,
      vessel_name: optionalText,
      departure_gate: optionalText,
      baggage_allowance: optionalText,
      related_sailing_id: optionalText,
      vehicle: z
        .object({
          type: optionalText,
          registration: optionalText,
          length_cm: z.number().nonnegative().optional(),
          height_cm: z.number().nonnegative().optional()
        })
        .strict()
        .optional()
    })
    .strict(),
  cab: z
    .object({
      kind: z.literal("cab"),
      ride_type: z.enum(["local", "airport_transfer", "outstation", "hourly"]),
      cross_border: z.boolean().optional(),
      linked_flight_leg_id: z.string().uuid().optional(),
      pickup_buffer_minutes: z.number().nonnegative().optional(),
      luggage_count: z.number().nonnegative().optional(),
      pickup_instructions: optionalText,
      vehicle_class: optionalText,
      driver_name: optionalText,
      driver_phone: optionalText,
      vehicle_registration: optionalText,
      trip_shape: z.enum(["one_way", "round_trip"]).optional(),
      return_at: optionalText,
      package_duration_minutes: z.number().nonnegative().optional(),
      final_dropoff: optionalText
    })
    .strict()
};

export function normalizeJourneyLegDetails(
  mode: CreateJourneyInput["mode"],
  details?: JourneyLegDetails
): JourneyLegDetails {
  const normalized =
    details ??
    (mode === "cab" ? { kind: "cab", ride_type: "local" } : ({ kind: mode } as JourneyLegDetails));
  if (normalized.kind !== mode)
    throw new Error(`Journey details for ${normalized.kind} cannot be used for ${mode}.`);
  const parsed = journeyDetailSchemas[mode].safeParse(normalized);
  if (!parsed.success)
    throw new Error(
      `Check the ${mode} ticket details: ${parsed.error.issues[0]?.message ?? "invalid details"}.`
    );
  return parsed.data as JourneyLegDetails;
}

export async function addJourneyBooking(
  input: CreateJourneyInput & { itineraryTiming?: JourneyTimelineTiming }
): Promise<{
  booking: Booking;
  legs: JourneyLeg[];
  itinerary: ItineraryItem;
  costWarning?: string;
}> {
  if (!input.legs.length) throw new Error("Add at least one journey leg.");
  if (input.mode === "cab" && input.legs.length > 1)
    throw new Error("Create each cab ride as a separate journey.");
  const participants = normalizeParticipantSelection(input.participantScope, input.travelerIds);
  const referencedTravelerIds = [
    ...new Set([
      ...participants.travelerIds,
      ...input.legs.flatMap((leg) =>
        (leg.travelerAllocations ?? []).map((allocation) => allocation.travelerId)
      )
    ])
  ];
  if (referencedTravelerIds.length) {
    const tripTravelerIds = new Set(
      (await listTravelers(input.tripId)).map((traveler) => traveler.id)
    );
    if (referencedTravelerIds.some((travelerId) => !tripTravelerIds.has(travelerId)))
      throw new Error("Every selected journey traveler must belong to this trip.");
  }
  for (const leg of input.legs) {
    normalizeJourneyLegDetails(input.mode, leg.details);
    const allocatedIds = (leg.travelerAllocations ?? []).map((allocation) => allocation.travelerId);
    if (new Set(allocatedIds).size !== allocatedIds.length)
      throw new Error("Each traveler can have only one allocation per journey leg.");
    if (
      participants.participantScope === "selected" &&
      allocatedIds.some((id) => !participants.travelerIds.includes(id))
    ) {
      throw new Error("Journey allocations must belong to a selected traveler.");
    }
  }
  const first = input.legs[0];
  const last = input.legs[input.legs.length - 1];
  const operators = [
    ...new Set(
      input.legs.flatMap((leg) => (leg.operatorName?.trim() ? [leg.operatorName.trim()] : []))
    )
  ];
  const booking = await addBooking({
    tripId: input.tripId,
    type: input.mode,
    title: input.title,
    provider: operators.join(" / ") || undefined,
    referenceCode: input.referenceCode,
    startsAt: first.departureAt,
    endsAt: last.arrivalAt,
    timezone: first.originTimezone,
    reservationState: input.reservationState,
    participantScope: participants.participantScope,
    journeyScope: input.journeyScope,
    bookedViaName: input.bookedViaName,
    bookedViaUrl: input.bookedViaUrl,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    bookingDetails: input.bookingDetails,
    travelerIds: participants.travelerIds
  });
  const bookingOperation = !navigator.onLine
    ? await database.outbox
        .where("entityId")
        .equals(booking.id)
        .filter((operation) => operation.operation === "create")
        .first()
    : undefined;
  const legs: JourneyLeg[] = input.legs.map((leg, segmentOrder) => ({
    id: crypto.randomUUID(),
    booking_id: booking.id,
    segment_order: segmentOrder,
    mode: input.mode,
    operator_name: leg.operatorName?.trim() || null,
    service_number: leg.serviceNumber || null,
    origin_code: leg.originCode || null,
    origin_name: leg.originName,
    origin_country_code: leg.originCountryCode || null,
    origin_timezone: leg.originTimezone,
    destination_code: leg.destinationCode || null,
    destination_name: leg.destinationName,
    destination_country_code: leg.destinationCountryCode || null,
    destination_timezone: leg.destinationTimezone,
    scheduled_departure_at: leg.departureAt,
    scheduled_arrival_at: leg.arrivalAt || null,
    boarding_at: leg.boardingAt || null,
    boarding_lead_minutes: leg.boardingLeadMinutes ?? null,
    departure_platform: leg.departurePlatform || null,
    arrival_platform: leg.arrivalPlatform || null,
    coach_or_cabin: null,
    seat: null,
    details: normalizeJourneyLegDetails(input.mode, leg.details),
    status_note: null
  }));
  const allocationRowsForLeg = (journeyLeg: JourneyLeg) => {
    const supplied = new Map(
      (input.legs[journeyLeg.segment_order]?.travelerAllocations ?? []).map((allocation) => [
        allocation.travelerId,
        allocation
      ])
    );
    const travelerIds = [...new Set([...participants.travelerIds, ...supplied.keys()])];
    return travelerIds.map((travelerId): JourneyLegTraveler => {
      const allocation = supplied.get(travelerId);
      return {
        id: `${journeyLeg.id}:${travelerId}`,
        journey_leg_id: journeyLeg.id,
        traveler_id: travelerId,
        seat_or_berth: allocation?.seatOrBerth || null,
        coach_or_cabin: allocation?.coachOrCabin || null,
        passenger_reference: allocation?.passengerReference || null
      };
    });
  };
  const operationIds: string[] = [];
  if (!navigator.onLine) {
    for (const leg of legs) {
      const legOperation = await queueCreate({
        entityType: `journey-legs:${input.tripId}`,
        table: "journey_legs",
        row: leg,
        dependsOn: [bookingOperation?.operationId].filter((id): id is string => Boolean(id))
      });
      operationIds.push(legOperation);
      for (const allocation of allocationRowsForLeg(leg))
        await queueCreate({
          entityType: `journey-leg-travelers:${input.tripId}`,
          table: "journey_leg_travelers",
          row: allocation,
          serverRow: {
            journey_leg_id: leg.id,
            traveler_id: allocation.traveler_id,
            seat_or_berth: allocation.seat_or_berth,
            coach_or_cabin: allocation.coach_or_cabin,
            passenger_reference: allocation.passenger_reference
          },
          dependsOn: [legOperation]
        });
    }
  } else {
    const { data, error } = await client().from("journey_legs").insert(legs).select("*");
    if (error) throw error;
    legs.splice(0, legs.length, ...((data ?? []) as JourneyLeg[]));
    const allocations = legs.flatMap(allocationRowsForLeg);
    if (allocations.length) {
      const { error: travelerError } = await client()
        .from("journey_leg_travelers")
        .insert(allocations.map(({ id: _id, ...row }) => row));
      if (travelerError) throw travelerError;
    }
    await Promise.all([
      ...legs.map((leg) => cacheEntity(`journey-legs:${input.tripId}`, leg)),
      ...allocations.map((allocation) =>
        cacheEntity(`journey-leg-travelers:${input.tripId}`, allocation)
      )
    ]);
  }
  const itineraryTiming = journeyTimelineFields(input.itineraryTiming, {
    startsAt: first.departureAt,
    endsAt: last.arrivalAt,
    timezone: first.originTimezone
  });
  const itinerary = await addItineraryItem({
    tripId: input.tripId,
    bookingId: booking.id,
    eventType: input.mode,
    title: input.title,
    ...itineraryTiming,
    participantScope: participants.participantScope,
    travelerIds: participants.travelerIds,
    dependsOn: [bookingOperation?.operationId, ...operationIds].filter((id): id is string =>
      Boolean(id)
    )
  });
  const costWarning = input.cost
    ? await saveOptionalCostForCreatedEvent({
        tripId: input.tripId,
        bookingId: booking.id,
        itineraryItemId: itinerary.id,
        title: input.cost.title,
        category: "transport",
        amountMinor: input.cost.amountMinor,
        currencyCode: input.cost.currencyCode,
        paymentStatus: input.cost.paymentStatus,
        paidByTravelerId: input.cost.paidByTravelerId,
        participantTravelerIds: input.cost.participantTravelerIds
      })
    : undefined;
  return { booking, legs, itinerary, costWarning };
}

export async function listJourneyLegTravelers(
  journeyLegId: string,
  tripId: string
): Promise<JourneyLegTraveler[]> {
  const key = `journey-leg-travelers:${tripId}`;
  if (!navigator.onLine)
    return (await readEntityList<JourneyLegTraveler>(key)).filter(
      (row) => row.journey_leg_id === journeyLegId
    );
  const { data, error } = await client()
    .from("journey_leg_travelers")
    .select(
      "journey_leg_id,traveler_id,seat_or_berth,coach_or_cabin,passenger_reference,updated_at"
    )
    .eq("journey_leg_id", journeyLegId);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    ...row,
    id: `${row.journey_leg_id}:${row.traveler_id}`
  })) as JourneyLegTraveler[];
  const cached = await readEntityList<JourneyLegTraveler>(key);
  await cacheEntityList(key, [
    ...cached.filter((row) => row.journey_leg_id !== journeyLegId),
    ...rows
  ]);
  return rows;
}

export async function listJourneyLegTravelersForTrip(
  tripId: string,
  journeyLegIds: string[]
): Promise<JourneyLegTraveler[]> {
  const key = `journey-leg-travelers:${tripId}`;
  if (!navigator.onLine) return readEntityList<JourneyLegTraveler>(key);
  if (!journeyLegIds.length) {
    await cacheEntityList(key, []);
    return [];
  }
  const { data, error } = await client()
    .from("journey_leg_travelers")
    .select(
      "journey_leg_id,traveler_id,seat_or_berth,coach_or_cabin,passenger_reference,updated_at"
    )
    .in("journey_leg_id", journeyLegIds);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    ...row,
    id: `${row.journey_leg_id}:${row.traveler_id}`
  })) as JourneyLegTraveler[];
  await cacheEntityList(key, rows);
  return rows;
}

export async function setJourneyLegTravelerDetails(input: {
  tripId: string;
  journeyLegId: string;
  travelerId: string;
  seatOrBerth?: string;
  coachOrCabin?: string;
  passengerReference?: string;
}) {
  const row: JourneyLegTraveler = {
    id: `${input.journeyLegId}:${input.travelerId}`,
    journey_leg_id: input.journeyLegId,
    traveler_id: input.travelerId,
    seat_or_berth: input.seatOrBerth || null,
    coach_or_cabin: input.coachOrCabin || null,
    passenger_reference: input.passengerReference || null
  };
  const serverRow = {
    journey_leg_id: input.journeyLegId,
    traveler_id: input.travelerId,
    seat_or_berth: row.seat_or_berth,
    coach_or_cabin: row.coach_or_cabin,
    passenger_reference: row.passenger_reference
  };
  if (!navigator.onLine) {
    await queueUpsert({
      entityType: `journey-leg-travelers:${input.tripId}`,
      table: "journey_leg_travelers",
      row,
      serverRow
    });
    return row;
  }
  const { data, error } = await client()
    .from("journey_leg_travelers")
    .upsert(serverRow)
    .select(
      "journey_leg_id,traveler_id,seat_or_berth,coach_or_cabin,passenger_reference,updated_at"
    )
    .single();
  if (error) throw error;
  const saved = { ...data, id: `${data.journey_leg_id}:${data.traveler_id}` } as JourneyLegTraveler;
  await cacheEntity(`journey-leg-travelers:${input.tripId}`, saved);
  return saved;
}

export async function listFlightTravelers(flightLegId: string): Promise<FlightTraveler[]> {
  return networkWithCache(`flight-travelers:${flightLegId}`, async () => {
    const { data, error } = await client()
      .from("flight_leg_travelers")
      .select("flight_leg_id,traveler_id,seat,boarding_group,ticket_number")
      .eq("flight_leg_id", flightLegId);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      id: `${row.flight_leg_id}:${row.traveler_id}`
    })) as FlightTraveler[];
  });
}

export async function listTripFlightTravelers(
  tripId: string,
  flightLegIds: string[]
): Promise<FlightTraveler[]> {
  const key = `flight-travelers:${tripId}`;
  if (!navigator.onLine) {
    const perLeg = (
      await Promise.all(
        flightLegIds.map((flightLegId) =>
          readEntityList<FlightTraveler>(`flight-travelers:${flightLegId}`)
        )
      )
    ).flat();
    if (perLeg.length || !flightLegIds.length) return perLeg;
    return readEntityList<FlightTraveler>(key);
  }
  if (!flightLegIds.length) {
    await cacheEntityList(key, []);
    return [];
  }
  const { data, error } = await client()
    .from("flight_leg_travelers")
    .select("flight_leg_id,traveler_id,seat,boarding_group,ticket_number")
    .in("flight_leg_id", flightLegIds);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    ...row,
    id: `${row.flight_leg_id}:${row.traveler_id}`
  })) as FlightTraveler[];
  await Promise.all([
    cacheEntityList(key, rows),
    ...flightLegIds.map((flightLegId) =>
      cacheEntityList(
        `flight-travelers:${flightLegId}`,
        rows.filter((row) => row.flight_leg_id === flightLegId)
      )
    )
  ]);
  return rows;
}

export async function setFlightTravelerDetails(input: {
  tripId: string;
  flightLegId: string;
  travelerId: string;
  seat?: string;
  boardingGroup?: string;
  ticketNumber?: string;
}) {
  const row: FlightTraveler = {
    id: `${input.flightLegId}:${input.travelerId}`,
    flight_leg_id: input.flightLegId,
    traveler_id: input.travelerId,
    seat: input.seat || null,
    boarding_group: input.boardingGroup || null,
    ticket_number: input.ticketNumber || null
  };
  const serverRow = {
    flight_leg_id: input.flightLegId,
    traveler_id: input.travelerId,
    seat: row.seat,
    boarding_group: row.boarding_group,
    ticket_number: row.ticket_number
  };
  if (!navigator.onLine) {
    await queueUpsert({
      entityType: `flight-travelers:${input.flightLegId}`,
      table: "flight_leg_travelers",
      row,
      serverRow
    });
    await cacheEntity(`flight-travelers:${input.tripId}`, row);
    return row;
  }
  const { data, error } = await client()
    .from("flight_leg_travelers")
    .upsert(serverRow)
    .select("flight_leg_id,traveler_id,seat,boarding_group,ticket_number")
    .single();
  if (error) throw error;
  const result = { ...data, id: `${data.flight_leg_id}:${data.traveler_id}` } as FlightTraveler;
  await Promise.all([
    cacheEntity(`flight-travelers:${input.flightLegId}`, result),
    cacheEntity(`flight-travelers:${input.tripId}`, result)
  ]);
  return result;
}

export async function listFlightLegsForTrip(
  tripId: string,
  knownBookings?: Booking[]
): Promise<FlightLeg[]> {
  return networkWithCache(`flights:${tripId}`, async () => {
    const bookings = knownBookings ?? (await listBookings(tripId));
    const flightIds = bookings
      .filter((booking) => booking.type === "flight")
      .map((booking) => booking.id);
    if (!flightIds.length) return [];
    const { data, error } = await client()
      .from("flight_legs")
      .select("*")
      .in("booking_id", flightIds)
      .is("deleted_at", null)
      .order("scheduled_departure_at");
    if (error) throw error;
    return (data ?? []) as FlightLeg[];
  });
}

export async function listFlightLegsForBooking(
  bookingId: string,
  tripId: string
): Promise<FlightLeg[]> {
  if (!navigator.onLine)
    return (await readEntityList<FlightLeg>(`flights:${tripId}`))
      .filter((leg) => leg.booking_id === bookingId)
      .sort((a, b) => a.segment_order - b.segment_order);
  const { data, error } = await client()
    .from("flight_legs")
    .select("*")
    .eq("booking_id", bookingId)
    .is("deleted_at", null)
    .order("segment_order");
  if (error) throw error;
  const rows = (data ?? []) as FlightLeg[];
  const cached = await readEntityList<FlightLeg>(`flights:${tripId}`);
  await cacheEntityList(`flights:${tripId}`, [
    ...cached.filter((leg) => leg.booking_id !== bookingId),
    ...rows
  ]);
  return rows;
}

export async function listJourneyLegsForTrip(
  tripId: string,
  knownBookings?: Booking[]
): Promise<JourneyLeg[]> {
  return networkWithCache(`journey-legs:${tripId}`, async () => {
    const bookings = knownBookings ?? (await listBookings(tripId));
    const ids = bookings
      .filter((booking) => ["train", "bus", "ferry", "cab"].includes(booking.type))
      .map((booking) => booking.id);
    if (!ids.length) return [];
    const { data, error } = await client()
      .from("journey_legs")
      .select("*")
      .in("booking_id", ids)
      .is("deleted_at", null)
      .order("scheduled_departure_at");
    if (error) throw error;
    return (data ?? []) as JourneyLeg[];
  });
}

export async function listJourneyLegsForBooking(
  bookingId: string,
  tripId: string
): Promise<JourneyLeg[]> {
  if (!navigator.onLine)
    return (await readEntityList<JourneyLeg>(`journey-legs:${tripId}`))
      .filter((leg) => leg.booking_id === bookingId)
      .sort((a, b) => a.segment_order - b.segment_order);
  const { data, error } = await client()
    .from("journey_legs")
    .select("*")
    .eq("booking_id", bookingId)
    .is("deleted_at", null)
    .order("segment_order");
  if (error) throw error;
  const rows = (data ?? []) as JourneyLeg[];
  const cached = await readEntityList<JourneyLeg>(`journey-legs:${tripId}`);
  await cacheEntityList(`journey-legs:${tripId}`, [
    ...cached.filter((leg) => leg.booking_id !== bookingId),
    ...rows
  ]);
  return rows;
}

export async function updateJourneyLeg(
  input: UpdateJourneyLegInput
): Promise<{ leg: JourneyLeg; booking: Booking; itinerary: ItineraryItem[] }> {
  if (!navigator.onLine)
    throw new Error(
      "Reconnect to edit this journey connection. Its route, booking summary, and timeline are saved together."
    );
  const details = normalizeJourneyLegDetails(input.details.kind, input.details);
  const { data, error } = await client().rpc("save_journey_leg_with_timing", {
    requested_leg_id: input.legId,
    requested_leg: {
      ...(input.version === undefined ? {} : { version: input.version }),
      operator_name: input.operatorName?.trim() || null,
      service_number: input.serviceNumber?.trim() || null,
      origin_code: input.originCode?.trim().toUpperCase() || null,
      origin_name: input.originName.trim(),
      origin_country_code: input.originCountryCode?.trim().toUpperCase() || null,
      origin_timezone: input.originTimezone,
      destination_code: input.destinationCode?.trim().toUpperCase() || null,
      destination_name: input.destinationName.trim(),
      destination_country_code: input.destinationCountryCode?.trim().toUpperCase() || null,
      destination_timezone: input.destinationTimezone,
      scheduled_departure_at: input.departureAt,
      scheduled_arrival_at: input.arrivalAt || null,
      boarding_at: input.boardingAt || null,
      boarding_lead_minutes: input.boardingLeadMinutes ?? null,
      departure_platform: input.departurePlatform?.trim() || null,
      arrival_platform: input.arrivalPlatform?.trim() || null,
      details
    },
    requested_itinerary_timing: input.itineraryTiming
      ? {
          timing_mode: input.itineraryTiming.timingMode,
          anchor_itinerary_item_id: input.itineraryTiming.anchorItineraryItemId ?? null,
          relative_position: input.itineraryTiming.relativePosition ?? null
        }
      : null,
    requested_event_timezone: input.eventTimezone ?? null
  });
  if (error) throw error;
  const result = data as {
    leg?: JourneyLeg;
    booking?: Booking;
    itinerary_items?: ItineraryItem[];
  } | null;
  if (!result?.leg || !result.booking)
    throw new Error("Supabase did not return the saved journey connection.");
  const itinerary = result.itinerary_items ?? [];
  await Promise.all([
    cacheEntity(`journey-legs:${input.tripId}`, result.leg),
    cacheEntity(`bookings:${input.tripId}`, result.booking),
    ...itinerary.map((item) => cacheEntity(`itinerary:${input.tripId}`, item))
  ]);
  return { leg: result.leg, booking: result.booking, itinerary };
}

export type BookedTimelineEventInput = CreateBookingInput & {
  eventType: TimelineEventType;
  mapUrl?: string;
  timingMode?: import("../trips/types").EventTimingMode;
  scheduledDate?: string;
  anchorItineraryItemId?: string;
  relativePosition?: "before" | "after";
  isAllDay?: boolean;
  hasExplicitStartTime?: boolean;
  durationMinutes?: number;
  hotelCheckInHasTime?: boolean;
  hotelCheckoutHasTime?: boolean;
  cost?: {
    title: string;
    amountMinor: number;
    currencyCode: string;
    paymentStatus: "planned" | "paid";
    paidByTravelerId?: string;
    participantTravelerIds?: string[];
  };
};

export function bookingInputForTimelineEvent(input: BookedTimelineEventInput): CreateBookingInput {
  if (input.type === "hotel" || input.hasExplicitStartTime !== false) return input;
  const bookingInput = { ...input };
  delete bookingInput.startsAt;
  delete bookingInput.endsAt;
  delete bookingInput.timezone;
  return bookingInput;
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

export async function saveHotelStay(
  input: BookedTimelineEventInput & { bookingId?: string; version?: number }
) {
  if (!navigator.onLine)
    throw new Error("Saving hotel milestones atomically requires a connection.");
  if (!input.startsAt || !input.endsAt || !input.timezone)
    throw new Error("Hotel check-in, checkout, and local timezone are required.");
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime())
    throw new Error("Hotel checkout must be after check-in.");
  const participants = normalizeParticipantSelection(input.participantScope, input.travelerIds);
  const bookingId = input.bookingId ?? crypto.randomUUID();
  const checkInId = crypto.randomUUID();
  const checkOutId = crypto.randomUUID();
  const fields = bookingFields({
    ...input,
    type: "hotel",
    participantScope: participants.participantScope,
    travelerIds: participants.travelerIds
  });
  const location =
    input.location || input.mapUrl
      ? {
          label: input.location || undefined,
          address: input.location || undefined,
          map_url: input.mapUrl || undefined
        }
      : null;
  const { data, error } = await client().rpc("save_hotel_stay", {
    requested_booking: {
      id: bookingId,
      trip_id: input.tripId,
      ...fields,
      location,
      notes: input.notes ?? null,
      ...(input.version === undefined ? {} : { version: input.version })
    },
    requested_traveler_ids: participants.travelerIds,
    requested_milestones: {
      check_in_id: checkInId,
      check_out_id: checkOutId,
      check_in_has_time: input.hotelCheckInHasTime ?? true,
      check_out_has_time: input.hotelCheckoutHasTime ?? true
    }
  });
  if (error) throw error;
  const result = data as {
    booking_id?: string;
    check_in_id?: string;
    check_out_id?: string;
  } | null;
  const savedBookingId = result?.booking_id ?? bookingId;
  const savedCheckInId = result?.check_in_id ?? checkInId;
  const savedCheckOutId = result?.check_out_id ?? checkOutId;
  const [{ data: booking, error: bookingError }, { data: itinerary, error: itineraryError }] =
    await Promise.all([
      client().from("bookings").select(bookingSelect).eq("id", savedBookingId).single(),
      client()
        .from("itinerary_items")
        .select("*")
        .in("id", [savedCheckInId, savedCheckOutId])
        .order("starts_at")
    ]);
  if (bookingError) throw bookingError;
  if (itineraryError) throw itineraryError;
  const savedItinerary = (itinerary ?? []) as ItineraryItem[];
  await Promise.all([
    cacheEntity(`bookings:${input.tripId}`, booking as Booking),
    ...savedItinerary.map((item) => cacheEntity(`itinerary:${input.tripId}`, item)),
    cacheParticipantAssignments({
      tripId: input.tripId,
      bookingId: savedBookingId,
      itineraryItemIds: savedItinerary.map((item) => item.id),
      participantScope: participants.participantScope,
      travelerIds: participants.travelerIds
    })
  ]);
  return { booking: booking as Booking, itinerary: savedItinerary };
}

export async function addBookedTimelineEvent(input: BookedTimelineEventInput) {
  if (input.type === "hotel") {
    if (!input.startsAt || !input.endsAt || !input.timezone)
      throw new Error("Hotel check-in, checkout, and local timezone are required.");
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime())
      throw new Error("Hotel checkout must be after check-in.");
  }
  if (input.type === "hotel" && navigator.onLine) {
    const saved = await saveHotelStay(input);
    const costWarning = input.cost
      ? await saveOptionalCostForCreatedEvent({
          tripId: input.tripId,
          bookingId: saved.booking.id,
          itineraryItemId: saved.itinerary[0]?.id,
          title: input.cost.title,
          category: "hotel",
          amountMinor: input.cost.amountMinor,
          currencyCode: input.cost.currencyCode,
          paymentStatus: input.cost.paymentStatus,
          paidByTravelerId: input.cost.paidByTravelerId,
          participantTravelerIds: input.cost.participantTravelerIds
        })
      : undefined;
    return { ...saved, costWarning };
  }
  const booking = await addBooking(bookingInputForTimelineEvent(input));
  const bookingOperation = !navigator.onLine
    ? await database.outbox
        .where("entityId")
        .equals(booking.id)
        .filter((operation) => operation.operation === "create")
        .first()
    : undefined;
  const createMilestone = (
    eventType: TimelineEventType,
    title: string,
    startsAt: string,
    endsAt?: string
  ) => {
    const isHotelMilestone = input.type === "hotel";
    const hotelHasTime =
      eventType === "hotel_check_in"
        ? (input.hotelCheckInHasTime ?? true)
        : (input.hotelCheckoutHasTime ?? true);
    return addItineraryItem({
      tripId: input.tripId,
      bookingId: booking.id,
      eventType,
      title,
      startsAt,
      endsAt,
      timezone: input.timezone!,
      timingMode: isHotelMilestone ? (hotelHasTime ? "exact" : "date_only") : input.timingMode,
      scheduledDate:
        isHotelMilestone && !hotelHasTime
          ? dateInTimeZone(startsAt, input.timezone!)
          : input.scheduledDate,
      anchorItineraryItemId: isHotelMilestone ? undefined : input.anchorItineraryItemId,
      relativePosition: isHotelMilestone ? undefined : input.relativePosition,
      isAllDay: isHotelMilestone ? false : input.isAllDay,
      hasExplicitStartTime: isHotelMilestone
        ? eventType === "hotel_check_in"
          ? (input.hotelCheckInHasTime ?? true)
          : (input.hotelCheckoutHasTime ?? true)
        : input.hasExplicitStartTime,
      durationMinutes: isHotelMilestone ? undefined : input.durationMinutes,
      location: input.location,
      mapUrl: input.mapUrl,
      notes: input.notes,
      participantScope: input.participantScope,
      travelerIds: input.travelerIds,
      dependsOn: [bookingOperation?.operationId].filter((id): id is string => Boolean(id))
    });
  };
  const itinerary =
    input.type === "hotel"
      ? [
          await createMilestone("hotel_check_in", `${input.title} · Check in`, input.startsAt!),
          await createMilestone("hotel_check_out", `${input.title} · Check out`, input.endsAt!)
        ]
      : [await createMilestone(input.eventType, input.title, input.startsAt!, input.endsAt)];
  const costWarning = input.cost
    ? await saveOptionalCostForCreatedEvent({
        tripId: input.tripId,
        bookingId: booking.id,
        itineraryItemId: itinerary[0].id,
        title: input.cost.title,
        category:
          input.type === "restaurant"
            ? "food"
            : input.type === "hotel"
              ? "hotel"
              : input.type === "activity"
                ? "activity"
                : "transport",
        amountMinor: input.cost.amountMinor,
        currencyCode: input.cost.currencyCode,
        paymentStatus: input.cost.paymentStatus,
        paidByTravelerId: input.cost.paidByTravelerId,
        participantTravelerIds: input.cost.participantTravelerIds
      })
    : undefined;
  return { booking, itinerary, costWarning };
}

export async function listTripAirlines(tripId: string): Promise<TripAirline[]> {
  return networkWithCache(`trip-airlines:${tripId}`, async () => {
    const { data, error } = await client()
      .from("trip_airlines")
      .select(
        "id,trip_id,name,iata_code,icao_code,check_in_url_template,manage_booking_url_template,status_url_template,tracker_url_template,brand_color,metadata_source,source_catalog_key,source_config_version,version"
      )
      .eq("trip_id", tripId)
      .order("name");
    if (error) throw error;
    return (data ?? []) as TripAirline[];
  });
}

export async function suggestCatalogValue(input: {
  type: "airline" | "airport" | "booking_vendor" | "service_provider";
  displayValue: string;
  proposedData?: Record<string, string | null | undefined>;
}) {
  const displayValue = input.displayValue.trim();
  if (!navigator.onLine || !displayValue) return;
  const actor = await userId();
  const normalizedValue = displayValue
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const proposedData = Object.fromEntries(
    Object.entries(input.proposedData ?? {}).filter(([, value]) => value)
  );
  const { error } = await client().from("catalog_suggestions").insert({
    suggestion_type: input.type,
    display_value: displayValue,
    normalized_value: normalizedValue,
    proposed_data: proposedData,
    submitted_by: actor
  });
  if (error && error.code !== "23505") throw error;
}

export async function updateTripAirline(input: TripAirline) {
  const patch = {
    name: input.name,
    iata_code: input.iata_code,
    icao_code: input.icao_code,
    check_in_url_template: input.check_in_url_template,
    manage_booking_url_template: input.manage_booking_url_template,
    status_url_template: input.status_url_template,
    tracker_url_template: input.tracker_url_template,
    brand_color: input.brand_color,
    metadata_source: "manual",
    last_verified_at: new Date().toISOString()
  };
  if (!navigator.onLine) {
    const updated = { ...input, ...patch, version: input.version + 1 };
    await queueUpdate({
      entityType: `trip-airlines:${input.trip_id}`,
      table: "trip_airlines",
      row: updated,
      patch,
      baseVersion: input.version
    });
    return updated;
  }
  const { data, error } = await client()
    .from("trip_airlines")
    .update(patch)
    .eq("id", input.id)
    .eq("version", input.version)
    .select(
      "id,trip_id,name,iata_code,icao_code,check_in_url_template,manage_booking_url_template,status_url_template,tracker_url_template,brand_color,metadata_source,source_catalog_key,source_config_version,version"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error("This airline metadata changed on another device. Refresh before saving.");
  await cacheEntity(`trip-airlines:${input.trip_id}`, data as TripAirline);
  return data as TripAirline;
}

export async function getFlightLeg(flightLegId: string): Promise<FlightLeg> {
  if (!navigator.onLine) {
    const cached = await readEntityById<FlightLeg>("flights:", flightLegId);
    if (cached) return cached;
  }
  const { data, error } = await client()
    .from("flight_legs")
    .select("*")
    .eq("id", flightLegId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data as FlightLeg;
}

export async function updateFlightLeg(
  input: Partial<FlightLeg> & {
    id: string;
    tripId?: string;
    status: FlightStatus;
    eventTimezone?: string;
  }
): Promise<FlightLeg> {
  const actor = await userId();
  const scheduleChanged = Boolean(input.scheduled_departure_at && input.scheduled_arrival_at);
  const allowed = {
    status: input.status,
    ...(scheduleChanged
      ? {
          scheduled_departure_at: input.scheduled_departure_at!,
          scheduled_arrival_at: input.scheduled_arrival_at!
        }
      : {}),
    estimated_departure_at: input.estimated_departure_at || null,
    estimated_arrival_at: input.estimated_arrival_at || null,
    actual_departure_at: input.actual_departure_at || null,
    actual_arrival_at: input.actual_arrival_at || null,
    boarding_at: input.boarding_at || null,
    boarding_lead_minutes: input.boarding_lead_minutes ?? null,
    departure_terminal: input.departure_terminal || null,
    departure_gate: input.departure_gate || null,
    arrival_terminal: input.arrival_terminal || null,
    arrival_gate: input.arrival_gate || null,
    baggage_claim: input.baggage_claim || null,
    status_note: input.status_note || null,
    status_updated_by: actor,
    status_updated_at: new Date().toISOString()
  };
  if (!navigator.onLine && input.tripId) {
    const existing = await readEntityById<FlightLeg>("flights:", input.id);
    if (!existing) throw new Error("This flight was not cached for offline editing.");
    if (input.eventTimezone && input.eventTimezone !== existing.departure_timezone)
      throw new Error(
        "Reconnect to change a flight journey's time zone so every connection stays synchronized."
      );
    const updated = { ...existing, ...allowed, version: (existing.version ?? 1) + 1 };
    await queueUpdate({
      entityType: `flights:${input.tripId}`,
      table: "flight_legs",
      row: updated,
      patch: allowed,
      baseVersion: existing.version
    });
    if (scheduleChanged) {
      const legs = (await readEntityList<FlightLeg>(`flights:${input.tripId}`))
        .map((leg) => (leg.id === updated.id ? updated : leg))
        .filter((leg) => leg.booking_id === updated.booking_id)
        .sort((left, right) => left.segment_order - right.segment_order);
      const first = legs[0];
      const last = legs.at(-1);
      const booking = await readEntityById<Booking>("bookings:", updated.booking_id);
      if (first && last && booking) {
        const bookingPatch = {
          start_at: first.scheduled_departure_at,
          end_at: last.scheduled_arrival_at,
          source_timezone: first.departure_timezone
        };
        await queueUpdate({
          entityType: `bookings:${input.tripId}`,
          table: "bookings",
          row: { ...booking, ...bookingPatch, version: (booking.version ?? 1) + 1 },
          patch: bookingPatch,
          baseVersion: booking.version
        });
        const itinerary = (await readEntityList<ItineraryItem>(`itinerary:${input.tripId}`)).find(
          (item) => item.booking_id === booking.id && item.event_type === "flight"
        );
        if (itinerary) {
          const itineraryPatch = {
            starts_at: first.scheduled_departure_at,
            ends_at: last.scheduled_arrival_at,
            timezone: first.departure_timezone,
            sort_key: `${first.scheduled_departure_at}:${itinerary.id}`
          };
          await queueUpdate({
            entityType: `itinerary:${input.tripId}`,
            table: "itinerary_items",
            row: { ...itinerary, ...itineraryPatch, version: (itinerary.version ?? 1) + 1 },
            patch: itineraryPatch,
            baseVersion: itinerary.version
          });
        }
      }
    }
    return updated;
  }
  if (input.eventTimezone) {
    const { data, error } = await client().rpc("save_domestic_flight_update", {
      requested_leg_id: input.id,
      requested_version: input.version ?? null,
      requested_patch: allowed,
      requested_event_timezone: input.eventTimezone
    });
    if (error) throw error;
    if (input.tripId) await cacheEntity(`flights:${input.tripId}`, data as FlightLeg);
    return data as FlightLeg;
  }
  let request = client().from("flight_legs").update(allowed).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      "This flight changed on another device. Refresh and choose which update to keep."
    );
  if (input.tripId) {
    await cacheEntity(`flights:${input.tripId}`, data as FlightLeg);
    if (scheduleChanged) {
      const { data: legs, error: legsError } = await client()
        .from("flight_legs")
        .select("segment_order,scheduled_departure_at,scheduled_arrival_at,departure_timezone")
        .eq("booking_id", data.booking_id)
        .is("deleted_at", null)
        .order("segment_order");
      if (legsError) throw legsError;
      const first = legs?.[0];
      const last = legs?.at(-1);
      if (first && last) {
        const bookingPatch = {
          start_at: first.scheduled_departure_at,
          end_at: last.scheduled_arrival_at,
          source_timezone: first.departure_timezone
        };
        const { error: bookingError } = await client()
          .from("bookings")
          .update(bookingPatch)
          .eq("id", data.booking_id);
        if (bookingError) throw bookingError;
        const { error: itineraryError } = await client()
          .from("itinerary_items")
          .update({
            starts_at: first.scheduled_departure_at,
            ends_at: last.scheduled_arrival_at,
            timezone: first.departure_timezone
          })
          .eq("booking_id", data.booking_id)
          .eq("event_type", "flight")
          .is("deleted_at", null);
        if (itineraryError) throw itineraryError;
      }
    }
  }
  return data as FlightLeg;
}

export async function listRequirements(tripId: string): Promise<Requirement[]> {
  return networkWithCache(`requirements:${tripId}`, async () => {
    const { data, error } = await client()
      .from("trip_requirements")
      .select("*")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as Requirement[];
  });
}

export async function addRequirement(input: RequirementInput): Promise<Requirement> {
  const actor = await userId();
  const id = crypto.randomUUID();
  const requirement = {
    id,
    trip_id: input.tripId,
    type: input.type,
    title: input.title,
    status: input.status,
    destination_country_code: input.destinationCountryCode || null,
    visa_type: input.visaType || null,
    due_date: input.dueDate || null,
    timing_mode: input.timingMode ?? (input.dueDate ? "date_only" : "unscheduled"),
    anchor_itinerary_item_id: input.anchorItineraryItemId || null,
    relative_position: input.relativePosition || null,
    offset_minutes: input.offsetMinutes ?? null,
    issued_on: input.issuedOn || null,
    expires_on: input.expiresOn || null,
    validity_buffer_days: input.validityBufferDays ?? null,
    official_guidance_url: input.officialGuidanceUrl || null,
    guidance_checked_at: input.officialGuidanceUrl ? new Date().toISOString() : null,
    linked_document_id: input.linkedDocumentId || null,
    notes: input.notes || null
  } satisfies Requirement;
  const row = { ...requirement, created_by: actor };
  if (!navigator.onLine) {
    const parentOperation = await queueCreate({
      entityType: `requirements:${input.tripId}`,
      table: "trip_requirements",
      row
    });
    for (const travelerId of input.travelerIds ?? [])
      await queueCreate({
        entityType: `requirement-assignees:${id}`,
        table: "requirement_assignees",
        row: {
          id: `${id}:${travelerId}`,
          requirement_id: id,
          traveler_id: travelerId,
          completed_at: null
        },
        serverRow: { requirement_id: id, traveler_id: travelerId },
        dependsOn: [parentOperation]
      });
    return requirement;
  }
  const { data, error } = await client()
    .from("trip_requirements")
    .insert({
      id,
      trip_id: input.tripId,
      type: input.type,
      title: input.title,
      status: input.status,
      destination_country_code: input.destinationCountryCode || null,
      visa_type: input.visaType || null,
      due_date: input.dueDate || null,
      timing_mode: input.timingMode ?? (input.dueDate ? "date_only" : "unscheduled"),
      anchor_itinerary_item_id: input.anchorItineraryItemId || null,
      relative_position: input.relativePosition || null,
      offset_minutes: input.offsetMinutes ?? null,
      issued_on: input.issuedOn || null,
      expires_on: input.expiresOn || null,
      validity_buffer_days: input.validityBufferDays ?? null,
      official_guidance_url: input.officialGuidanceUrl || null,
      guidance_checked_at: input.officialGuidanceUrl ? new Date().toISOString() : null,
      linked_document_id: input.linkedDocumentId || null,
      notes: input.notes || null,
      created_by: actor
    })
    .select("*")
    .single();
  if (error) throw error;
  if (input.travelerIds?.length) {
    const { error: assigneesError } = await client()
      .from("requirement_assignees")
      .insert(
        input.travelerIds.map((travelerId) => ({ requirement_id: id, traveler_id: travelerId }))
      );
    if (assigneesError) throw assigneesError;
  }
  await cacheEntity(`requirements:${input.tripId}`, data as Requirement);
  return data as Requirement;
}

export async function listRequirementAssigneeIds(
  requirementId: string,
  tripId: string
): Promise<string[]> {
  const key = `requirement-assignees:${tripId}`;
  if (!navigator.onLine)
    return (await readEntityList<{ requirement_id: string; traveler_id: string }>(key))
      .filter((row) => row.requirement_id === requirementId)
      .map((row) => row.traveler_id);
  const { data, error } = await client()
    .from("requirement_assignees")
    .select("requirement_id,traveler_id,completed_at,updated_at")
    .eq("requirement_id", requirementId);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    ...row,
    id: `${row.requirement_id}:${row.traveler_id}`
  }));
  const cached = await readEntityList<(typeof rows)[number]>(key);
  await cacheEntityList(key, [
    ...cached.filter((row) => row.requirement_id !== requirementId),
    ...rows
  ]);
  return rows.map((row) => String(row.traveler_id));
}

export async function updateRequirement(input: UpdateRequirementInput): Promise<Requirement> {
  const existing = (await readEntityList<Requirement>(`requirements:${input.tripId}`)).find(
    (item) => item.id === input.id
  );
  if (!existing) throw new Error("Refresh readiness before editing this item.");
  const patch = {
    type: input.type,
    title: input.title,
    status: input.status,
    destination_country_code: input.destinationCountryCode || null,
    visa_type: input.visaType || null,
    due_date: input.dueDate || null,
    timing_mode: input.timingMode ?? (input.dueDate ? "date_only" : "unscheduled"),
    anchor_itinerary_item_id: input.anchorItineraryItemId || null,
    relative_position: input.relativePosition || null,
    offset_minutes: input.offsetMinutes ?? null,
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
    const parent = await queueUpdate({
      entityType: `requirements:${input.tripId}`,
      table: "trip_requirements",
      row: updated,
      patch,
      baseVersion: existing.version
    });
    const removals: string[] = [];
    for (const travelerId of currentAssignees.filter(
      (id) => !(input.travelerIds ?? []).includes(id)
    ))
      removals.push(
        await queueDelete({
          entityType: `requirement-assignees:${input.tripId}`,
          table: "requirement_assignees",
          entityId: `${input.id}:${travelerId}`,
          match: { requirement_id: input.id, traveler_id: travelerId },
          hard: true,
          dependsOn: [parent]
        })
      );
    for (const travelerId of input.travelerIds ?? [])
      if (!currentAssignees.includes(travelerId))
        await queueCreate({
          entityType: `requirement-assignees:${input.tripId}`,
          table: "requirement_assignees",
          row: {
            id: `${input.id}:${travelerId}`,
            requirement_id: input.id,
            traveler_id: travelerId,
            completed_at: null
          },
          serverRow: { requirement_id: input.id, traveler_id: travelerId },
          dependsOn: [parent, ...removals]
        });
    return updated;
  }
  let request = client().from("trip_requirements").update(patch).eq("id", input.id);
  if (input.version !== undefined) request = request.eq("version", input.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error("This readiness item changed on another device. Refresh before saving.");
  const { error: clearError } = await client()
    .from("requirement_assignees")
    .delete()
    .eq("requirement_id", input.id);
  if (clearError) throw clearError;
  if (input.travelerIds?.length) {
    const { error: assigneesError } = await client()
      .from("requirement_assignees")
      .insert(
        input.travelerIds.map((travelerId) => ({
          requirement_id: input.id,
          traveler_id: travelerId
        }))
      );
    if (assigneesError) throw assigneesError;
  }
  await cacheEntity(`requirements:${input.tripId}`, data as Requirement);
  return data as Requirement;
}

export async function archiveRequirement(requirement: Requirement) {
  if (!navigator.onLine) {
    const profileId = await userId();
    await database.entities.delete([
      profileId,
      `requirements:${requirement.trip_id}`,
      requirement.id
    ]);
    await queueDelete({
      entityType: `requirements:${requirement.trip_id}`,
      table: "trip_requirements",
      entityId: requirement.id
    });
    return;
  }
  const { error } = await client()
    .from("trip_requirements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", requirement.id);
  if (error) throw error;
}

export async function updateRequirementStatus(
  id: string,
  status: RequirementStatus,
  tripId?: string
) {
  if (!navigator.onLine && tripId) {
    const existing = await readEntityById<Requirement>("requirements:", id);
    if (!existing) throw new Error("This readiness item was not cached.");
    const updated = { ...existing, status, version: (existing.version ?? 1) + 1 };
    await queueUpdate({
      entityType: `requirements:${tripId}`,
      table: "trip_requirements",
      row: updated,
      patch: { status },
      baseVersion: existing.version
    });
    return updated;
  }
  const existing = tripId ? await readEntityById<Requirement>("requirements:", id) : undefined;
  let request = client().from("trip_requirements").update({ status }).eq("id", id);
  if (existing?.version !== undefined) request = request.eq("version", existing.version);
  const { data, error } = await request.select("*").maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error("This readiness item changed on another device. Refresh before editing it.");
  if (tripId) await cacheEntity(`requirements:${tripId}`, data as Requirement);
  return data as Requirement;
}

export async function listDocumentAccessUserIds(documentId: string): Promise<string[]> {
  if (!navigator.onLine) return [];
  const { data, error } = await client()
    .from("document_access")
    .select("user_id")
    .eq("document_id", documentId);
  if (error) throw error;
  return (data ?? []).map((row) => String(row.user_id));
}

export async function updateDocumentVisibility(input: {
  documentId: string;
  visibility: DocumentVisibility;
  selectedUserIds?: string[];
}) {
  if (!navigator.onLine) throw new Error("Connect to change who can open this document.");
  const { error } = await client().rpc("update_document_visibility", {
    requested_document_id: input.documentId,
    requested_visibility: input.visibility,
    requested_user_ids: input.visibility === "selected_members" ? (input.selectedUserIds ?? []) : []
  });
  if (error) throw error;
}

export async function updateDocumentDetails(input: {
  document: VaultDocument;
  title: string;
  category: DocumentCategory;
  purpose: DocumentPurpose;
  assignmentMode: DocumentAssignmentMode;
  travelerIds?: string[];
}) {
  if (!navigator.onLine)
    throw new Error("Connect to change this document's type, title, or travelers.");
  const actor = await userId();
  const title = input.title.trim();
  if (!title) throw new Error("Add a document title.");
  const travelerIds =
    input.assignmentMode === "selected" ? [...new Set(input.travelerIds ?? [])] : [];
  if (input.assignmentMode === "selected" && !travelerIds.length)
    throw new Error("Choose at least one traveler, or select Assign later.");
  const previousMode =
    input.document.assignment_mode ?? (input.document.traveler_id ? "selected" : "shared");
  const previousTravelerIds = input.document.traveler_ids?.length
    ? input.document.traveler_ids
    : input.document.traveler_id
      ? [input.document.traveler_id]
      : [];
  const patch = {
    title,
    category: input.category,
    purpose: input.purpose,
    assignment_mode: input.assignmentMode,
    traveler_id: travelerIds.length === 1 ? travelerIds[0] : null
  };
  let documentUpdated = false;
  let assignmentsCleared = false;
  try {
    const { error: documentError } = await client()
      .from("documents")
      .update(patch)
      .eq("id", input.document.id);
    if (documentError) throw documentError;
    documentUpdated = true;
    const { error: clearError } = await client()
      .from("document_travelers")
      .delete()
      .eq("document_id", input.document.id);
    if (clearError) throw clearError;
    assignmentsCleared = true;
    if (travelerIds.length) {
      const { error: travelerError } = await client()
        .from("document_travelers")
        .insert(
          travelerIds.map((travelerId) => ({
            document_id: input.document.id,
            traveler_id: travelerId,
            assigned_by: actor
          }))
        );
      if (travelerError) throw travelerError;
    }
  } catch (error) {
    // These tables already permit document managers to edit them, but they are
    // separate rows. Restore the previous state if the second write fails so a
    // partial network response cannot silently change who the document is for.
    if (documentUpdated) {
      await client()
        .from("documents")
        .update({
          title: input.document.title,
          category: input.document.category,
          purpose: input.document.purpose,
          assignment_mode: previousMode,
          traveler_id: previousTravelerIds.length === 1 ? previousTravelerIds[0] : null
        })
        .eq("id", input.document.id);
    }
    if (assignmentsCleared) {
      await client().from("document_travelers").delete().eq("document_id", input.document.id);
      if (previousTravelerIds.length)
        await client()
          .from("document_travelers")
          .insert(
            previousTravelerIds.map((travelerId) => ({
              document_id: input.document.id,
              traveler_id: travelerId,
              assigned_by: actor
            }))
          );
    }
    throw error;
  }
  const updated: VaultDocument = {
    ...input.document,
    ...patch,
    traveler_ids: travelerIds,
    updated_at: new Date().toISOString()
  };
  await Promise.all([
    cacheEntity(`documents:${input.document.trip_id}`, updated),
    cacheEntity("documents", updated)
  ]);
  return updated;
}

const documentSelect =
  "id,trip_id,booking_id,flight_leg_id,journey_leg_id,traveler_id,assignment_mode,title,category,purpose,short_label,visibility,uploaded_by,current_version_id,version,updated_at,deleted_at,document_travelers(traveler_id),current_version:document_versions!documents_current_version_id_fkey(id,storage_bucket,storage_path,original_filename,mime_type,byte_size,sha256,version_number,created_at)";
const accountDocumentUploadSelect =
  "id,owner_id,storage_path,original_filename,mime_type,byte_size,sha256,associated_document_id,stored_at,created_at,updated_at";

type DocumentResponse = VaultDocument & { document_travelers?: { traveler_id: string }[] };

function normalizeVaultDocument(raw: DocumentResponse): VaultDocument {
  const { document_travelers: assignments, ...document } = raw;
  const travelerIds =
    assignments?.map((assignment) => assignment.traveler_id) ??
    document.traveler_ids ??
    (document.traveler_id ? [document.traveler_id] : []);
  return {
    ...document,
    assignment_mode: document.assignment_mode ?? (document.traveler_id ? "selected" : "shared"),
    traveler_ids: travelerIds
  };
}

export function mergeCloudAndPendingDocuments(
  cloud: VaultDocument[],
  local: VaultDocument[],
  pendingIds: Iterable<string>
) {
  const pending = new Set(pendingIds);
  const merged = new Map<string, VaultDocument>(
    cloud.map((document) => [document.id, { ...document, sync_state: "synced" }])
  );
  for (const document of local) {
    if (pending.has(document.id))
      merged.set(document.id, { ...document, sync_state: "queued" as const });
  }
  return [...merged.values()].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
  );
}

async function pendingDocumentOperations(documentIds?: string[]) {
  const profileId = await localProfileId();
  if (!profileId) return [];
  return database.outbox
    .where("profileId")
    .equals(profileId)
    .filter(
      (operation) =>
        ["upload_document", "associate_account_document"].includes(operation.operation) &&
        (!documentIds || documentIds.includes(operation.entityId))
    )
    .toArray();
}

async function pendingAccountUploadOperations(uploadIds?: string[]) {
  const profileId = await localProfileId();
  if (!profileId) return [];
  return database.outbox
    .where("profileId")
    .equals(profileId)
    .filter((operation) => {
      const payload = operation.payload as { uploadId?: unknown };
      const matchesId =
        !uploadIds ||
        uploadIds.includes(operation.entityId) ||
        (typeof payload.uploadId === "string" && uploadIds.includes(payload.uploadId));
      return (
        matchesId &&
        ["upload_account_document", "associate_account_document"].includes(operation.operation)
      );
    })
    .toArray();
}

export function mergeAccountDocumentUploads(
  cloud: AccountDocumentUpload[],
  local: AccountDocumentUpload[],
  pendingIds: Iterable<string>
) {
  const pending = new Set(pendingIds);
  const merged = new Map<string, AccountDocumentUpload>(
    cloud.map((upload) => [
      upload.id,
      { ...upload, sync_state: upload.stored_at ? ("synced" as const) : ("queued" as const) }
    ])
  );
  for (const upload of local) {
    const cloudUpload = merged.get(upload.id);
    // A cloud association is authoritative even if an old local outbox entry
    // survived a lost response. Keeping the local row here would make a file
    // that is already in the Vault reappear in the unfinished inbox.
    if (cloudUpload?.associated_document_id) continue;
    if (pending.has(upload.id) || !cloudUpload) {
      merged.set(upload.id, {
        ...upload,
        sync_state:
          pending.has(upload.id) || !upload.stored_at ? "queued" : (upload.sync_state ?? "synced")
      });
    }
  }
  return [...merged.values()]
    .filter((upload) => !upload.associated_document_id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export function isMissingAccountDocumentObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown };
  return [candidate.message, candidate.details, candidate.hint].some((value) =>
    /document file is not stored yet/i.test(String(value ?? ""))
  );
}

async function verifyAccountDocumentObject(
  upload: AccountDocumentUpload
): Promise<AccountDocumentUpload> {
  const { data: storedAt, error } = await client().rpc("finalize_account_document_upload", {
    requested_upload_id: upload.id
  });
  if (error)
    return {
      ...upload,
      sync_state: "queued",
      sync_error: isMissingAccountDocumentObject(error) ? "storage_missing" : "verification_failed",
      can_retry: false,
      can_verify: true
    };
  if (typeof storedAt !== "string")
    return {
      ...upload,
      sync_state: "queued",
      sync_error: "verification_failed",
      can_retry: false,
      can_verify: true
    };
  return {
    ...upload,
    stored_at: storedAt,
    sync_state: "synced",
    sync_error: undefined,
    can_retry: false,
    can_verify: false
  };
}

export async function listAccountDocumentUploads(): Promise<AccountDocumentUpload[]> {
  const local = await readEntityList<AccountDocumentUpload>("account-document-uploads");
  const operations = await pendingAccountUploadOperations();
  const pendingIds = operations.map((operation) =>
    operation.operation === "upload_account_document"
      ? operation.entityId
      : String((operation.payload as { uploadId?: string }).uploadId ?? "")
  );
  const annotate = (uploads: AccountDocumentUpload[]) =>
    uploads.map((upload) => {
      const operation = operations.find(
        (candidate) =>
          candidate.entityId === upload.id ||
          (candidate.payload as { uploadId?: string }).uploadId === upload.id
      );
      return {
        ...upload,
        sync_error: operation?.lastErrorCode ?? upload.sync_error,
        association_pending: operations.some(
          (candidate) =>
            candidate.operation === "associate_account_document" &&
            (candidate.payload as { uploadId?: string }).uploadId === upload.id
        ),
        can_retry: Boolean(operation),
        can_verify: upload.can_verify ?? (!upload.stored_at && !operation)
      };
    });
  let rows = annotate(mergeAccountDocumentUploads([], local, pendingIds));
  if (navigator.onLine) {
    try {
      const { data, error } = await client()
        .from("account_document_uploads")
        .select(accountDocumentUploadSelect)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const cloudRows = (data ?? []) as AccountDocumentUpload[];
      const reconciledCloud = await Promise.all(
        cloudRows.map((upload) =>
          upload.associated_document_id ||
          upload.stored_at ||
          operations.some((operation) => operation.entityId === upload.id)
            ? upload
            : verifyAccountDocumentObject(upload)
        )
      );
      rows = annotate(mergeAccountDocumentUploads(reconciledCloud, local, pendingIds));
      await cacheEntityList("account-document-uploads", rows);
    } catch (error) {
      if (!local.length) throw error;
    }
  }
  return rows;
}

export async function listVaultDocuments(tripId?: string): Promise<VaultDocument[]> {
  const key = tripId ? `documents:${tripId}` : "documents";
  const localDocuments = await readEntityList<VaultDocument>(key);
  let documents = localDocuments;
  if (navigator.onLine) {
    try {
      let query = client()
        .from("documents")
        .select(documentSelect)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (tripId) query = query.eq("trip_id", tripId);
      const { data, error } = await query;
      if (error) throw error;
      const uploads = await pendingDocumentOperations();
      const cloud = ((data ?? []) as unknown as DocumentResponse[]).map(normalizeVaultDocument);
      documents = mergeCloudAndPendingDocuments(
        cloud,
        localDocuments,
        uploads.map((operation) => operation.entityId)
      ).map((document) => ({
        ...document,
        sync_error: uploads.find((operation) => operation.entityId === document.id)?.lastErrorCode
      }));
      await cacheEntityList(key, documents);
    } catch (error) {
      if (!localDocuments.length) throw error;
    }
  }
  if (tripId) {
    const crossTripDocuments = await readEntityList<VaultDocument>("documents");
    await cacheEntityList("documents", [
      ...crossTripDocuments.filter((document) => document.trip_id !== tripId),
      ...documents
    ]);
    const profileId = await localProfileId();
    const manifest = profileId
      ? await database.offlineManifests.get([profileId, tripId])
      : undefined;
    if (manifest && ["ready", "essentials_ready"].includes(manifest.state)) {
      const current = documents
        .flatMap((document) => (document.current_version ? [document.current_version.id] : []))
        .sort();
      const expected = [...manifest.expectedVersionIds].sort();
      const changed =
        manifest.state === "ready"
          ? current.length !== expected.length ||
            current.some((id, index) => id !== expected[index])
          : expected.some((id) => !current.includes(id));
      if (changed) await database.offlineManifests.update([profileId!, tripId], { state: "stale" });
    }
  }
  return documents;
}

export async function getVaultDocument(documentId: string): Promise<VaultDocument> {
  const local = await readEntityById<VaultDocument>("documents", documentId);
  const uploads = await pendingDocumentOperations([documentId]);
  if (!navigator.onLine) {
    if (local)
      return {
        ...local,
        sync_state: uploads.length ? "queued" : (local.sync_state ?? "synced"),
        sync_error: uploads[0]?.lastErrorCode
      };
    throw new Error("This document is not available on this device.");
  }
  if (uploads.length && local)
    return { ...local, sync_state: "queued", sync_error: uploads[0]?.lastErrorCode };
  const { data, error } = await client()
    .from("documents")
    .select(documentSelect)
    .eq("id", documentId)
    .is("deleted_at", null)
    .single();
  if (error) {
    if (local) return { ...local, sync_state: "queued", sync_error: uploads[0]?.lastErrorCode };
    throw error;
  }
  return { ...normalizeVaultDocument(data as unknown as DocumentResponse), sync_state: "synced" };
}

export async function listArchivedVaultDocuments(): Promise<VaultDocument[]> {
  if (!navigator.onLine) return [];
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await client()
    .from("documents")
    .select(documentSelect)
    .not("deleted_at", "is", null)
    .gte("deleted_at", cutoff)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as DocumentResponse[]).map(normalizeVaultDocument);
}

export async function restoreDocument(document: VaultDocument) {
  if (!navigator.onLine) throw new Error("Restoring a document requires a connection.");
  const { data, error } = await client()
    .from("documents")
    .update({ deleted_at: null })
    .eq("id", document.id)
    .select(documentSelect)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This document can no longer be restored.");
  return normalizeVaultDocument(data as unknown as DocumentResponse);
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  if (!navigator.onLine) return [];
  const { data, error } = await client()
    .from("document_versions")
    .select(
      "id,storage_bucket,storage_path,original_filename,mime_type,byte_size,sha256,version_number,created_at"
    )
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentVersion[];
}

export async function documentStorageUsage() {
  const profileId = await localProfileId();
  const localRows = profileId
    ? await database.localDocuments.where("profileId").equals(profileId).toArray()
    : [];
  const documents = await listVaultDocuments();
  return {
    localBytes: localRows.reduce((sum, row) => sum + row.byteSize, 0),
    cloudBytes: documents.reduce(
      (sum, document) =>
        sum + (document.sync_state !== "queued" ? (document.current_version?.byte_size ?? 0) : 0),
      0
    ),
    localFiles: localRows.length,
    cloudFiles: documents.filter(
      (document) => document.sync_state !== "queued" && document.current_version
    ).length
  };
}

export function validateDocumentFile(file: File) {
  if (file.size >= MAX_DOCUMENT_BYTES)
    throw new Error(
      `${file.name} is ${(file.size / 1_000_000).toFixed(2)} MB. Choose a file smaller than 5 MB.`
    );
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type))
    throw new Error("Use a PDF, JPEG, PNG, or WebP file.");
}

export async function sha256(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function sanitizeFilename(filename: string) {
  const cleaned = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+\./g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 100);
  return cleaned || "document";
}

export class DuplicateDocumentError extends Error {
  constructor(
    public readonly existingDocumentId: string,
    public readonly existingTitle: string
  ) {
    super(
      `This exact file is already in the Vault as “${existingTitle}”. Use the existing document instead.`
    );
    this.name = "DuplicateDocumentError";
  }
}

export async function stageAccountDocument(
  file: File,
  knownChecksum?: string
): Promise<AccountDocumentUpload> {
  validateDocumentFile(file);
  const actor = await userId();
  const checksum = knownChecksum ?? (await sha256(file));
  const uploadId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const storagePath = `${actor}/${uploadId}/${sanitizeFilename(file.name)}`;
  const upload: AccountDocumentUpload = {
    id: uploadId,
    owner_id: actor,
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type,
    byte_size: file.size,
    sha256: checksum,
    associated_document_id: null,
    stored_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    sync_state: "queued",
    can_retry: true
  };
  const row = {
    id: upload.id,
    owner_id: upload.owner_id,
    storage_path: upload.storage_path,
    original_filename: upload.original_filename,
    mime_type: upload.mime_type,
    byte_size: upload.byte_size,
    sha256: upload.sha256,
    associated_document_id: null
  };
  await storeOfflineFile({
    profileId: actor,
    versionId: upload.id,
    blob: file,
    sha256: checksum,
    pinReason: "created"
  });
  await cacheEntity("account-document-uploads", upload);
  const operationId = await queueAccountDocumentUpload({ upload: row, storagePath });
  if (navigator.onLine) {
    await syncOutbox();
    const pending = await database.outbox.get(operationId);
    if (!pending) {
      const finalized = await readEntityById<AccountDocumentUpload>(
        "account-document-uploads",
        upload.id
      );
      if (finalized?.stored_at)
        return { ...finalized, sync_state: "synced", sync_error: undefined, can_retry: false };
      const { data, error } = await client()
        .from("account_document_uploads")
        .select(accountDocumentUploadSelect)
        .eq("id", upload.id)
        .single();
      if (error) throw error;
      if (!data.stored_at) throw new Error("Supabase did not confirm the stored document file.");
      const stored = {
        ...(data as AccountDocumentUpload),
        sync_state: "synced" as const,
        can_retry: false
      };
      await cacheEntity("account-document-uploads", stored);
      return stored;
    }
    return { ...upload, sync_error: pending.lastErrorCode };
  }
  return upload;
}

export type AssociateAccountDocumentInput = {
  upload: AccountDocumentUpload;
  tripId: string;
  title: string;
  category: DocumentCategory;
  purpose: DocumentPurpose;
  assignmentMode: DocumentAssignmentMode;
  visibility: DocumentVisibility;
  travelerIds?: string[];
  bookingId?: string;
  flightLegId?: string;
  journeyLegId?: string;
  shortLabel?: string;
  selectedUserIds?: string[];
};

export async function associateAccountDocument(
  input: AssociateAccountDocumentInput
): Promise<VaultDocument> {
  const actor = await userId();
  const uploadOperations = await pendingAccountUploadOperations([input.upload.id]);
  if (
    !input.upload.stored_at &&
    !uploadOperations.some((operation) => operation.operation === "upload_account_document")
  ) {
    throw new Error(
      "This file did not finish uploading on this device. Select it again here, or retry it on the device where it was added."
    );
  }
  const existingAssociation = uploadOperations.find(
    (operation) => operation.operation === "associate_account_document"
  );
  if (existingAssociation) {
    await database.outbox.update(existingAssociation.operationId, {
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
      attemptCount: 0
    });
    if (navigator.onLine) await syncOutbox();
    const stillPending = await database.outbox.get(existingAssociation.operationId);
    const existingDocumentId = String(
      (existingAssociation.payload as { rpc?: { requested_document_id?: string } }).rpc
        ?.requested_document_id ?? ""
    );
    const localDocument = existingDocumentId
      ? await readEntityById<VaultDocument>("documents", existingDocumentId)
      : undefined;
    if (!stillPending && existingDocumentId) {
      await cacheEntity("account-document-uploads", {
        ...input.upload,
        associated_document_id: existingDocumentId,
        updated_at: new Date().toISOString(),
        sync_state: "synced"
      });
      return getVaultDocument(existingDocumentId);
    }
    if (localDocument)
      return { ...localDocument, sync_state: "queued", sync_error: stillPending?.lastErrorCode };
    throw new Error("This upload already has a pending trip association. Retry it from Profile.");
  }
  const documentId = crypto.randomUUID();
  const versionId = input.upload.id;
  const createdAt = new Date().toISOString();
  const travelerIds =
    input.assignmentMode === "selected" ? [...new Set(input.travelerIds ?? [])] : [];
  if (input.assignmentMode === "selected" && !travelerIds.length)
    throw new Error("Choose at least one traveler, or select Assign later.");
  const rpc = {
    requested_upload_id: input.upload.id,
    requested_document_id: documentId,
    requested_version_id: versionId,
    requested_trip_id: input.tripId,
    requested_title: input.title,
    requested_category: input.category,
    requested_purpose: input.purpose,
    requested_assignment_mode: input.assignmentMode,
    requested_visibility: input.visibility,
    requested_booking_id: input.bookingId || null,
    requested_flight_leg_id: input.flightLegId || null,
    requested_journey_leg_id: input.journeyLegId || null,
    requested_short_label: input.shortLabel || null,
    requested_traveler_ids: travelerIds,
    requested_user_ids: input.selectedUserIds ?? []
  };
  const document: VaultDocument = {
    id: documentId,
    trip_id: input.tripId,
    booking_id: input.bookingId || null,
    flight_leg_id: input.flightLegId || null,
    journey_leg_id: input.journeyLegId || null,
    traveler_id: travelerIds.length === 1 ? travelerIds[0] : null,
    assignment_mode: input.assignmentMode,
    traveler_ids: travelerIds,
    title: input.title,
    category: input.category,
    purpose: input.purpose,
    short_label: input.shortLabel || null,
    visibility: input.visibility,
    uploaded_by: actor,
    current_version_id: versionId,
    updated_at: createdAt,
    current_version: {
      id: versionId,
      storage_bucket: "account-documents",
      storage_path: input.upload.storage_path,
      original_filename: input.upload.original_filename,
      mime_type: input.upload.mime_type,
      byte_size: input.upload.byte_size,
      sha256: input.upload.sha256,
      version_number: 1,
      created_at: createdAt
    },
    sync_state: "queued"
  };
  await Promise.all([
    cacheEntity(`documents:${input.tripId}`, document),
    cacheEntity("documents", document)
  ]);
  const dependencies = uploadOperations
    .filter((operation) => operation.operation === "upload_account_document")
    .map((operation) => operation.operationId);
  const associationOperation = await queueDocumentAssociation({
    documentId,
    uploadId: input.upload.id,
    rpc,
    dependsOn: dependencies
  });
  if (navigator.onLine) {
    await syncOutbox();
    const pending = await database.outbox.get(associationOperation);
    if (!pending) {
      await cacheEntity("account-document-uploads", {
        ...input.upload,
        associated_document_id: documentId,
        updated_at: new Date().toISOString(),
        sync_state: "synced"
      });
      return { ...(await getVaultDocument(documentId)), sync_state: "synced" };
    }
    return { ...document, sync_error: pending.lastErrorCode };
  }
  return document;
}

export async function retryAccountDocumentUpload(uploadId: string) {
  const operations = await pendingAccountUploadOperations([uploadId]);
  if (!operations.length) {
    if (!navigator.onLine) throw new Error("Reconnect to check this private upload.");
    const { data, error } = await client()
      .from("account_document_uploads")
      .select(accountDocumentUploadSelect)
      .eq("id", uploadId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("This private upload no longer exists.");
    const verified = data.stored_at
      ? {
          ...(data as AccountDocumentUpload),
          sync_state: "synced" as const,
          sync_error: undefined,
          can_retry: false,
          can_verify: false
        }
      : await verifyAccountDocumentObject(data as AccountDocumentUpload);
    await cacheEntity("account-document-uploads", verified);
    if (!verified.stored_at) {
      if (verified.sync_error === "storage_missing")
        throw new Error(
          "The cloud file is missing. Delete this unfinished entry and select the original again here, or retry on the device where it was added."
        );
      throw new Error(
        "Supabase could not verify this cloud file yet. Check your connection and try again."
      );
    }
    return { synced: 0, failed: 0 };
  }
  for (const operation of operations)
    await database.outbox.update(operation.operationId, {
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
      attemptCount: 0
    });
  const result = await syncOutbox();
  if (navigator.onLine) {
    const [remaining, response] = await Promise.all([
      pendingAccountUploadOperations([uploadId]),
      client()
        .from("account_document_uploads")
        .select(accountDocumentUploadSelect)
        .eq("id", uploadId)
        .maybeSingle()
    ]);
    if (response.error) throw response.error;
    if (response.data)
      await cacheEntity("account-document-uploads", {
        ...(response.data as AccountDocumentUpload),
        sync_state: response.data.stored_at && !remaining.length ? "synced" : "queued",
        sync_error:
          remaining[0]?.lastErrorCode ??
          (!response.data.stored_at && !remaining.length ? "storage_missing" : undefined),
        association_pending: remaining.some(
          (operation) => operation.operation === "associate_account_document"
        ),
        can_retry: Boolean(remaining.length)
      });
  }
  return result;
}

export async function deleteAccountDocumentUpload(upload: AccountDocumentUpload) {
  const actor = await userId();
  const operations = await pendingAccountUploadOperations([upload.id]);
  const neverAttemptedUpload = operations.some(
    (operation) => operation.operation === "upload_account_document" && operation.attemptCount === 0
  );
  if (
    !navigator.onLine &&
    (upload.stored_at || upload.sync_state === "synced" || !neverAttemptedUpload)
  ) {
    throw new Error(
      "Reconnect to delete this Document Inbox file. Only files still waiting for their first upload can be discarded offline; a cloud-backed file would reappear on the next sync."
    );
  }
  const association = operations.find(
    (operation) => operation.operation === "associate_account_document"
  );
  const documentId = association
    ? String(
        (association.payload as { rpc?: { requested_document_id?: string } }).rpc
          ?.requested_document_id ?? ""
      )
    : undefined;
  if (navigator.onLine) {
    const { data } = await client()
      .from("account_document_uploads")
      .select("associated_document_id")
      .eq("id", upload.id)
      .maybeSingle();
    if (data?.associated_document_id)
      throw new Error(
        "This file is already attached to a trip. Archive it from the Vault instead."
      );
    const { error: storageError } = await client()
      .storage.from("account-documents")
      .remove([upload.storage_path]);
    if (storageError && !/not found/i.test(storageError.message)) throw storageError;
    const { error: rowError } = await client()
      .from("account_document_uploads")
      .delete()
      .eq("id", upload.id)
      .is("associated_document_id", null);
    if (rowError) throw rowError;
  }
  await discardDocumentUploadOperations(upload.id, documentId);
  await removeOfflineFile(actor, upload.id);
  await database.entities.delete([actor, "account-document-uploads", upload.id]);
  if (documentId) {
    const documentRows = await database.entities
      .where("profileId")
      .equals(actor)
      .filter((row) => row.id === documentId)
      .toArray();
    await database.entities.bulkDelete(
      documentRows.map((row) => [row.profileId, row.entityType, row.id] as [string, string, string])
    );
  }
}

export async function uploadDocument(input: {
  tripId: string;
  title: string;
  category: DocumentCategory;
  purpose: DocumentPurpose;
  assignmentMode: DocumentAssignmentMode;
  visibility: DocumentVisibility;
  file: File;
  travelerIds?: string[];
  bookingId?: string;
  flightLegId?: string;
  journeyLegId?: string;
  shortLabel?: string;
  selectedUserIds?: string[];
}): Promise<VaultDocument> {
  validateDocumentFile(input.file);
  const checksum = await sha256(input.file);
  let existingDocuments: VaultDocument[];
  try {
    existingDocuments = await listVaultDocuments(input.tripId);
  } catch {
    existingDocuments = await readEntityList<VaultDocument>(`documents:${input.tripId}`);
  }
  const duplicate = findDuplicateDocument(existingDocuments, checksum);
  if (duplicate) throw new DuplicateDocumentError(duplicate.id, duplicate.title);
  const upload = await stageAccountDocument(input.file, checksum);
  return associateAccountDocument({ ...input, upload });
}

export async function downloadDocumentVersion(document: VaultDocument) {
  if (!document.current_version)
    throw new Error("This document does not have an uploaded file yet.");
  const { data, error } = await client()
    .storage.from(document.current_version.storage_bucket ?? "trip-documents")
    .download(document.current_version.storage_path);
  if (error) throw error;
  const checksum = await sha256(data);
  if (checksum !== document.current_version.sha256)
    throw new Error("The downloaded file failed its integrity check.");
  return ensureBlobMimeType(data, document.current_version.mime_type);
}

export async function replaceDocumentVersion(document: VaultDocument, file: File) {
  validateDocumentFile(file);
  const actor = await userId();
  const versionId = crypto.randomUUID();
  const checksum = await sha256(file);
  const now = new Date().toISOString();
  const storagePath = `trips/${document.trip_id}/documents/${document.id}/versions/${versionId}/${sanitizeFilename(file.name)}`;
  const versionRow = {
    id: versionId,
    document_id: document.id,
    version_number: (document.current_version?.version_number ?? 0) + 1,
    storage_bucket: "trip-documents" as const,
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type,
    byte_size: file.size,
    sha256: checksum,
    created_by: actor
  };
  const documentRow = {
    id: document.id,
    trip_id: document.trip_id,
    booking_id: document.booking_id,
    flight_leg_id: document.flight_leg_id,
    journey_leg_id: document.journey_leg_id ?? null,
    traveler_id: document.traveler_id,
    assignment_mode: document.assignment_mode ?? (document.traveler_id ? "selected" : "shared"),
    title: document.title,
    category: document.category,
    purpose: document.purpose,
    short_label: document.short_label,
    visibility: document.visibility,
    uploaded_by: actor
  };
  const updated: VaultDocument = {
    ...document,
    current_version_id: versionId,
    current_version: { ...versionRow, created_at: now },
    updated_at: now,
    sync_state: "queued"
  };
  await storeOfflineFile({
    profileId: actor,
    versionId,
    blob: file,
    sha256: checksum,
    pinReason: "created"
  });
  await Promise.all([
    cacheEntity(`documents:${document.trip_id}`, updated),
    cacheEntity("documents", updated)
  ]);
  await queueDocumentUpload({ document: documentRow, version: versionRow, storagePath });
  if (navigator.onLine) {
    await syncOutbox();
    try {
      return await getVaultDocument(document.id);
    } catch {
      /* keep queued local version for foreground retry */
    }
  }
  return updated;
}

export async function archiveDocument(document: VaultDocument) {
  const archived = { ...document, updated_at: new Date().toISOString() };
  if (!navigator.onLine) {
    const profileId = await localProfileId();
    if (profileId)
      await Promise.all([
        database.entities.delete([profileId, `documents:${document.trip_id}`, document.id]),
        database.entities.delete([profileId, "documents", document.id])
      ]);
    await queueDelete({
      entityType: `documents:${document.trip_id}`,
      table: "documents",
      entityId: document.id
    });
    return archived;
  }
  const { error } = await client()
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", document.id);
  if (error) throw error;
  return archived;
}

export async function listEventDocumentLinks(
  itineraryItemId: string
): Promise<EventDocumentLink[]> {
  const key = `event-documents:${itineraryItemId}`;
  const local = await readEntityList<EventDocumentLink & { id: string }>(key);
  if (!navigator.onLine) return local;
  try {
    const { data, error } = await client()
      .from("itinerary_item_documents")
      .select(
        `itinerary_item_id,document_id,label,sort_order,document:documents!inner(${documentSelect.replaceAll("current_version:", "current_version:")})`
      )
      .eq("itinerary_item_id", itineraryItemId)
      .is("deleted_at", null)
      .order("sort_order");
    if (error) throw error;
    const cloud = (
      (data ?? []) as unknown as (EventDocumentLink & { document: DocumentResponse })[]
    ).map((row) => ({
      ...row,
      document: normalizeVaultDocument(row.document),
      id: `${row.itinerary_item_id}:${row.document_id}`
    }));
    const profileId = await localProfileId();
    const pendingLinkIds = profileId
      ? new Set(
          (
            await database.outbox
              .where("profileId")
              .equals(profileId)
              .filter(
                (operation) => operation.operation === "create" && operation.entityType === key
              )
              .toArray()
          ).map((operation) => operation.entityId)
        )
      : new Set<string>();
    const merged = new Map(cloud.map((link) => [link.id, link]));
    for (const link of local) if (pendingLinkIds.has(link.id)) merged.set(link.id, link);
    const rows = [...merged.values()].sort((a, b) => a.sort_order - b.sort_order);
    await cacheEntityList(key, rows);
    return rows;
  } catch (error) {
    if (local.length) return local;
    throw error;
  }
}

export async function attachDocumentsToEvent(itineraryItem: ItineraryItem, documentIds: string[]) {
  const actor = await userId();
  const existing = await listEventDocumentLinks(itineraryItem.id);
  const newIds = documentIds.filter((id) => !existing.some((link) => link.document_id === id));
  if (!newIds.length) return existing;
  const pendingUploads = await pendingDocumentOperations(newIds);
  if (!navigator.onLine || pendingUploads.length > 0) {
    const documents = await readEntityList<VaultDocument>(`documents:${itineraryItem.trip_id}`);
    const created = newIds
      .map((documentId, index) => ({
        id: `${itineraryItem.id}:${documentId}`,
        itinerary_item_id: itineraryItem.id,
        document_id: documentId,
        label: null,
        sort_order: existing.length + index,
        document: documents.find((document) => document.id === documentId)!
      }))
      .filter((link) => link.document);
    for (const link of created)
      await queueCreate({
        entityType: `event-documents:${itineraryItem.id}`,
        table: "itinerary_item_documents",
        row: link,
        serverRow: {
          itinerary_item_id: link.itinerary_item_id,
          document_id: link.document_id,
          sort_order: link.sort_order,
          created_by: actor
        },
        dependsOn: pendingUploads
          .filter((operation) => operation.entityId === link.document_id)
          .map((operation) => operation.operationId)
      });
    if (navigator.onLine) await syncOutbox();
    return [...existing, ...created];
  }
  const { error } = await client()
    .from("itinerary_item_documents")
    .insert(
      newIds.map((documentId, index) => ({
        itinerary_item_id: itineraryItem.id,
        document_id: documentId,
        sort_order: existing.length + index,
        created_by: actor
      }))
    );
  if (error) throw error;
  return listEventDocumentLinks(itineraryItem.id);
}

export async function unlinkDocumentFromEvent(itineraryItemId: string, documentId: string) {
  if (!navigator.onLine) {
    const profile = await localProfileId();
    if (profile)
      await database.entities.delete([
        profile,
        `event-documents:${itineraryItemId}`,
        `${itineraryItemId}:${documentId}`
      ]);
    await queueDelete({
      entityType: `event-documents:${itineraryItemId}`,
      table: "itinerary_item_documents",
      entityId: `${itineraryItemId}:${documentId}`,
      match: { itinerary_item_id: itineraryItemId, document_id: documentId }
    });
    return;
  }
  const { error } = await client()
    .from("itinerary_item_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("itinerary_item_id", itineraryItemId)
    .eq("document_id", documentId);
  if (error) throw error;
}

export async function reorderEventDocuments(itineraryItemId: string, orderedDocumentIds: string[]) {
  if (!navigator.onLine) {
    const existing = await readEntityList<EventDocumentLink & { id: string }>(
      `event-documents:${itineraryItemId}`
    );
    for (const [sortOrder, documentId] of orderedDocumentIds.entries()) {
      const link = existing.find((item) => item.document_id === documentId);
      if (!link) continue;
      await queueCreate({
        entityType: `event-documents:${itineraryItemId}`,
        table: "itinerary_item_documents",
        row: { ...link, sort_order: sortOrder },
        serverRow: {
          itinerary_item_id: itineraryItemId,
          document_id: documentId,
          sort_order: sortOrder
        }
      });
    }
    return;
  }
  const results = await Promise.all(
    orderedDocumentIds.map((documentId, sortOrder) =>
      client()
        .from("itinerary_item_documents")
        .update({ sort_order: sortOrder })
        .eq("itinerary_item_id", itineraryItemId)
        .eq("document_id", documentId)
    )
  );
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw failure;
}

type MapLocation =
  | string
  | { label?: string; address?: string; latitude?: number | null; longitude?: number | null };

function mapDestination(location: MapLocation) {
  if (typeof location === "string") return location;
  if (typeof location.latitude === "number" && typeof location.longitude === "number")
    return `${location.latitude},${location.longitude}`;
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
    const cached = (await readEntityList<UserProfile & { email?: string }>("profiles")).find(
      (profile) => profile.id === actor
    );
    if (!cached)
      throw new Error("Open Profile once while connected to keep these account details offline.");
    return { profile: cached, email: cached.email ?? "" };
  }
  const { data: authData } = await client().auth.getUser();
  const { data, error } = await client()
    .from("profiles")
    .select("id,display_name,home_timezone,avatar_path")
    .eq("id", actor)
    .single();
  if (error) throw error;
  const profile = { ...(data as UserProfile), email: authData.user?.email ?? "" };
  await cacheEntity("profiles", profile);
  return { profile, email: profile.email };
}

export async function updateProfile(input: { displayName: string; homeTimezone: string }) {
  const actor = await userId();
  if (!navigator.onLine) {
    const current = await getProfile();
    const profile = {
      ...current.profile,
      display_name: input.displayName,
      home_timezone: input.homeTimezone,
      email: current.email
    };
    await queueUpdate({
      entityType: "profiles",
      table: "profiles",
      row: profile,
      patch: { display_name: input.displayName, home_timezone: input.homeTimezone }
    });
    return profile;
  }
  const { data, error } = await client()
    .from("profiles")
    .update({ display_name: input.displayName, home_timezone: input.homeTimezone })
    .eq("id", actor)
    .select("id,display_name,home_timezone,avatar_path")
    .single();
  if (error) throw error;
  const profile = data as UserProfile;
  const { data: authData } = await client().auth.getUser();
  await cacheEntity("profiles", { ...profile, email: authData.user?.email ?? "" });
  return profile;
}

export async function listNotes(tripId: string): Promise<TripNote[]> {
  return networkWithCache(`notes:${tripId}`, async () => {
    const { data, error } = await client()
      .from("notes")
      .select("id,trip_id,title,body,version,created_at,updated_at")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as TripNote[];
  });
}

export async function addNote(input: { tripId: string; title?: string; body: string }) {
  const actor = await userId();
  const now = new Date().toISOString();
  const note: TripNote = {
    id: crypto.randomUUID(),
    trip_id: input.tripId,
    title: input.title || null,
    body: input.body,
    created_at: now,
    updated_at: now
  };
  const row = { ...note, created_by: actor };
  if (!navigator.onLine) {
    await queueCreate({ entityType: `notes:${input.tripId}`, table: "notes", row });
    return note;
  }
  const { data, error } = await client()
    .from("notes")
    .insert(row)
    .select("id,trip_id,title,body,version,created_at,updated_at")
    .single();
  if (error) throw error;
  await cacheEntity(`notes:${input.tripId}`, data as TripNote);
  return data as TripNote;
}

export async function updateNote(input: { note: TripNote; title?: string; body: string }) {
  const patch = { title: input.title || null, body: input.body };
  if (!navigator.onLine) {
    const updated = {
      ...input.note,
      ...patch,
      version: (input.note.version ?? 1) + 1,
      updated_at: new Date().toISOString()
    };
    await queueUpdate({
      entityType: `notes:${input.note.trip_id}`,
      table: "notes",
      row: updated,
      patch,
      baseVersion: input.note.version
    });
    return updated;
  }
  let request = client().from("notes").update(patch).eq("id", input.note.id);
  if (input.note.version !== undefined) request = request.eq("version", input.note.version);
  const { data, error } = await request
    .select("id,trip_id,title,body,version,created_at,updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This note changed on another device. Refresh before saving.");
  await cacheEntity(`notes:${input.note.trip_id}`, data as TripNote);
  return data as TripNote;
}

export async function archiveNote(note: TripNote) {
  if (!navigator.onLine) {
    const profileId = await userId();
    await database.entities.delete([profileId, `notes:${note.trip_id}`, note.id]);
    await queueDelete({ entityType: `notes:${note.trip_id}`, table: "notes", entityId: note.id });
    return;
  }
  const { error } = await client()
    .from("notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", note.id);
  if (error) throw error;
}
