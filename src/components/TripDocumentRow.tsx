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
    "group grid w-full min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-line bg-elevated p-3.5 text-left transition hover:border-brand/40 hover:shadow-soft";
  const content = (
    <>
      <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
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
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{documentPurposeLabel(document.purpose)}</span>
          <span aria-hidden="true">·</span>
          <span>{documentAudienceSummary(document, travelers)}</span>
          {context && (
            <>
              <span aria-hidden="true">·</span>
              <span>{context}</span>
            </>
          )}
        </span>
        <span className="mt-2 inline-flex">
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
