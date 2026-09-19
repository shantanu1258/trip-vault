import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as errors from "../../../supabase/functions/_shared/push-errors";

// Exercise the real Edge handler without installing Deno or contacting a push service.
function setup(devices: object[] = []) {
  const lookup = vi.fn().mockResolvedValue({ data: { id: "device" }, error: null });
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: lookup };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const db = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: devices }),
    from: vi.fn().mockReturnValue(query)
  };
  const sendPush = vi.fn().mockResolvedValue("sent");
  const log = vi.fn();
  let handler!: (request: Request) => Promise<Response>;
  const source = ts.transpileModule(readFileSync("supabase/functions/push-test/index.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(source, {
    exports: {},
    Response,
    console: { error: log },
    Deno: {
      serve: (fn: typeof handler) => {
        handler = fn;
      }
    },
    require: (name: string) => {
      if (name === "../_shared/push-errors.ts") return errors;
      if (name === "../_shared/push.ts")
        return { adminClient: () => db, appOrigin: () => "https://trip.test", sendPush };
      throw new Error("Unexpected import");
    }
  });
  const request = () =>
    handler(
      new Request("https://server.test/push-test", {
        method: "POST",
        headers: { origin: "https://trip.test", authorization: "Bearer test-only" },
        body: JSON.stringify({ subscriptionId: "00000000-0000-4000-8000-000000000001" })
      })
    );
  return { lookup, query, db, sendPush, log, request };
}

it("distinguishes cooldown from a missing device, checking ownership without sending", async () => {
  const s = setup();
  const limited = await s.request();
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("60");
  expect((await limited.json()).code).toBe("test_cooldown");
  s.lookup.mockResolvedValue({ data: null, error: null });
  const missing = await s.request();
  expect(missing.status).toBe(404);
  expect((await missing.json()).code).toBe("device_missing");
  expect(s.query.eq).toHaveBeenCalledWith("user_id", "user");
  expect(s.sendPush).not.toHaveBeenCalled();
});

it("returns safe delivery diagnostics and preserves successful sends", async () => {
  const s = setup([{ id: "device" }]);
  s.sendPush.mockRejectedValueOnce(new errors.PushDeliveryError("invalid_vapid_subject"));
  const failed = await s.request();
  expect(failed.status).toBe(500);
  expect((await failed.json()).code).toBe("invalid_vapid_subject");
  expect(s.log).toHaveBeenCalledWith("push-test", {
    stage: "delivery",
    code: "invalid_vapid_subject"
  });
  s.db.rpc.mockResolvedValueOnce({ error: new Error("sensitive database internals") });
  const database = await s.request();
  expect((await database.json()).code).toBe("database_failed");
  expect(JSON.stringify(s.log.mock.calls)).not.toContain("sensitive");
  expect((await s.request()).status).toBe(200);
});

it("maps preparation failures to fixed codes without exposing error contents", () => {
  for (const [message, code] of [
    ["Missing VAPID_PRIVATE_KEY", "missing_vapid_private_key"],
    ["Vapid subject is not a valid URL", "invalid_vapid_subject"],
    ["Vapid public key invalid: sensitive", "invalid_vapid_public_key"],
    ["Vapid private key invalid: sensitive", "invalid_vapid_private_key"],
    ["p256dh invalid: sensitive", "invalid_subscription"],
    ["unexpected crypto failure: sensitive", "push_request_failed"]
  ]) {
    const actual = errors.preparationErrorCode(new Error(message));
    expect(actual).toBe(code);
    expect(errors.pushErrorMessage(actual)).not.toContain("sensitive");
  }
  expect(errors.pushErrorMessage("__proto__")).toBeUndefined();
});
