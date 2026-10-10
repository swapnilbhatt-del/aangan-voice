// The one editable assumption on the dashboard: average project value for pipeline estimates.
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const form = await req.formData();
  const lakh = Number(form.get("avg_lakh"));
  if (!Number.isFinite(lakh) || lakh <= 0 || lakh > 500) return Response.json({ error: "Enter a value in lakh between 0 and 500" }, { status: 400 });
  await sql`
    insert into settings (key, value) values ('avg_project_value_inr', ${String(Math.round(lakh * 100000))})
    on conflict (key) do update set value = excluded.value`;
  return Response.redirect(new URL("/#pipeline", req.url), 303);
}
