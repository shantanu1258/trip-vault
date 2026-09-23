import { adminClient, appOrigin, secretMatches, sendPush } from "../_shared/push.ts";
import { notificationPath } from "../_shared/push-policy.ts";
import { pushChangeContent } from "../_shared/push-content.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    if (!(await secretMatches(request.headers.get("x-push-secret"))))
      return new Response("Unauthorized", { status: 401 });
    const origin = appOrigin();
    const db = adminClient();
    const { data: jobs, error } = await db.rpc("claim_push_jobs");
    if (error) throw error;
    let processed = 0;
    // Bounded concurrency and a five-minute lease avoid overlapping Cron sends.
    for (let offset = 0; offset < jobs.length; offset += 4) {
      await Promise.all(
        jobs
          .slice(offset, offset + 4)
          .map(
            async (job: {
              id: string;
              lease_token: string;
              subscription_id: string;
              kind: string;
              trip_id: string;
              entity_id: string;
              occurrence: string;
              expires_at: string;
              change_details?: unknown;
            }) => {
              let result = "retry";
              try {
                const { data: permitted, error: permissionError } = await db.rpc(
                  "push_job_is_allowed",
                  { p_job_id: job.id }
                );
                if (permissionError) throw permissionError;
                if (!permitted) result = "cancelled";
                else {
                  const { data: device, error: deviceError } = await db
                    .from("push_subscriptions")
                    .select("id,endpoint,p256dh,auth")
                    .eq("id", job.subscription_id)
                    .maybeSingle();
                  if (deviceError) throw deviceError;
                  if (!device) result = "cancelled";
                  else {
                    const delivered = await sendPush(
                      device,
                      {
                        kind: job.kind,
                        ...pushChangeContent(job.kind, job.change_details),
                        url:
                          origin + notificationPath(job.kind, job.trip_id, job.entity_id, job.id),
                        tag: job.occurrence
                      },
                      Math.floor((Date.parse(job.expires_at) - Date.now()) / 1000)
                    );
                    if (delivered === "expired") {
                      const { error } = await db
                        .from("push_subscriptions")
                        .delete()
                        .eq("id", device.id);
                      if (error) throw error;
                      result = "cancelled";
                    } else result = delivered;
                  }
                }
              } catch {
                result = "retry";
              }
              const { error } = await db.rpc("finish_push_job", {
                p_id: job.id,
                p_lease: job.lease_token,
                p_result: result
              });
              if (error) throw error;
              processed++;
            }
          )
      );
    }
    return Response.json({ processed });
  } catch {
    // Do not log subscription endpoints, encryption keys, or bearer tokens.
    console.error("Push dispatch failed; check configuration/database health.");
    return new Response("Push dispatch failed", { status: 500 });
  }
});
