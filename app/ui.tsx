// Shared presentational helpers for the dashboard. Status always pairs colour with an icon + label.
export const OUTCOME_LABEL: Record<string, string> = {
  qualified: "Qualified",
  declined: "Declined",
  nurture: "Nurture",
  complaint: "Complaint",
  non_enquiry: "Non-enquiry",
  needs_review: "Needs review",
};
const OUTCOME_TONE: Record<string, [tone: string, icon: string]> = {
  qualified: ["good", "✓"],
  declined: ["neutral", "✕"],
  nurture: ["info", "↻"],
  complaint: ["bad", "!"],
  non_enquiry: ["neutral", "–"],
  needs_review: ["warn", "?"],
  pending: ["neutral", "…"],
};

export function Outcome({ value }: { value: string | null }) {
  const v = value ?? "pending";
  const [tone, icon] = OUTCOME_TONE[v] ?? OUTCOME_TONE.pending;
  return (
    <span className={`pill ${tone}`}>
      <span aria-hidden="true">{icon}</span>
      {OUTCOME_LABEL[v] ?? "Processing"}
    </span>
  );
}

export const CRITERIA = [
  ["real_project", "Real project", "R"],
  ["service_area", "Area", "A"],
  ["timeline", "Timeline", "T"],
  ["budget", "Budget", "B"],
  ["decision_maker", "Decision-maker", "D"],
] as const;

export function CritChips({ criteria }: { criteria: Record<string, { status: string }> | null }) {
  if (!criteria) return <span className="muted small">—</span>;
  return (
    <span className="crit-chips" role="list" aria-label="Nikhil's five criteria">
      {CRITERIA.map(([k, label, letter]) => {
        const st = criteria[k]?.status ?? "none";
        const word = st === "pass" ? "passed" : st === "fail" ? "failed" : st === "unclear" ? "unclear" : "not judged";
        return (
          <span key={k} role="listitem" className={`cc ${st}`} data-tip={`${label}: ${word}`} tabIndex={0} aria-label={`${label} ${word}`}>
            {st === "pass" ? "✓" : st === "fail" ? "✕" : st === "unclear" ? "?" : letter}
          </span>
        );
      })}
    </span>
  );
}

export const inr = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

const tz = { timeZone: "Asia/Kolkata" } as const;
export const ist = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN", { ...tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
export const istTime = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleTimeString("en-IN", { ...tz, hour: "numeric", minute: "2-digit" }) : "—";
export const istDay = (d: Date | null | undefined) => {
  if (!d) return "—";
  const day = (x: Date) => x.toLocaleDateString("en-CA", tz);
  const today = day(new Date());
  const yesterday = day(new Date(Date.now() - 86400_000));
  const v = day(new Date(d));
  return v === today ? "Today" : v === yesterday ? "Yesterday" : new Date(d).toLocaleDateString("en-IN", { ...tz, day: "numeric", month: "short" });
};

export const dur = (s: number | null | undefined) => (s == null ? "—" : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`);
export const secs = (s: number | null | undefined) =>
  s == null ? "—" : s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;

export const FLAG_LABEL: Record<string, string> = {
  timeline_tight: "Tight timeline",
  commercial_under_500_designer_to_confirm: "<500 sq ft: designer to confirm",
  vip_referral: "VIP referral",
  previously_dropped: "Previously dropped",
  caller_frustrated: "Frustrated caller",
  mentions_previous_unanswered_enquiry: "Earlier enquiry dropped",
  budget_uncertain: "Budget unclear",
  decision_maker_uncertain: "Decision-maker unclear",
  low_confidence: "Low confidence",
  asked_for_human: "Asked for a person",
  rented_no_structural: "Rented, no structural",
  price_leak: "Price mentioned",
  merged_dropped_call: "Merged call-back",
  cost_estimated: "Cost estimated from duration",
  timeline_not_asked: "Timeline not asked",
  real_project_unconfirmed: "Scope unconfirmed",
  service_area_unconfirmed: "Location unconfirmed",
  scope_fit_unconfirmed: "Type unconfirmed",
};
export const flagLabel = (f: string) => FLAG_LABEL[f] ?? (f.startsWith("integration_error:") ? `Error: ${f.split(":")[1]}` : f);

// Flags a human should notice (cost_estimated is bookkeeping, shown next to the cost instead).
export function Tags({ priority, flags }: { priority: string | null; flags: string[] }) {
  const all = [...new Set([...(priority ? [priority] : []), ...flags])].filter((f) => f !== "cost_estimated");
  if (!all.length) return null;
  return (
    <span className="flags">
      {all.map((f) => (
        <span key={f} className={`tag${f === "vip_referral" || f === "previously_dropped" ? " vip" : ""}`}>{flagLabel(f)}</span>
      ))}
    </span>
  );
}

export const initials = (name: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

// Vaani transcripts: "[13:33:14] AGENT: text" or "AGENT: text", turns separated by blank lines.
export function parseTranscript(t: string | null): { who: "agent" | "user"; ts: string | null; text: string }[] {
  if (!t) return [];
  const turns: { who: "agent" | "user"; ts: string | null; text: string }[] = [];
  for (const raw of t.split(/\n+/)) {
    const m = raw.match(/^\s*(?:\[([^\]]+)\]\s*)?(AGENT|USER|ASSISTANT|CALLER|BOT)\s*:\s*(.*)$/i);
    if (m) turns.push({ who: /USER|CALLER/i.test(m[2]) ? "user" : "agent", ts: m[1] ?? null, text: m[3] });
    else if (turns.length && raw.trim()) turns[turns.length - 1].text += " " + raw.trim();
  }
  return turns;
}
