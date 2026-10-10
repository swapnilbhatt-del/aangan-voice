// Vaani REST calls (docs: docs.vaanivoice.ai). Auth is the X-API-Key header.
import { createHmac, timingSafeEqual } from "crypto";

const BASE = process.env.VAANI_API_BASE || "https://api.vaanivoice.ai";
const headers = () => ({ "X-API-Key": process.env.VAANI_API_KEY ?? "" });

export type CallHistoryRow = {
  call_id: string;
  call_type?: string;
  direction?: string;
  from_number?: string | null;
  to_number?: string | null;
  Start_time?: string | null;
  End_time?: string | null;
  user_picked_up_at?: string | null;
  call_cost?: number | null;
  call_status?: string | null;
};

// The webhook has no cost or caller number; call history does. Recent calls are on page 1.
export async function findCallInHistory(callId: string): Promise<CallHistoryRow | null> {
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${BASE}/api/call-history?page=${page}&page_size=100`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`Vaani call-history ${res.status}`);
    const body = (await res.json()) as { data?: CallHistoryRow[] };
    const hit = body.data?.find((r) => r.call_id === callId);
    if (hit) return hit;
    if (!body.data?.length) break;
  }
  return null;
}

export async function streamRecording(callId: string): Promise<Response> {
  return fetch(`${BASE}/api/stream/${encodeURIComponent(callId)}`, { headers: headers(), cache: "no-store" });
}

// Vaani documents an HMAC signature (X-Vaani-Signature: sha256=..., X-Vaani-Timestamp).
// If a secret is configured and a signature arrives, it must match. The URL token is the
// second lock and is always required.
export function verifyVaaniRequest(rawBody: string, req: Request): { ok: boolean; why?: string } {
  const url = new URL(req.url);
  const token = process.env.VAANI_WEBHOOK_TOKEN;
  if (!token || url.searchParams.get("token") !== token) return { ok: false, why: "bad token" };
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  const sig = req.headers.get("x-vaani-signature");
  if (secret && sig) {
    const ts = req.headers.get("x-vaani-timestamp") ?? "";
    const candidates = [rawBody, `${ts}.${rawBody}`].map((m) => "sha256=" + createHmac("sha256", secret).update(m).digest("hex"));
    const match = candidates.some((c) => c.length === sig.length && timingSafeEqual(Buffer.from(c), Buffer.from(sig)));
    if (!match) return { ok: false, why: "bad signature" };
  }
  return { ok: true };
}
