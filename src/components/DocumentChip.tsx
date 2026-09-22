import { CheckCircle2, ExternalLink } from "lucide-react";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import type { DemoDocument } from "../demo/types";

export function DocumentChip({
  document,
  compact = false
}: {
  document: DemoDocument;
  compact?: boolean;
}) {
  return (
    <a
      href={document.url}
      target="_blank"
      rel="noreferrer"
      className={`tap-target group flex items-center gap-3 rounded-2xl border border-line bg-elevated text-left transition-[transform,border-color] duration-150 ease-settle hover:-translate-y-0.5 hover:border-brand/40 motion-reduce:transform-none ${compact ? "px-3 py-2" : "p-3.5"}`}
    >
      <DocumentTypeIcon type={document.category} emphasis="strong" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold text-ink">{document.title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
          <CheckCircle2 className="size-3 text-success" aria-hidden="true" />
          Offline · {document.sizeLabel}
        </span>
      </span>
      <ExternalLink
        className="size-4 shrink-0 text-muted transition-colors group-hover:text-brand"
        aria-hidden="true"
      />
    </a>
  );
}
