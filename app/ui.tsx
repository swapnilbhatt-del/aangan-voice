export const OUTCOME_LABEL: Record<string, string> = {
  qualified: "Qualified",
  declined: "Declined",
  nurture: "Nurture",
  complaint: "Complaint",
  non_enquiry: "Non-enquiry",
  needs_review: "Needs review",
};

export function Outcome({ value }: { value: string | null }) {
  const v = value ?? "pending";
  return <span className={`badge b-${v}`}>{OUTCOME_LABEL[v] ?? "Processing"}</span>;
}

export const inr = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

export const ist = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

export const dur = (s: number | null | undefined) => (s == null ? "—" : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`);

export const FLAG_LABEL: Record<string, string> = {
  timeline_tight: "Tight timeline",
  commercial_under_500_designer_to_confirm: "<500 sq ft: designer to confirm",
  vip_referral: "VIP referral",
  caller_frustrated: "Frustrated",
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

// Priority and flags overlap (vip_referral can be both); show each once.
export const flagList = (priority: string | null, flags: string[]) =>
  [...new Set([...(priority ? [priority] : []), ...flags])].map((f) => (f === "previously_dropped" ? "Previously dropped" : flagLabel(f)));
