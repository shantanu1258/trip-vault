import type { ParticipantScope } from "../trips/types";

export type MemberRole = "owner" | "editor" | "viewer";
export type ParticipationType = "traveler" | "collaborator";

export type TripMember = {
  user_id: string;
  role: MemberRole;
  participation_type: ParticipationType;
  joined_at: string | null;
  display_name: string;
};

export type UserProfile = {
  id: string;
  display_name: string;
  home_timezone: string;
  avatar_path: string | null;
};

export type TripNote = {
  id: string;
  trip_id: string;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  version?: number;
};

export type Traveler = {
  id: string;
  trip_id: string;
  display_name: string;
  is_minor: boolean;
  created_at: string;
  version?: number;
  status?: "active" | "removed";
};

export type TripInvitation = {
  id: string;
  trip_id: string;
  target_type: "traveler" | "collaborator";
  traveler_id: string | null;
  role: Exclude<MemberRole, "owner">;
  expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type AssociatedAccount = {
  user_id: string;
  display_name: string;
};

export type TripMembershipOffer = {
  id: string;
  trip_id: string;
  trip_title: string;
  destination_summary: string;
  start_date: string;
  end_date: string;
  target_type: "traveler" | "collaborator";
  traveler_id: string | null;
  traveler_name: string | null;
  role: Exclude<MemberRole, "owner">;
  offered_by_name: string;
  created_at: string;
};

export type BookingTraveler = {
  id: string;
  booking_id: string;
  traveler_id: string;
};

export type RequirementAssignee = {
  id: string;
  requirement_id: string;
  traveler_id: string;
  completed_at?: string | null;
};

export type TravelerManager = {
  traveler_id: string;
  user_id: string;
  can_view_documents: boolean;
  can_manage_documents: boolean;
  can_edit_profile: boolean;
};

export const bookingTypes = [
  "flight",
  "hotel",
  "train",
  "bus",
  "ferry",
  "cab",
  "transport",
  "activity",
  "restaurant",
  "other"
] as const;
export type BookingType = (typeof bookingTypes)[number];
export type JourneyScope = "domestic" | "international";
export type JourneyMode = "train" | "bus" | "ferry" | "cab";
export type ReservationState = "planned" | "walk_up" | "booked";

export type TrainJourneyDetails = {
  kind: "train";
  train_name?: string;
  booked_from_name?: string;
  booked_from_code?: string;
  travel_class?: string;
  quota?: string;
  booking_status?: string;
  current_status?: string;
};

export type BusJourneyDetails = {
  kind: "bus";
  bus_class_or_layout?: string;
  shared_ticket_number?: string;
  boarding_point_details?: string;
  dropoff_point_details?: string;
};

export type FerryJourneyDetails = {
  kind: "ferry";
  direction?: "one_way" | "outbound" | "return";
  ticket_timing?: "fixed" | "open_date" | "open_return";
  seating?: "free" | "assigned" | "unknown";
  seller_reference?: string;
  operator_reference?: string;
  accommodation?: string;
  vessel_name?: string;
  departure_gate?: string;
  baggage_allowance?: string;
  related_sailing_id?: string;
  vehicle?: {
    type?: string;
    registration?: string;
    length_cm?: number;
    height_cm?: number;
  };
};

export type CabJourneyDetails = {
  kind: "cab";
  ride_type: "local" | "airport_transfer" | "outstation" | "hourly";
  cross_border?: boolean;
  linked_flight_leg_id?: string;
  pickup_buffer_minutes?: number;
  luggage_count?: number;
  pickup_instructions?: string;
  vehicle_class?: string;
  driver_name?: string;
  driver_phone?: string;
  vehicle_registration?: string;
  trip_shape?: "one_way" | "round_trip";
  return_at?: string;
  package_duration_minutes?: number;
  final_dropoff?: string;
};

export type JourneyLegDetails =
  | TrainJourneyDetails
  | BusJourneyDetails
  | FerryJourneyDetails
  | CabJourneyDetails;

export type Booking = {
  id: string;
  trip_id: string;
  type: BookingType;
  title: string;
  provider: string | null;
  reference_code: string | null;
  start_at: string | null;
  end_at: string | null;
  source_timezone: string | null;
  location: {
    label?: string;
    address?: string;
    map_url?: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  details: Record<string, unknown>;
  reservation_state?: ReservationState;
  participant_scope?: ParticipantScope;
  journey_scope?: JourneyScope | null;
  booked_via_name?: string | null;
  booked_via_url?: string | null;
  booking_vendor_catalog_key?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  version?: number;
  created_at: string;
  updated_at?: string;
};

export const flightStatuses = [
  "scheduled",
  "check_in_open",
  "boarding",
  "delayed",
  "departed",
  "landed",
  "cancelled"
] as const;
export type FlightStatus = (typeof flightStatuses)[number];

export type FlightLeg = {
  id: string;
  booking_id: string;
  segment_order: number;
  airline_name: string;
  marketing_airline_id?: string | null;
  operating_airline_id?: string | null;
  flight_number: string;
  departure_airport_code: string | null;
  departure_airport_name: string;
  arrival_airport_code: string | null;
  arrival_airport_name: string;
  scheduled_departure_at: string;
  scheduled_arrival_at: string;
  estimated_departure_at: string | null;
  estimated_arrival_at: string | null;
  actual_departure_at: string | null;
  actual_arrival_at: string | null;
  departure_timezone: string;
  arrival_timezone: string;
  boarding_at: string | null;
  boarding_lead_minutes?: number | null;
  journey_scope?: JourneyScope | null;
  departure_country_code?: string | null;
  arrival_country_code?: string | null;
  departure_terminal: string | null;
  departure_gate: string | null;
  arrival_terminal: string | null;
  arrival_gate: string | null;
  baggage_claim: string | null;
  status: FlightStatus;
  status_note: string | null;
  status_updated_by: string;
  status_updated_at: string;
  version?: number;
};

export type JourneyLeg = {
  id: string;
  booking_id: string;
  segment_order: number;
  mode: JourneyMode;
  operator_name: string | null;
  service_number: string | null;
  origin_code: string | null;
  origin_name: string;
  origin_country_code: string | null;
  origin_timezone: string;
  destination_code: string | null;
  destination_name: string;
  destination_country_code: string | null;
  destination_timezone: string;
  scheduled_departure_at: string;
  scheduled_arrival_at: string | null;
  boarding_at: string | null;
  boarding_lead_minutes: number | null;
  departure_platform: string | null;
  arrival_platform: string | null;
  coach_or_cabin: string | null;
  seat: string | null;
  details?: JourneyLegDetails | Record<string, never>;
  status_note: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
};

export type CabStop = {
  id: string;
  journey_leg_id: string;
  stop_order: number;
  title: string;
  location: {
    label?: string;
    address?: string;
    map_url?: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  arrives_at: string | null;
  departs_at: string | null;
  timezone: string;
  notes: string | null;
  linked_itinerary_item_id: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type CabStopInput = {
  tripId: string;
  journeyLegId: string;
  title: string;
  location?: string;
  mapUrl?: string;
  arrivesAt?: string;
  departsAt?: string;
  timezone: string;
  notes?: string;
  linkedItineraryItemId?: string;
  stopOrder?: number;
};

export type UpdateCabStopInput = CabStopInput & {
  id: string;
  version?: number;
};

export type JourneyLegTraveler = {
  id: string;
  journey_leg_id: string;
  traveler_id: string;
  seat_or_berth: string | null;
  coach_or_cabin: string | null;
  passenger_reference: string | null;
  updated_at?: string;
};

export type FlightTraveler = {
  id: string;
  flight_leg_id: string;
  traveler_id: string;
  seat: string | null;
  boarding_group: string | null;
  ticket_number: string | null;
};

export type TripAirline = {
  id: string;
  trip_id: string;
  name: string;
  iata_code: string | null;
  icao_code: string | null;
  check_in_url_template: string | null;
  manage_booking_url_template: string | null;
  status_url_template: string | null;
  tracker_url_template: string | null;
  brand_color: string | null;
  metadata_source: string;
  source_catalog_key: string | null;
  source_config_version: number | null;
  version: number;
};

export const requirementTypes = [
  "visa",
  "passport",
  "insurance",
  "check_in",
  "payment",
  "packing",
  "custom"
] as const;
export const requirementStatuses = [
  "to_check",
  "not_required",
  "required",
  "in_progress",
  "complete",
  "expired"
] as const;
export type RequirementType = (typeof requirementTypes)[number];
export type RequirementStatus = (typeof requirementStatuses)[number];
export type RequirementTimingMode = "unscheduled" | "date_only" | "relative";

export type Requirement = {
  id: string;
  trip_id: string;
  type: RequirementType;
  title: string;
  destination_country_code: string | null;
  visa_type: string | null;
  status: RequirementStatus;
  due_date: string | null;
  timing_mode?: RequirementTimingMode;
  anchor_itinerary_item_id?: string | null;
  relative_position?: "before" | "after" | null;
  offset_minutes?: number | null;
  issued_on: string | null;
  expires_on: string | null;
  validity_buffer_days: number | null;
  official_guidance_url: string | null;
  guidance_checked_at: string | null;
  linked_document_id: string | null;
  notes: string | null;
  version?: number;
};

export type RequirementInput = {
  tripId: string;
  type: RequirementType;
  title: string;
  status: RequirementStatus;
  destinationCountryCode?: string;
  visaType?: string;
  dueDate?: string;
  timingMode?: RequirementTimingMode;
  anchorItineraryItemId?: string;
  relativePosition?: "before" | "after";
  offsetMinutes?: number;
  issuedOn?: string;
  expiresOn?: string;
  validityBufferDays?: number;
  officialGuidanceUrl?: string;
  linkedDocumentId?: string;
  notes?: string;
  travelerIds?: string[];
};

export type UpdateRequirementInput = RequirementInput & { id: string; version?: number };

export const documentCategories = [
  "flight",
  "hotel",
  "activity",
  "visa",
  "arrival_card",
  "passport",
  "insurance",
  "ticket",
  "transport",
  "receipt",
  "other"
] as const;
export const documentPurposes = [
  "confirmation",
  "ticket",
  "boarding_pass",
  "baggage_tag",
  "visa",
  "arrival_card",
  "passport",
  "insurance",
  "hotel_confirmation",
  "activity_ticket",
  "meal_voucher",
  "receipt",
  "other"
] as const;
export const documentVisibilities = [
  "private",
  "traveler_and_managers",
  "trip",
  "selected_members"
] as const;
export type DocumentCategory = (typeof documentCategories)[number];
export type DocumentPurpose = (typeof documentPurposes)[number];
export type DocumentVisibility = (typeof documentVisibilities)[number];
export type DocumentAssignmentMode = "shared" | "selected" | "unassigned";

export type DocumentVersion = {
  id: string;
  storage_bucket?: "trip-documents" | "account-documents";
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  version_number: number;
  created_at: string;
};

export type AccountDocumentUpload = {
  id: string;
  owner_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  associated_document_id: string | null;
  stored_at: string | null;
  created_at: string;
  updated_at: string;
  sync_state?: "queued" | "synced";
  sync_error?: string;
  association_pending?: boolean;
  can_retry?: boolean;
  can_verify?: boolean;
  personal_title?: string | null;
  personal_kind?: "passport" | "aadhaar" | "identity" | "insurance" | "other" | null;
  personal_label?: string | null;
};

export type VaultDocument = {
  id: string;
  trip_id: string;
  booking_id: string | null;
  flight_leg_id: string | null;
  journey_leg_id?: string | null;
  traveler_id: string | null;
  assignment_mode?: DocumentAssignmentMode;
  traveler_ids?: string[];
  title: string;
  category: DocumentCategory;
  purpose: DocumentPurpose;
  short_label: string | null;
  visibility: DocumentVisibility;
  uploaded_by?: string;
  current_version_id: string | null;
  updated_at: string;
  deleted_at?: string | null;
  current_version?: DocumentVersion | null;
  sync_state?: "synced" | "queued";
  sync_error?: string;
};

export type EventDocumentLink = {
  itinerary_item_id: string;
  document_id: string;
  label: string | null;
  sort_order: number;
  document: VaultDocument;
};

export type CreateBookingInput = {
  tripId: string;
  type: BookingType;
  title: string;
  provider?: string;
  referenceCode?: string;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  location?: string;
  notes?: string;
  bookingDetails?: Record<string, unknown>;
  reservationState?: ReservationState;
  participantScope?: ParticipantScope;
  journeyScope?: JourneyScope;
  bookedViaName?: string;
  bookedViaUrl?: string;
  bookingVendorCatalogKey?: string;
  contactName?: string;
  contactPhone?: string;
  travelerIds?: string[];
};

export type UpdateBookingInput = CreateBookingInput & { id: string; version?: number };

export type CreateFlightInput = {
  tripId: string;
  title: string;
  referenceCode: string;
  journeyScope: JourneyScope;
  bookedViaName?: string;
  bookedViaUrl?: string;
  contactName?: string;
  contactPhone?: string;
  reservationState?: ReservationState;
  participantScope?: ParticipantScope;
  legs: Array<{
    airlineName: string;
    flightNumber: string;
    departureCode?: string;
    departureName: string;
    departureCountryCode?: string;
    arrivalCode?: string;
    arrivalName: string;
    arrivalCountryCode?: string;
    departureAt: string;
    arrivalAt: string;
    departureTimezone: string;
    arrivalTimezone: string;
    boardingAt?: string;
    boardingLeadMinutes?: number;
    departureTerminal?: string;
    departureGate?: string;
    arrivalTerminal?: string;
    travelerAllocations?: Array<{
      travelerId: string;
      seat?: string;
      boardingGroup?: string;
      ticketNumber?: string;
    }>;
  }>;
  travelerIds?: string[];
  cost?: {
    title: string;
    amountMinor: number;
    currencyCode: string;
    paymentStatus: "planned" | "paid";
    paidByTravelerId?: string;
    participantTravelerIds?: string[];
  };
};

export type AddFlightConnectionInput = {
  tripId: string;
  bookingId: string;
  journeyScope: JourneyScope;
  airlineName: string;
  flightNumber: string;
  departureCode?: string;
  departureName: string;
  departureCountryCode?: string;
  arrivalCode?: string;
  arrivalName: string;
  arrivalCountryCode?: string;
  departureAt: string;
  arrivalAt: string;
  departureTimezone: string;
  arrivalTimezone: string;
  boardingLeadMinutes?: number;
};

export type CreateJourneyInput = {
  tripId: string;
  title: string;
  mode: JourneyMode;
  referenceCode?: string;
  reservationState?: ReservationState;
  participantScope?: ParticipantScope;
  journeyScope?: JourneyScope;
  bookedViaName?: string;
  bookedViaUrl?: string;
  contactName?: string;
  contactPhone?: string;
  bookingDetails?: Record<string, unknown>;
  travelerIds?: string[];
  legs: Array<{
    operatorName?: string;
    serviceNumber?: string;
    originCode?: string;
    originName: string;
    originCountryCode?: string;
    originTimezone: string;
    destinationCode?: string;
    destinationName: string;
    destinationCountryCode?: string;
    destinationTimezone: string;
    departureAt: string;
    arrivalAt?: string;
    boardingAt?: string;
    boardingLeadMinutes?: number;
    departurePlatform?: string;
    arrivalPlatform?: string;
    details?: JourneyLegDetails;
    travelerAllocations?: Array<{
      travelerId: string;
      seatOrBerth?: string;
      coachOrCabin?: string;
      passengerReference?: string;
    }>;
  }>;
  cost?: {
    title: string;
    amountMinor: number;
    currencyCode: string;
    paymentStatus: "planned" | "paid";
    paidByTravelerId?: string;
    participantTravelerIds?: string[];
  };
};

export type UpdateJourneyLegInput = {
  tripId: string;
  legId: string;
  version?: number;
  operatorName?: string;
  serviceNumber?: string;
  originCode?: string;
  originName: string;
  originCountryCode?: string;
  originTimezone: string;
  destinationCode?: string;
  destinationName: string;
  destinationCountryCode?: string;
  destinationTimezone: string;
  departureAt: string;
  arrivalAt?: string;
  boardingAt?: string;
  boardingLeadMinutes?: number;
  departurePlatform?: string;
  arrivalPlatform?: string;
  details: JourneyLegDetails;
  itineraryTiming?: {
    timingMode: "exact" | "relative";
    anchorItineraryItemId?: string;
    relativePosition?: "before" | "after";
  };
  eventTimezone?: string;
};
