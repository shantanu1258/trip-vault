import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  markDeviceSignedOut,
  offlineDeviceProfileId,
  rememberedDeviceProfileId,
  rememberDeviceProfile,
  resolveDeviceProfileId
} from "./deviceSession";

const profileId = "11111111-1111-4111-8111-111111111111";
const originalOnline = navigator.onLine;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

describe("offline device enrollment", () => {
  beforeEach(() => {
    localStorage.clear();
    setOnline(originalOnline);
  });

  afterEach(() => {
    localStorage.clear();
    setOnline(originalOnline);
  });

  it("remembers only a valid profile identifier", () => {
    rememberDeviceProfile("not-a-profile-id");
    expect(rememberedDeviceProfileId()).toBeNull();
    rememberDeviceProfile(profileId);
    expect(rememberedDeviceProfileId()).toBe(profileId);
  });

  it("uses the enrolled profile only when the browser is offline", async () => {
    rememberDeviceProfile(profileId);
    setOnline(false);
    expect(offlineDeviceProfileId()).toBe(profileId);
    expect(await resolveDeviceProfileId()).toBe(profileId);
    setOnline(true);
    expect(offlineDeviceProfileId()).toBeNull();
  });

  it("blocks local access after an explicit sign-out and restores it after sign-in", () => {
    rememberDeviceProfile(profileId);
    markDeviceSignedOut();
    expect(rememberedDeviceProfileId()).toBeNull();
    rememberDeviceProfile(profileId);
    expect(rememberedDeviceProfileId()).toBe(profileId);
  });

  it("can remove the enrollment together with local copies", () => {
    rememberDeviceProfile(profileId);
    markDeviceSignedOut(true);
    expect(rememberedDeviceProfileId()).toBeNull();
    setOnline(false);
    expect(offlineDeviceProfileId()).toBeNull();
  });
});
