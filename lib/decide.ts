// Turns the model's per-criterion reading into Nikhil's pass/fail decision.
// The boundary logic lives here, in code, so it is the same every time.
import type { Verdict } from "./ai";
import { checkServiceArea, type AreaCheck } from "./rules";

export type Outcome = "qualified" | "declined" | "nurture" | "complaint" | "non_enquiry" | "needs_review";

export const CRITERION_LABEL: Record<keyof Verdict["criteria"], string> = {
  real_project: "Real project",
  service_area: "Area",
  timeline: "Timeline",
  budget: "Budget",
  decision_maker: "Decision-maker",
  scope_fit: "Scope",
};

export type Decision = {
  outcome: Outcome;
  failed: string[];
  flags: string[];
  area: AreaCheck;
  reason: string;
};

export function decide(v: Verdict): Decision {
  const flags = new Set<string>(v.flags);
  const area = checkServiceArea(v.fields.locality);
  const c = structuredClone(v.criteria);

  // The locality list is the source of truth when it gives a confident answer.
  const areaStatus = area.status === "in" ? "pass" : "fail";
  if (area.status !== "unclear" && c.service_area.status !== areaStatus) {
    c.service_area = {
      status: areaStatus,
      evidence: `${area.matched} is ${area.status === "in" ? "inside" : "outside"} the Pune/PCMC service area (locality list).`,
    };
  }
  v.criteria = c;

  if (v.call_type === "existing_client_complaint") return { outcome: "complaint", failed: [], flags: [...flags], area, reason: "Existing client complaint: not a sales lead." };
  if (v.call_type === "non_enquiry") return { outcome: "non_enquiry", failed: [], flags: [...flags], area, reason: "Not an enquiry." };

  const failed = (Object.keys(c) as (keyof typeof c)[]).filter((k) => c[k].status === "fail");

  // Timing is the only problem and the caller is open to later: keep warm, front desk follows up.
  if (failed.length === 1 && failed[0] === "timeline" && v.nurture) {
    return { outcome: "nurture", failed: [CRITERION_LABEL.timeline], flags: [...flags], area, reason: "Timeline too short; open to a later start." };
  }
  if (failed.length >= 1) {
    return {
      outcome: "declined",
      failed: failed.map((k) => CRITERION_LABEL[k]),
      flags: [...flags],
      area,
      reason: v.decline_reason ?? `Failed: ${failed.map((k) => CRITERION_LABEL[k]).join(", ")}`,
    };
  }

  // Unclear on 1, 2 or 3 after the call: a human checks before a designer's time is spent.
  // Two exceptions. A timeline that simply never came up isn't a red flag (the rubric fails
  // rushes, not silence), so it forwards with a note. And a caller whose earlier enquiry we
  // already dropped (T16) is never parked a second time.
  let hardUnclear = (["real_project", "service_area", "timeline", "scope_fit"] as const).filter((k) => c[k].status === "unclear");
  if (hardUnclear.includes("timeline")) {
    flags.add("timeline_not_asked");
    hardUnclear = hardUnclear.filter((k) => k !== "timeline");
  }
  if (hardUnclear.length && flags.has("mentions_previous_unanswered_enquiry")) {
    for (const k of hardUnclear) flags.add(`${k}_unconfirmed`);
    hardUnclear = [];
  }
  if (hardUnclear.length) {
    return { outcome: "needs_review", failed: [], flags: [...flags, "low_confidence"], area, reason: `Unclear: ${hardUnclear.map((k) => CRITERION_LABEL[k]).join(", ")}` };
  }
  // Unclear on budget or decision-maker: forward, and tell the designer.
  if (c.budget.status === "unclear") flags.add("budget_uncertain");
  if (c.decision_maker.status === "unclear") flags.add("decision_maker_uncertain");
  if (v.call_type === "human_callback_request") flags.add("asked_for_human");
  return { outcome: "qualified", failed: [], flags: [...flags], area, reason: "Passes all five criteria." };
}
