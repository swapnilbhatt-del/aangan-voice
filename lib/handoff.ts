// The note a designer reads on Telegram. Built from the verdict in code (no second model call)
// so its shape never drifts. Only the fields a designer needs; the transcript stays behind the dashboard.
import type { Verdict } from "./ai";
import type { Decision } from "./decide";
import { esc } from "./telegram";

const FLAG_TEXT: Record<string, string> = {
  timeline_tight: "Timeline is 6–10 weeks: tight, confirm feasibility",
  commercial_under_500_designer_to_confirm: "Commercial under 500 sq ft: designer to confirm fit (minimum not set by Nikhil)",
  vip_referral: "VIP referral: respond fast",
  caller_frustrated: "Caller was frustrated: handle with care",
  mentions_previous_unanswered_enquiry: "Says an earlier enquiry got no follow-up",
  budget_uncertain: "Budget fit unclear",
  decision_maker_uncertain: "Decision-maker not confirmed",
  asked_for_human: "Asked to speak to a person: call back first",
  rented_no_structural: "Rented flat: no structural changes, landlord OK",
  price_leak: "⚠️ Agent may have said a price: check transcript",
  merged_dropped_call: "Dropped call + call-back merged into one enquiry",
  timeline_not_asked: "Timeline not discussed: ask on first call",
  real_project_unconfirmed: "Scope not fully captured: confirm on first call",
  service_area_unconfirmed: "Location not confirmed: check it's in Pune/PCMC",
  scope_fit_unconfirmed: "Project type not confirmed",
};

const tick = (s: string) => (s === "pass" ? "✅" : s === "fail" ? "❌" : "⚠️");

export function buildHandoff(opts: {
  v: Verdict;
  d: Decision;
  endedAt: Date;
  durationS: number | null;
  priority: string | null;
  callId: number;
}): string {
  const { v, d } = opts;
  const f = v.fields;
  const when = opts.endedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const dur = opts.durationS ? `${Math.floor(opts.durationS / 60)}m${String(Math.round(opts.durationS % 60)).padStart(2, "0")}s` : "";
  const size = f.size_sqft ? `~${f.size_sqft.toLocaleString("en-IN")} sq ft` : "size not given";
  const c = v.criteria;
  const notes = [...v.designer_notes, ...d.flags.map((x) => FLAG_TEXT[x]).filter(Boolean)];
  const app = process.env.APP_URL ?? "";

  const lines = [
    `${opts.priority === "previously_dropped" ? "🔴 PRIORITY · PREVIOUSLY DROPPED\n" : ""}🏠 <b>QUALIFIED LEAD</b> · Phone · ${esc(when)}${dur ? ` · ${dur}` : ""}`,
    `<b>${esc(f.caller_first_name ?? "Caller")}</b> · ${esc(f.locality ?? "locality not given")} · ${esc(f.property ?? "property not given")}, ${size}`,
    `<b>Scope:</b> ${esc(f.scope ?? "—")}${f.ownership ? ` (${esc(f.ownership)})` : ""}`,
    `<b>Timeline:</b> ${esc(f.timeline ?? "—")}`,
    `<b>Budget:</b> ${esc(f.budget ?? "not mentioned")}`,
    `<b>Decision:</b> ${esc(f.decision ?? "—")}`,
    `<b>Source:</b> ${esc(f.source)}${f.referral_name ? ` (${esc(f.referral_name)})` : ""}`,
    `<b>Consultation:</b> ${esc(f.consultation_type.replace("_", " "))}${f.preferred_slots ? ` · prefers ${esc(f.preferred_slots)}` : ""}${f.site_access ? ` · site: ${esc(f.site_access)}` : ""}`,
    `<b>Language:</b> ${esc(f.language)}`,
    `${tick(c.real_project.status)} Real project ${tick(c.service_area.status)} Area ${tick(c.timeline.status)} Timeline ${tick(c.budget.status)} Budget ${tick(c.decision_maker.status)} Decision-maker`,
    `<b>Notes for designer:</b> ${notes.length ? "\n• " + notes.map(esc).join("\n• ") : "none"}`,
    app ? `<a href="${app}/calls/${opts.callId}">Transcript + recording → dashboard</a>` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export const toPlain = (html: string) =>
  html.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, "$2: $1").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
