import { ChevronDown, FileText, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DocumentVisibilityBadge } from "../../components/DocumentVisibilityBadge";
import { travelerGroup } from "./EventDocuments";
import type { Traveler, VaultDocument } from "./types";

export function primaryBookingDocument(documents: VaultDocument[]) {
  const purposes = [
    "boarding_pass",
    "ticket",
    "activity_ticket",
    "hotel_confirmation",
    "confirmation"
  ];
  const candidates = purposes.flatMap((purpose) =>
    documents.filter((document) => document.purpose === purpose)
  );
  const assignedIds = (document: VaultDocument) =>
    document.traveler_ids?.length
      ? document.traveler_ids
      : document.traveler_id
        ? [document.traveler_id]
        : [];
  const shared = candidates.find(
    (document) => !assignedIds(document).length && document.assignment_mode !== "unassigned"
  );
  if (shared) return shared;
  // Everyone must not silently open an arbitrary passenger's admission/boarding pass.
  const owners = new Set(candidates.flatMap(assignedIds));
  return candidates.length === 1 || owners.size === 1 ? candidates[0] : undefined;
}

/** Reading-first disclosure; unlike form sections, populated fields do not auto-open it. */
export function BookingDisclosure({
  title,
  hint,
  children,
  open = false
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details
      className="group/booking rounded-xl border border-line bg-surface"
      open={open || undefined}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <strong className="block break-words text-sm [overflow-wrap:anywhere]">{title}</strong>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition group-open/booking:rotate-180"
        />
      </summary>
      <div className="border-t border-line p-3">{children}</div>
    </details>
  );
}

export function BookingDocuments({
  documents,
  travelers,
  focusedTravelerId,
  navigationState,
  onUpload
}: {
  documents: VaultDocument[];
  travelers: Traveler[];
  focusedTravelerId?: string | null;
  navigationState?: unknown;
  onUpload: () => void;
}) {
  const priority = (doc: VaultDocument) =>
    ["boarding_pass", "ticket", "activity_ticket", "hotel_confirmation", "confirmation"].indexOf(
      doc.purpose
    );
  const groups = new Map<
    string,
    ReturnType<typeof travelerGroup> & { documents: VaultDocument[] }
  >();
  for (const document of documents) {
    const group = travelerGroup(document, travelers);
    const existing = groups.get(group.key) ?? { ...group, documents: [] };
    existing.documents.push(document);
    groups.set(group.key, existing);
  }
  const rows = (items: VaultDocument[]) =>
    [...items]
      .sort((a, b) => (priority(a) < 0 ? 99 : priority(a)) - (priority(b) < 0 ? 99 : priority(b)))
      .map((document) => (
        <Link
          key={document.id}
          to={`/trips/${document.trip_id}/documents/${document.id}`}
          state={navigationState}
          className="flex min-h-11 min-w-0 max-w-full overflow-hidden items-start gap-2 rounded-lg px-2 py-2 text-sm hover:bg-elevated focus-visible:ring-2 focus-visible:ring-brand"
        >
          <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <strong className="block whitespace-normal break-words [overflow-wrap:anywhere]">
              {document.short_label || document.title}
            </strong>
            <DocumentVisibilityBadge className="mt-1" visibility={document.visibility} />
          </span>
        </Link>
      ));
  return (
    <section
      id="booking-documents"
      aria-label="Booking documents"
      className="rounded-xl border border-line bg-surface p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">
          Documents <span className="text-sm font-normal text-muted">{documents.length}</span>
        </h2>
      </div>
      {!documents.length && <p className="text-sm text-muted">No documents attached yet.</p>}
      <div className="space-y-2">
        {[...groups.values()]
          .sort((a, b) => a.order - b.order)
          .map((group) =>
            groups.size === 1 || focusedTravelerId || group.key === "shared" ? (
              <div key={group.key}>
                {groups.size > 1 && (
                  <p className="px-2 text-xs font-bold text-muted">{group.label}</p>
                )}
                {rows(group.documents)}
              </div>
            ) : (
              <BookingDisclosure
                key={group.key}
                title={group.label}
                hint={`${group.documents.length} documents`}
              >
                {rows(group.documents)}
              </BookingDisclosure>
            )
          )}
      </div>
      <button
        type="button"
        className={
          documents.length
            ? "tap-target mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-brand hover:bg-brand-soft"
            : "primary-button mt-3 text-sm"
        }
        onClick={onUpload}
      >
        <Plus aria-hidden="true" className="size-4" /> Upload
      </button>
    </section>
  );
}
