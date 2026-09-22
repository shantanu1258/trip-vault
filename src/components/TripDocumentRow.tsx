import { ChevronRight } from "lucide-react";
import { TripChildLink } from "./TripChildLink";
import { documentAudienceSummary } from "../features/home/needNow";
import { documentPurposeLabel } from "../features/workspace/documentModel";
import type { Traveler, VaultDocument } from "../features/workspace/types";
import { DocumentVisibilityIcon } from "./DocumentVisibilityIcon";
import { DocumentTypeIcon } from "./DocumentTypeIcon";

type TripDocumentRowProps = {
  document: VaultDocument;
  travelers: Traveler[];
  to?: string;
  onClick?: () => void;
  state?: unknown;
  context?: string;
};

export function TripDocumentRow({
  document,
  travelers,
  to,
  onClick,
  state,
  context
}: TripDocumentRowProps) {
  const className =
    "group grid w-full min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-2 rounded-xl border border-line bg-elevated px-3 py-2.5 text-left transition hover:border-brand/40 hover:shadow-soft";
  // Automatically named files already contain their audience and event context.
  const normalizedTitle = document.title.toLocaleLowerCase();
  const metadata = [
    documentPurposeLabel(document.purpose),
    documentAudienceSummary(document, travelers),
    context
  ].filter(
    (value): value is string =>
      Boolean(value) && !normalizedTitle.includes(value!.toLocaleLowerCase())
  );
  const content = (
    <>
      <DocumentTypeIcon type={document.category} />
      <span className="min-w-0">
        <strong className="block whitespace-normal break-words font-display text-sm leading-5 text-ink [overflow-wrap:anywhere]">
          {document.title}
        </strong>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {metadata.length > 0 && (
            <span className="text-xs text-muted">{metadata.join(" · ")}</span>
          )}
          <DocumentVisibilityIcon visibility={document.visibility} documentTitle={document.title} />
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 self-center text-muted transition-transform group-hover:translate-x-0.5"
      />
    </>
  );

  return (
    <div className="relative min-w-0">
      {to ? (
        <TripChildLink
          id={`document-${document.id}`}
          tripId={document.trip_id}
          to={to}
          state={state}
          className={className}
        >
          {content}
        </TripChildLink>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )}
    </div>
  );
}
