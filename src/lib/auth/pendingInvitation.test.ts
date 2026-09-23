import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invitationCode, pendingInvitationCode, rememberInvitation } from "./pendingInvitation";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("keeps only a valid latest invite, expires it without extending its life on refresh", () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  rememberInvitation("abcd-efgh-jkmn-pqrs");
  expect(pendingInvitationCode()).toBe("ABCDEFGHJKMNPQRS");
  rememberInvitation("not-a-code");
  expect(pendingInvitationCode()).toBe("ABCDEFGHJKMNPQRS");
  clock.mockReturnValue(now + 13 * 86_400_000);
  rememberInvitation("abcd-efgh-jkmn-pqrs");
  clock.mockReturnValue(now + 14 * 86_400_000);
  expect(pendingInvitationCode()).toBeNull();
  expect(localStorage.length).toBe(0);
  rememberInvitation("QRST-UVWX-2345-6789");
  expect(pendingInvitationCode()).toBe("QRSTUVWX23456789");
  expect(invitationCode("ab@cd-efgh-jkmn-pqrs")).toBeNull();
});

it("does not block authentication when browser storage is denied or malformed", () => {
  localStorage.setItem("trip-vault:pending-invitation:v1", "not JSON");
  expect(pendingInvitationCode()).toBeNull();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  expect(() => rememberInvitation("ABCD-EFGH-JKMN-PQRS")).not.toThrow();
  expect(pendingInvitationCode()).toBeNull();
});
