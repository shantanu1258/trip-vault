import { supabase } from "../supabase/client";

const PROFILE_KEY = "trip-vault:device-profile:v1";
const SIGNED_OUT_KEY = "trip-vault:device-signed-out:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function rememberDeviceProfile(profileId: string) {
  if (!UUID_PATTERN.test(profileId)) return;
  const local = storage();
  try {
    local?.setItem(PROFILE_KEY, profileId);
    local?.removeItem(SIGNED_OUT_KEY);
  } catch {
    // The app remains online-only if this browser blocks local storage.
  }
}

export function markDeviceSignedOut(removeEnrollment = false) {
  const local = storage();
  try {
    local?.setItem(SIGNED_OUT_KEY, "true");
    if (removeEnrollment) local?.removeItem(PROFILE_KEY);
  } catch {
    // Supabase local sign-out remains the fallback.
  }
}

export function rememberedDeviceProfileId() {
  const local = storage();
  try {
    if (!local || local.getItem(SIGNED_OUT_KEY) === "true") return null;
    const profileId = local.getItem(PROFILE_KEY);
    return profileId && UUID_PATTERN.test(profileId) ? profileId : null;
  } catch {
    return null;
  }
}

export function offlineDeviceProfileId() {
  if (typeof navigator === "undefined" || navigator.onLine) return null;
  return rememberedDeviceProfileId();
}

export async function resolveDeviceProfileId() {
  let explicitlySignedOut = false;
  try {
    explicitlySignedOut = storage()?.getItem(SIGNED_OUT_KEY) === "true";
  } catch {
    // Continue with the Supabase session when local storage is unavailable.
  }
  if (explicitlySignedOut) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return rememberedDeviceProfileId();
  try {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    const profileId = data.session?.user.id;
    if (profileId) {
      rememberDeviceProfile(profileId);
      return profileId;
    }
  } catch {
    // An expired token may be impossible to refresh in airplane mode.
  }
  return null;
}
