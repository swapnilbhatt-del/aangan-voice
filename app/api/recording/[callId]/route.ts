// Vaani recordings need the API key, so the dashboard's <audio> plays them through here.
import { sql } from "@/lib/db";
import { streamRecording } from "@/lib/vaani";

export async function GET(_req: Request, ctx: { params: Promise<{ callId: string }> }) {
  const { callId } = await ctx.params;
  const [c] = await sql<{ vaani_call_id: string }[]>`select vaani_call_id from calls where id = ${Number(callId)}`;
  if (!c) return new Response("Not found", { status: 404 });
  const upstream = await streamRecording(c.vaani_call_id);
  if (!upstream.ok || !upstream.body) return new Response("Recording not available yet", { status: 404 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/ogg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
