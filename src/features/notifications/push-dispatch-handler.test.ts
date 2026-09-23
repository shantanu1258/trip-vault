import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as policy from "../../../supabase/functions/_shared/push-policy";
import * as content from "../../../supabase/functions/_shared/push-content";

function setup(changeDetails?: unknown, allowed = true) {
  const job = {
    id: "job",
    lease_token: "lease",
    subscription_id: "device",
    kind: "cost",
    trip_id: "trip",
    entity_id: "expense",
    occurrence: "cost:1",
    expires_at: new Date(Date.now() + 60000).toISOString(),
    change_details: changeDetails
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "device" } })
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const db = {
    rpc: vi.fn(async (name: string) => ({
      data: name === "claim_push_jobs" ? [job] : name === "push_job_is_allowed" ? allowed : null
    })),
    from: vi.fn(() => query)
  };
  const sendPush = vi.fn().mockResolvedValue("sent");
  let handler!: (request: Request) => Promise<Response>;
  runInNewContext(
    ts.transpileModule(readFileSync("supabase/functions/push-dispatch/index.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    {
      exports: {},
      Response,
      console: { error: vi.fn() },
      Deno: {
        serve: (fn: typeof handler) => {
          handler = fn;
        }
      },
      require: (name: string) => {
        if (name === "../_shared/push-policy.ts") return policy;
        if (name === "../_shared/push-content.ts") return content;
        if (name === "../_shared/push.ts")
          return {
            adminClient: () => db,
            appOrigin: () => "https://trip.test",
            secretMatches: async (secret: string) => secret === "test-secret",
            sendPush
          };
        throw new Error("Unexpected import");
      }
    }
  );
  return {
    db,
    sendPush,
    request: (secret = "test-secret") =>
      handler(
        new Request("https://server.test/push-dispatch", {
          method: "POST",
          headers: { "x-push-secret": secret }
        })
      )
  };
}

it("sends captured change text with the exact record link and finishes the lease", async () => {
  const s = setup({
    action: "created",
    item_title: "Taxi",
    trip_title: "Bali",
    after: { amount_minor: 50000, currency_code: "INR" }
  });
  expect((await s.request()).status).toBe(200);
  expect(s.sendPush).toHaveBeenCalledWith(
    { id: "device" },
    expect.objectContaining({
      title: "Expense created: Taxi",
      body: "Bali · INR 500.00",
      url: "https://trip.test/trips/trip?view=details&cost=expense&notification=job",
      tag: "cost:1"
    }),
    expect.any(Number)
  );
  expect(s.db.rpc).toHaveBeenCalledWith("finish_push_job", {
    p_id: "job",
    p_lease: "lease",
    p_result: "sent"
  });
});
it("does not invent action details for jobs queued before the migration", async () => {
  const s = setup();
  await s.request();
  expect(s.sendPush.mock.calls[0][1]).not.toHaveProperty("title");
});
it("never sends change details without scheduler and current recipient authorization", async () => {
  const s = setup({ action: "updated", item_title: "Taxi" }, false);
  expect((await s.request("wrong")).status).toBe(401);
  expect(s.db.rpc).not.toHaveBeenCalled();
  await s.request();
  expect(s.sendPush).not.toHaveBeenCalled();
  expect(s.db.rpc).toHaveBeenCalledWith("finish_push_job", {
    p_id: "job",
    p_lease: "lease",
    p_result: "cancelled"
  });
});
