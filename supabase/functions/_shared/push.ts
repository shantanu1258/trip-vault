import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import webpush from "npm:web-push@3.6.7";
import { allowedPushEndpoint, deliveryResult } from "./push-policy.ts";
import { PushDeliveryError, preparationErrorCode } from "./push-errors.ts";

export function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export function adminClient() {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
export function appOrigin() {
  const url = new URL(required("APP_URL"));
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("APP_URL must be HTTPS");
  return url.origin;
}
export async function secretMatches(actual: string | null) {
  if (!actual || actual.length > 512) return false;
  const expected = required("PUSH_DISPATCH_SECRET");
  if (expected.length < 32) throw new Error("Scheduler secret is too short");
  const hash = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(actual), hash(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
export type Device = { id: string; endpoint: string; p256dh: string; auth: string };
export async function sendPush(
  device: Device,
  payload: { kind: string; url: string; tag: string; title?: string; body?: string },
  ttl: number
) {
  if (!allowedPushEndpoint(device.endpoint)) return "failed" as const;
  let details;
  try {
    details = webpush.generateRequestDetails(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      JSON.stringify(payload),
      {
        TTL: Math.max(1, Math.min(ttl, 86400)),
        urgency: "normal",
        vapidDetails: {
          subject: required("VAPID_SUBJECT"),
          publicKey: required("VAPID_PUBLIC_KEY"),
          privateKey: required("VAPID_PRIVATE_KEY")
        }
      }
    );
  } catch (error) {
    throw new PushDeliveryError(preparationErrorCode(error));
  }
  let response: Response;
  try {
    response = await fetch(details.endpoint, {
      method: "POST",
      headers: details.headers,
      body: details.body,
      redirect: "error",
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new PushDeliveryError("push_network_failed");
  }
  // Failure to discard an unused response body must not turn accepted delivery into 500.
  await response.body?.cancel().catch(() => undefined);
  return deliveryResult(response.status);
}
