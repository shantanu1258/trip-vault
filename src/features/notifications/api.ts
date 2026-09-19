import { supabase } from "../../lib/supabase/client";
import { applicationServerKey, publicPushKey, pushEnabled } from "./config";

export type PushDevice = {
  id: string;
  event_changes: boolean;
  cost_changes: boolean;
  reminders: boolean;
};

export function supportsPush() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration() {
  // Do not wait indefinitely for a worker in the development server.
  const worker = await navigator.serviceWorker.getRegistration();
  if (!worker?.active) throw new Error("Reload the installed or deployed app, then try again.");
  return worker;
}

export async function getPushDevice(): Promise<PushDevice | null> {
  if (!supportsPush() || !supabase || !pushEnabled) return null;
  const subscription = await (await registration()).pushManager.getSubscription();
  if (!subscription) return null;
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,event_changes,cost_changes,reminders")
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();
  if (error)
    throw new Error("Notification setup is not available yet. Please try again after deployment.");
  return data;
}

export async function enablePush(): Promise<PushDevice> {
  if (!pushEnabled || !supabase || !supportsPush())
    throw new Error("Notifications are not available on this device yet.");
  // Must occur directly after the user's click, before any network/worker await (iOS).
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notifications were not allowed. You can change this in browser settings.");
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sign in online to enable notifications.");
  const worker = await registration();
  const previous = await worker.pushManager.getSubscription();
  // Never transfer another account's existing endpoint to the current account.
  if (previous) {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", previous.endpoint);
    if (error) throw error;
    if (!(await previous.unsubscribe()))
      throw new Error("Could not replace the previous device subscription.");
  }
  const subscription = await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicPushKey)
  });
  const json = subscription.toJSON();
  const { data, error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth
  });
  if (error) {
    await subscription.unsubscribe();
    throw new Error("Could not save this device. Check the notification migration and try again.");
  }
  return { id: data, event_changes: true, cost_changes: true, reminders: true };
}

export async function disablePush() {
  if (!supportsPush()) return;
  const worker = await navigator.serviceWorker.getRegistration();
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription) return;
  // Browser unsubscribe also invalidates delivery if the database is unreachable.
  const endpoint = subscription.endpoint;
  const unsubscribed = await subscription.unsubscribe();
  const result = await supabase?.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (!unsubscribed && result?.error)
    throw new Error("Could not disable notifications. Check your connection and retry.");
}

export async function updatePushDevice(device: PushDevice) {
  if (!supabase) throw new Error("Sign in first.");
  const { id, ...preferences } = device;
  const { error } = await supabase.from("push_subscriptions").update(preferences).eq("id", id);
  if (error) throw error;
}
