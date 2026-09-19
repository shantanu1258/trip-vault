import { adminClient, appOrigin, sendPush } from "../_shared/push.ts";

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
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
    const {
      data: { user },
      error
    } = await db.auth.getUser(token);
    if (error || !user) return new Response("Unauthorized", { status: 401, headers });
    const body = await request.text();
    if (body.length > 1024) return new Response("Too large", { status: 413, headers });
    const { subscriptionId } = JSON.parse(body);
    if (typeof subscriptionId !== "string" || !/^[0-9a-f-]{36}$/i.test(subscriptionId))
      return new Response("Invalid device", { status: 400, headers });
    const { data: devices, error: limitError } = await db.rpc("prepare_test_push", {
      p_user: user.id,
      p_subscription: subscriptionId
    });
    if (limitError) throw limitError;
    if (!devices.length)
      return new Response("Device unavailable or test rate limit reached. Wait one minute.", {
        status: 429,
        headers
      });
    const result = await sendPush(
      devices[0],
      { kind: "test", url: origin + "/profile", tag: "trip-vault-test" },
      120
    );
    if (result === "expired")
      await db.from("push_subscriptions").delete().eq("id", subscriptionId).eq("user_id", user.id);
    return Response.json(
      { accepted: result === "sent" },
      { status: result === "sent" ? 200 : 502, headers }
    );
  } catch {
    return new Response("Could not send test notification", { status: 500, headers });
  }
});
