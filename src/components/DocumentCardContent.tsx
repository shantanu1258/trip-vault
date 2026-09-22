import { ChevronRight } from "lucide-react";
import type { VaultDocument } from "../features/workspace/types";
import { documentPurposeLabel } from "../features/workspace/documentModel";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { DocumentVisibilityIcon } from "./DocumentVisibilityIcon";

export const documentCardLinkClassName =
  "tap-target group grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_1rem] items-start gap-x-2 px-3 py-2 text-left text-xs font-bold transition hover:bg-brand-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";

/** Shared, presentational document card for real event details and the offline demo. */
export function DocumentCardContent({
  document,
  title = document.title,
  actions = "none"
}: {
  document: Pick<VaultDocument, "title" | "category" | "purpose" | "visibility" | "sync_state">;
  title?: string;
  actions?: "none" | "unlink" | "reorder";
}) {
  return (
    <>
      <DocumentTypeIcon type={document.category} size="sm" emphasis="strong" />
      <span className="min-w-0 break-words leading-5 [overflow-wrap:anywhere]">{title}</span>
      <ChevronRight
        className="mt-0.5 size-4 text-muted transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
      <span
        data-document-metadata
        className={`col-span-3 mt-1 grid min-h-8 min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 ${actions === "reorder" ? "pr-24" : actions === "unlink" ? "pr-8" : ""}`}
      >
        <DocumentVisibilityIcon visibility={document.visibility} documentTitle={title} />
        <span className="min-w-0 break-words text-[.65rem] font-medium text-muted">
          {documentPurposeLabel(document.purpose)}
        </span>
        {document.sync_state === "queued" && (
          <span className="col-start-2 text-[.65rem] font-medium text-muted">
            Saved on device, cloud pending
          </span>
        )}
      </span>
    </>
  );
}
