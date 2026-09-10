import type { EventDocumentLink, VaultDocument } from "./types";

export function validateEventDocumentSelection(eventTripId: string, documents: VaultDocument[], existing: EventDocumentLink[] = []) {
  const existingIds = new Set(existing.map((link) => link.document_id));
  const valid: VaultDocument[] = []; const rejected: { document: VaultDocument; reason: "different_trip" | "duplicate" }[] = [];
  for (const document of documents) {
    if (document.trip_id !== eventTripId) rejected.push({ document, reason: "different_trip" });
    else if (existingIds.has(document.id)) rejected.push({ document, reason: "duplicate" });
    else valid.push(document);
  }
  return { valid, rejected };
}

export function reorderIds(ids: string[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return [...ids];
  const copy = [...ids]; const [moved] = copy.splice(from, 1); copy.splice(to, 0, moved); return copy;
}
