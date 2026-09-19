import { ChevronRight, FileCheck2, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { documentAudienceSummary } from "../features/home/needNow";
import { documentPurposeLabel } from "../features/workspace/documentModel";
import type { Traveler, VaultDocument } from "../features/workspace/types";
import { DocumentVisibilityBadge } from "./DocumentVisibilityBadge";

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
    "group grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 rounded-xl border border-line bg-elevated p-3 text-left transition hover:border-brand/40 hover:shadow-soft";
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
      <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand">
        {document.current_version ? (
          <FileCheck2 className="size-4" />
        ) : (
          <FileText className="size-4" />
        )}
      </span>
      <span className="min-w-0">
        <strong className="block whitespace-normal break-words font-display text-sm leading-5 text-ink [overflow-wrap:anywhere]">
          {document.title}
        </strong>
        {metadata.length > 0 && (
          <span className="mt-1 block text-xs text-muted">{metadata.join(" · ")}</span>
        )}
        <span className="mt-1 inline-flex">
          <DocumentVisibilityBadge visibility={document.visibility} />
        </span>
      </span>
      <ChevronRight className="mt-3 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </>
  );

  if (to) {
    return (
      <Link to={to} state={state} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
