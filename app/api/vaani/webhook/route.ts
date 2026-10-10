// Single endpoint registered in Vaani (Settings → Webhooks):
//   https://<app>/api/vaani/webhook?token=<VAANI_WEBHOOK_TOKEN>
// call_postprocessing carries the transcript, summary, entities and recording. Every event is
// written to webhook_log; call_ended also creates the call row so a call exists even if
// post-processing never arrives.
import { after } from "next/server";
import { sql } from "@/lib/db";
import { verifyVaaniRequest } from "@/lib/vaani";
import { processCall, type PostCall } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();
  const auth = verifyVaaniRequest(raw, req);
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* logged below */
  }
  const event = String(body.event ?? "unknown");
  const data = (body.data ?? body) as Record<string, unknown>;
  const callId = String(data.call_id ?? body.call_id ?? data.room_name ?? body.room_name ?? "");

  await sql`
    insert into webhook_log (source, event, call_id, payload, ok, error)
    values ('vaani', ${event}, ${callId || null}, ${sql.json(body as never)}, ${auth.ok}, ${auth.why ?? null})`;
  if (!auth.ok) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (event === "call_ended" && callId) {
    await sql`
      insert into calls (vaani_call_id, duration_s, end_reason, ended_at)
      values (${callId}, ${Number(body.call_duration ?? 0) || null}, ${String(body.end_reason ?? "") || null}, now())
      on conflict (vaani_call_id) do nothing`;
  }

  if (event === "call_postprocessing" && callId) {
    // Answer Vaani immediately; the verdict and routing run after the response.
    after(() => processCall({ ...(data as PostCall), call_id: callId, timestamp: String(body.timestamp ?? "") || undefined }));
  }
  return Response.json({ status: "ok" });
}
