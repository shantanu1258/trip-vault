import { describe, expect, it } from "vitest";
import { googleMapsDirectionsUrl, googleMapsSearchUrl, normalizeJoinCode, sanitizeFilename, validateDocumentFile } from "./api";

describe("workspace boundaries", () => {
  it("normalizes displayed join-code separators", () => expect(normalizeJoinCode(" abcd-efgh/jkmn.pqrs ")).toBe("ABCDEFGHJKMNPQRS"));
  it("prefers coordinates and encodes Google Maps URLs without a key", () => { expect(googleMapsSearchUrl({ address: "ignored", latitude: 12.3, longitude: 45.6 })).toBe("https://www.google.com/maps/search/?api=1&query=12.3%2C45.6"); expect(googleMapsDirectionsUrl("Via Roma 1, Rome")).toContain("Via%20Roma%201%2C%20Rome"); });
  it("sanitizes provider filenames without traversal-like prefixes or losing the extension", () => expect(sanitizeFilename("../Sam's Boarding Pass (final).pdf")).toBe("Sam-s-Boarding-Pass-final.pdf"));
  it("accepts 4,999,999 bytes and rejects exactly 5,000,000", () => { expect(() => validateDocumentFile(new File([new Uint8Array(4_999_999)], "ok.pdf", { type: "application/pdf" }))).not.toThrow(); expect(() => validateDocumentFile(new File([new Uint8Array(5_000_000)], "too-large.pdf", { type: "application/pdf" }))).toThrow(/smaller than 5 MB/i); });
  it("rejects executable content regardless of its filename", () => expect(() => validateDocumentFile(new File(["x"], "ticket.pdf", { type: "text/html" }))).toThrow(/PDF, JPEG, PNG, or WebP/i));
});
