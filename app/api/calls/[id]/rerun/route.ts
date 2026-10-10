// Re-runs the verdict for a call (e.g. after a provider was down, or the rubric changed).
// Uses the original webhook payload so the result is reproducible.
import { sql } from "@/lib/db";
import { processCall, type PostCall } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [c] = await sql<{ vaani_call_id: string }[]>`select vaani_call_id from calls where id = ${Number(id)}`;
  if (!c) return Response.json({ error: "not found" }, { status: 404 });
  const [log] = await sql<{ payload: { data?: PostCall; timestamp?: string } }[]>`
    select payload from webhook_log where call_id = ${c.vaani_call_id} and event = 'call_postprocessing' and ok
    order by received_at desc limit 1`;
  if (!log?.payload?.data) return Response.json({ error: "no post-call payload stored for this call yet" }, { status: 409 });
  await sql`update calls set processing = 'received' where id = ${Number(id)}`;
  const r = await processCall({ ...log.payload.data, call_id: c.vaani_call_id, timestamp: log.payload.timestamp });
  // The dashboard button is a plain form; send it back to the call page.
  if (req.headers.get("content-type")?.includes("form")) return Response.redirect(new URL(`/calls/${id}`, req.url), 303);
  return Response.json(r);
}
