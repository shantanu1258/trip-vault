import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DocumentVisibility } from "../features/workspace/types";
import { documentVisibilityPresentation } from "./DocumentVisibilityBadge";

/** Interactive detail-page controls must sit outside document links. List indicators are passive. */
export function DocumentVisibilityIcon({
  visibility,
  documentTitle,
  interactive = false,
  className = ""
}: {
  visibility: DocumentVisibility;
  documentTitle: string;
  interactive?: boolean;
  className?: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(
    null
  );
  const id = useId();
  const presentation = documentVisibilityPresentation(visibility);
  const Icon = presentation.icon;
  const show = () => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.top > 96;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
      top: above ? rect.top - 8 : rect.bottom + 8,
      above
    });
  };
  useEffect(() => {
    if (!position) return;
    const dismiss = (event: Event) => {
      if (event.type === "pointerdown" && button.current?.contains(event.target as Node)) return;
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      setPosition(null);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [position]);
  if (!interactive) {
    return (
      <span
        role="img"
        aria-label={presentation.description}
        data-document-visibility={visibility}
        className={`inline-flex shrink-0 items-center text-muted ${className}`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`Who can open ${documentTitle}?`}
        aria-describedby={position ? id : undefined}
        aria-expanded={Boolean(position)}
        data-document-visibility={visibility}
        className={`grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${className}`}
        onClick={show}
        onFocus={show}
        onBlur={() => setPosition(null)}
        onPointerEnter={show}
        onPointerLeave={() => {
          if (document.activeElement !== button.current) setPosition(null);
        }}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
      {position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[100] w-60 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-3 text-xs text-ink shadow-soft"
            style={{
              left: position.left,
              top: position.top,
              transform: position.above ? "translateY(-100%)" : undefined
            }}
          >
            <strong className="block">Who can open this?</strong>
            <span className="mt-1 block">{presentation.description}.</span>
          </div>,
          document.body
        )}
    </>
  );
}
