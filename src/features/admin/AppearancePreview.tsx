import {
  DocumentCardContent,
  documentCardLinkClassName
} from "../../components/DocumentCardContent";
import { BookingHeroSurface } from "../../components/BookingHeroSurface";
import { DocumentTypeIcon } from "../../components/DocumentTypeIcon";
import { themePreviewStyle } from "../../lib/theme/publishedPalette";
import type { ThemeTokens } from "./api";

export function AppearancePreview({
  tokens,
  mode
}: {
  tokens: ThemeTokens;
  mode: "light" | "dark";
}) {
  return (
    <div
      data-theme={mode}
      style={themePreviewStyle(tokens)}
      className="mt-4 space-y-3 rounded-xl border border-line bg-canvas p-3 text-ink"
      aria-label={`${mode} app preview`}
    >
      <BookingHeroSurface type="activity">
        <p className="text-xs font-bold uppercase">Sample activity · Booked</p>
        <h3 className="mt-1 text-lg font-black">Museum visit</h3>
        <span className="hero-action mt-2 inline-flex gap-2 text-xs">
          <DocumentTypeIcon type="activity" size="sm" variant="monochrome" /> View confirmation
        </span>
      </BookingHeroSurface>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className={documentCardLinkClassName}>
          <DocumentCardContent
            document={{
              title: "Museum admission ticket",
              category: "activity",
              purpose: "activity_ticket",
              visibility: "trip"
            }}
          />
        </div>
      </div>
    </div>
  );
}
