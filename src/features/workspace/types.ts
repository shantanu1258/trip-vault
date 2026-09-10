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

export type TravelerManager = {
  traveler_id: string;
  user_id: string;
  can_view_documents: boolean;
  can_manage_documents: boolean;
  can_edit_profile: boolean;
};

export const bookingTypes = ["flight", "hotel", "transport", "activity", "restaurant", "other"] as const;
export type BookingType = (typeof bookingTypes)[number];

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
  location: { label?: string; address?: string; latitude?: number | null; longitude?: number | null } | null;
  details: Record<string, unknown>;
  version?: number;
  created_at: string;
  updated_at?: string;
};

export const flightStatuses = ["scheduled", "check_in_open", "boarding", "delayed", "departed", "landed", "cancelled"] as const;
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

export const requirementTypes = ["visa", "passport", "insurance", "check_in", "payment", "packing", "custom"] as const;
export const requirementStatuses = ["to_check", "not_required", "required", "in_progress", "complete", "expired"] as const;
export type RequirementType = (typeof requirementTypes)[number];
export type RequirementStatus = (typeof requirementStatuses)[number];

export type Requirement = {
  id: string;
  trip_id: string;
  type: RequirementType;
  title: string;
  destination_country_code: string | null;
  visa_type: string | null;
  status: RequirementStatus;
  due_date: string | null;
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
  issuedOn?: string;
  expiresOn?: string;
  validityBufferDays?: number;
  officialGuidanceUrl?: string;
  linkedDocumentId?: string;
  notes?: string;
  travelerIds?: string[];
};

export type UpdateRequirementInput = RequirementInput & { id: string; version?: number };

export const documentCategories = ["flight", "hotel", "visa", "passport", "insurance", "ticket", "transport", "receipt", "other"] as const;
export const documentPurposes = ["confirmation", "ticket", "boarding_pass", "baggage_tag", "visa", "passport", "insurance", "other"] as const;
export const documentVisibilities = ["private", "traveler_and_managers", "trip", "selected_members"] as const;
export type DocumentCategory = (typeof documentCategories)[number];
export type DocumentPurpose = (typeof documentPurposes)[number];
export type DocumentVisibility = (typeof documentVisibilities)[number];

export type DocumentVersion = {
  id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  version_number: number;
  created_at: string;
};

export type VaultDocument = {
  id: string;
  trip_id: string;
  booking_id: string | null;
  flight_leg_id: string | null;
  traveler_id: string | null;
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
  travelerIds?: string[];
};

export type UpdateBookingInput = CreateBookingInput & { id: string; version?: number };

export type CreateFlightInput = {
  tripId: string;
  title: string;
  airlineName: string;
  flightNumber: string;
  referenceCode?: string;
  departureCode?: string;
  departureName: string;
  arrivalCode?: string;
  arrivalName: string;
  departureAt: string;
  arrivalAt: string;
  departureTimezone: string;
  arrivalTimezone: string;
  travelerIds?: string[];
};
