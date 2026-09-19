// Only these fixed messages may cross the server boundary. Never return/log a raw
// SDK, provider or crypto error: it may contain keys, tokens or endpoint URLs.
export const pushErrorMessages = {
  device_missing:
    "This device is no longer registered for this account. Disable notifications on this device, then enable them again.",
  test_cooldown:
    "A test was attempted recently. Wait one minute before trying again, even if the previous attempt failed.",
  missing_vapid_subject:
    "VAPID_SUBJECT is missing in Supabase function secrets. Set it to mailto: followed by your contact email.",
  missing_vapid_public_key: "VAPID_PUBLIC_KEY is missing in Supabase function secrets.",
  missing_vapid_private_key: "VAPID_PRIVATE_KEY is missing in Supabase function secrets.",
  invalid_vapid_subject:
    "VAPID_SUBJECT must be a valid mailto: contact email or HTTPS contact URL.",
  invalid_vapid_public_key:
    "VAPID_PUBLIC_KEY has an invalid format. Use the generated URL-safe public key without quotes.",
  invalid_vapid_private_key:
    "VAPID_PRIVATE_KEY has an invalid format. Use the matching generated private key without quotes.",
  invalid_subscription:
    "The browser subscription keys are invalid. Disable notifications on this device, then enable them again.",
  push_request_failed:
    "The server could not encrypt or sign the push request. Check the push-test function logs for the safe diagnostic code.",
  push_network_failed:
    "The server could not reach the browser push service. Wait one minute, then try again.",
  push_provider_rejected:
    "The browser push service rejected the notification. Check the matching VAPID key pair and VAPID_SUBJECT in Supabase.",
  push_provider_unavailable:
    "The browser push service is temporarily unavailable. Wait one minute, then try again.",
  device_expired:
    "This browser subscription has expired. Disable notifications on this device, then enable them again.",
  database_failed:
    "Notification storage could not be accessed. Check the push migration and push-test function logs.",
  server_config_failed:
    "The notification server configuration is incomplete. Check the push-test function secrets.",
  test_failed:
    "The notification test failed on the server. Check the safe diagnostic code in the push-test function logs."
} as const;

export type PushErrorCode = keyof typeof pushErrorMessages;

export class PushDeliveryError extends Error {
  constructor(public readonly code: PushErrorCode) {
    super(pushErrorMessages[code]);
  }
}

export function preparationErrorCode(error: unknown): PushErrorCode {
  const message = error instanceof Error ? error.message : "";
  if (message === "Missing VAPID_SUBJECT") return "missing_vapid_subject";
  if (message === "Missing VAPID_PUBLIC_KEY") return "missing_vapid_public_key";
  if (message === "Missing VAPID_PRIVATE_KEY") return "missing_vapid_private_key";
  if (/subject/i.test(message)) return "invalid_vapid_subject";
  if (/public key/i.test(message)) return "invalid_vapid_public_key";
  if (/private key/i.test(message)) return "invalid_vapid_private_key";
  if (/p256dh|auth secret|subscription.*keys/i.test(message)) return "invalid_subscription";
  return "push_request_failed";
}

export function pushErrorMessage(code: unknown) {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(pushErrorMessages, code)
    ? pushErrorMessages[code as PushErrorCode]
    : undefined;
}
