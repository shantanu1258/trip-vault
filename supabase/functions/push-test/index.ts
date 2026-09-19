import { adminClient, appOrigin, sendPush } from "../_shared/push.ts";
import {
  PushDeliveryError,
  pushErrorMessages,
  type PushErrorCode
} from "../_shared/push-errors.ts";

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  let stage = "configuration";
  const failure = (code: PushErrorCode, status: number, extraHeaders = {}) =>
    Response.json(
      { accepted: false, code, error: pushErrorMessages[code] },
      {
        status,
        headers: { ...headers, ...extraHeaders }
      }
    );
  try {
    const origin = appOrigin();
    if (request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
    headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405, headers });
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return new Response("Unauthorized", { status: 401, headers });
    const db = adminClient();
    stage = "authentication";
    const {
      data: { user },
      error
    } = await db.auth.getUser(token);
    if (error || !user) return new Response("Unauthorized", { status: 401, headers });
    const body = await request.text();
    if (body.length > 1024) return new Response("Too large", { status: 413, headers });
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400, headers });
    }
    const subscriptionId =
      input && typeof input === "object" && "subscriptionId" in input
        ? input.subscriptionId
        : undefined;
    if (typeof subscriptionId !== "string" || !/^[0-9a-f-]{36}$/i.test(subscriptionId))
      return new Response("Invalid device", { status: 400, headers });
    stage = "database";
    const { data: devices, error: limitError } = await db.rpc("prepare_test_push", {
      p_user: user.id,
      p_subscription: subscriptionId
    });
    if (limitError) throw limitError;
    if (!devices?.length) {
      // Missing/other-account devices must not masquerade as a temporary cooldown.
      const { data: device, error: lookupError } = await db
        .from("push_subscriptions")
        .select("id")
        .eq("id", subscriptionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      return device
        ? failure("test_cooldown", 429, { "Retry-After": "60" })
        : failure("device_missing", 404);
    }
    stage = "delivery";
    const result = await sendPush(
      devices[0],
      { kind: "test", url: origin + "/profile", tag: "trip-vault-test" },
      120
    );
    if (result === "expired") {
      const { error } = await db
        .from("push_subscriptions")
        .delete()
        .eq("id", subscriptionId)
        .eq("user_id", user.id);
      if (error) console.error("push-test", { stage: "cleanup", code: "database_failed" });
      return failure("device_expired", 410);
    }
    if (result !== "sent")
      return failure(
        result === "retry" ? "push_provider_unavailable" : "push_provider_rejected",
        502
      );
    return Response.json({ accepted: true }, { headers });
  } catch (error) {
    const code =
      error instanceof PushDeliveryError
        ? error.code
        : stage === "configuration"
          ? "server_config_failed"
          : stage === "database"
            ? "database_failed"
            : "test_failed";
    console.error("push-test", { stage, code });
    return failure(code, 500);
  }
});
