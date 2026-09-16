import type {
  DocumentAssignmentMode,
  DocumentCategory,
  DocumentPurpose,
  Traveler,
  VaultDocument
} from "./types";

export type DocumentKind =
  | "flight_ticket"
  | "boarding_pass"
  | "baggage_tag"
  | "visa"
  | "passport"
  | "hotel_confirmation"
  | "journey_ticket"
  | "activity_confirmation"
  | "activity_ticket"
  | "meal_voucher"
  | "receipt"
  | "insurance"
  | "booking_confirmation"
  | "other";

export type DocumentKindOption = {
  value: DocumentKind;
  label: string;
  hint: string;
  category: DocumentCategory;
  purpose: DocumentPurpose;
  defaultAssignment: DocumentAssignmentMode;
};

export const documentKinds: readonly DocumentKindOption[] = [
  {
    value: "flight_ticket",
    label: "Flight ticket",
    hint: "E-ticket or itinerary for one or more passengers",
    category: "flight",
    purpose: "ticket",
    defaultAssignment: "shared"
  },
  {
    value: "boarding_pass",
    label: "Boarding pass",
    hint: "Usually belongs to one traveler",
    category: "flight",
    purpose: "boarding_pass",
    defaultAssignment: "selected"
  },
  {
    value: "baggage_tag",
    label: "Baggage tag",
    hint: "Bag receipt or tracking stub",
    category: "flight",
    purpose: "baggage_tag",
    defaultAssignment: "selected"
  },
  {
    value: "visa",
    label: "Visa",
    hint: "Personal entry permission",
    category: "visa",
    purpose: "visa",
    defaultAssignment: "selected"
  },
  {
    value: "passport",
    label: "Passport",
    hint: "Personal identity document",
    category: "passport",
    purpose: "passport",
    defaultAssignment: "selected"
  },
  {
    value: "hotel_confirmation",
    label: "Hotel / stay confirmation",
    hint: "Usually shared by everyone on the stay",
    category: "hotel",
    purpose: "hotel_confirmation",
    defaultAssignment: "shared"
  },
  {
    value: "journey_ticket",
    label: "Train, bus, ferry or cab ticket",
    hint: "Ticket or booking for another journey",
    category: "transport",
    purpose: "ticket",
    defaultAssignment: "shared"
  },
  {
    value: "activity_confirmation",
    label: "Activity confirmation",
    hint: "Shared order or reservation confirmation",
    category: "activity",
    purpose: "confirmation",
    defaultAssignment: "shared"
  },
  {
    value: "activity_ticket",
    label: "Activity admission ticket",
    hint: "QR, barcode or entry ticket",
    category: "activity",
    purpose: "activity_ticket",
    defaultAssignment: "unassigned"
  },
  {
    value: "meal_voucher",
    label: "Meal voucher",
    hint: "Redeemable meal ticket or QR",
    category: "activity",
    purpose: "meal_voucher",
    defaultAssignment: "unassigned"
  },
  {
    value: "receipt",
    label: "Receipt / payment proof",
    hint: "Order-level payment record",
    category: "receipt",
    purpose: "receipt",
    defaultAssignment: "shared"
  },
  {
    value: "insurance",
    label: "Travel insurance",
    hint: "Policy or certificate",
    category: "insurance",
    purpose: "insurance",
    defaultAssignment: "selected"
  },
  {
    value: "booking_confirmation",
    label: "Other booking confirmation",
    hint: "Confirmation not covered above",
    category: "other",
    purpose: "confirmation",
    defaultAssignment: "shared"
  },
  {
    value: "other",
    label: "Other document",
    hint: "Anything else needed during the trip",
    category: "other",
    purpose: "other",
    defaultAssignment: "unassigned"
  }
] as const;

export function documentKind(value: DocumentKind) {
  return documentKinds.find((option) => option.value === value) ?? documentKinds.at(-1)!;
}

export function suggestedDocumentTitle(
  kind: DocumentKind,
  assignmentMode: DocumentAssignmentMode,
  travelerIds: string[],
  travelers: Traveler[],
  contextTitle?: string
) {
  const label = documentKind(kind).label;
  const context = contextTitle?.trim() ? ` · ${contextTitle.trim()}` : "";
  if (assignmentMode === "shared") return `${label} · Everyone${context}`;
  if (assignmentMode === "unassigned") return `${label} · Assign later${context}`;
  const selectedNames = travelerIds
    .map((id) => travelers.find((traveler) => traveler.id === id)?.display_name)
    .filter((name): name is string => Boolean(name));
  if (!selectedNames.length) return `${label} · Choose traveler${context}`;
  if (selectedNames.length <= 3) return `${label} · ${selectedNames.join(", ")}${context}`;
  return `${label} · ${selectedNames.length} travelers${context}`;
}

const purposeLabels: Record<DocumentPurpose, string> = {
  confirmation: "Booking confirmation",
  ticket: "Ticket",
  boarding_pass: "Boarding pass",
  baggage_tag: "Baggage tag",
  visa: "Visa",
  passport: "Passport",
  insurance: "Travel insurance",
  hotel_confirmation: "Stay confirmation",
  activity_ticket: "Activity ticket",
  meal_voucher: "Meal voucher",
  receipt: "Receipt",
  other: "Document"
};

export function documentPurposeLabel(purpose: DocumentPurpose) {
  return purposeLabels[purpose] ?? purpose.replaceAll("_", " ");
}

export function documentAssignmentLabel(
  document: VaultDocument,
  travelerNames: Map<string, string>
) {
  const mode = document.assignment_mode ?? (document.traveler_id ? "selected" : "shared");
  if (mode === "shared") return "Everyone on this booking or event";
  if (mode === "unassigned") return "Assign later";
  const ids = document.traveler_ids?.length
    ? document.traveler_ids
    : document.traveler_id
      ? [document.traveler_id]
      : [];
  const names = ids
    .map((id) => travelerNames.get(id))
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : "Selected traveler(s)";
}

export function documentMatchesTraveler(document: VaultDocument, travelerId: string) {
  const mode = document.assignment_mode ?? (document.traveler_id ? "selected" : "shared");
  if (mode === "shared") return true;
  if (mode === "unassigned") return false;
  return (
    document.traveler_ids?.length
      ? document.traveler_ids
      : document.traveler_id
        ? [document.traveler_id]
        : []
  ).includes(travelerId);
}

export function findDuplicateDocument(documents: VaultDocument[], checksum: string) {
  return documents.find(
    (document) => document.current_version?.sha256.toLowerCase() === checksum.toLowerCase()
  );
}
