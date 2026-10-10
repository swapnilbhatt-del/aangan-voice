// Streams a call's recording to the dashboard's <audio>. Vaani's recording_url is signed, so it
// works directly; the API-key stream endpoint is the fallback.
import { sql } from "@/lib/db";
import { streamRecording } from "@/lib/vaani";

export async function GET(_req: Request, ctx: { params: Promise<{ callId: string }> }) {
  const { callId } = await ctx.params;
  const [c] = await sql<{ vaani_call_id: string; recording_url: string | null }[]>`
    select vaani_call_id, recording_url from calls where id = ${Number(callId)}`;
  if (!c) return new Response("Not found", { status: 404 });
  let upstream = c.recording_url ? await fetch(c.recording_url, { cache: "no-store" }) : null;
  if (!upstream?.ok) upstream = await streamRecording(c.vaani_call_id);
  if (!upstream.ok || !upstream.body) return new Response("Recording not available yet", { status: 404 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/ogg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
