// Two jobs, run by Vercel Cron daily and by an external pinger every 5 minutes (see README):
//  1. SLA: qualified leads unclaimed past the SLA → founder alert (once per lead).
//  2. Health: can we still reach the database (Supabase), Telegram, HubSpot and Vaani? Alert on any failure.
import { sql, getSetting, logEvent } from "@/lib/db";
import { alertFounder, esc, tg } from "@/lib/telegram";
import * as hubspot from "@/lib/hubspot";

export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization");
  if (bearer !== `Bearer ${process.env.CRON_SECRET}` && url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: Record<string, string> = {};
  const check = async (service: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      results[service] = "ok";
      await sql`insert into health_checks (service, ok) values (${service}, true)`.catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results[service] = msg;
      await sql`insert into health_checks (service, ok, detail) values (${service}, false, ${msg})`.catch(() => {});
    }
  };
  await check("database", () => sql`select 1`);
  await check("telegram", () => tg("getMe", {}));
  await check("hubspot", () => hubspot.ping());
  await check("vaani", async () => {
    const r = await fetch(`${process.env.VAANI_API_BASE || "https://api.vaanivoice.ai"}/api/list-agents`, {
      headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
  const broken = Object.entries(results).filter(([, v]) => v !== "ok");
  if (broken.length) await alertFounder(`🛠 Aangan system health: ${broken.map(([k, v]) => `${k} → ${esc(v.slice(0, 120))}`).join("; ")}`).catch(() => {});

  // SLA escalation (needs the database; skip if it's down).
  let escalated = 0;
  if (results.database === "ok") {
    const sla = Number(await getSetting("claim_sla_minutes", "60"));
    const late = await sql<{ id: number; locality: string | null; minutes: number }[]>`
      select id, locality, extract(epoch from now() - handoff_sent_at)::int / 60 as minutes from enquiries
      where status = 'qualified' and claimed_by is null and escalated_at is null
        and handoff_sent_at < now() - make_interval(mins => ${sla})`;
    for (const e of late) {
      await alertFounder(`⏰ Lead #${e.id} (${esc(e.locality ?? "")}) unclaimed for ${e.minutes} min. ${process.env.APP_URL ?? ""}`).catch(() => {});
      await sql`update enquiries set escalated_at = now() where id = ${e.id}`;
      await logEvent("escalated", { enquiryId: e.id, detail: { minutes: e.minutes } });
      escalated++;
    }
  }
  return Response.json({ health: results, escalated });
}
