import { notFound } from "next/navigation";
import { getCall } from "@/lib/queries";
import { CRITERION_LABEL } from "@/lib/decide";
import { toPlain } from "@/lib/handoff";
import { Outcome, Tags, inr, ist, istDay, istTime, dur, initials, parseTranscript } from "../../ui";

export const dynamic = "force-dynamic";

const EVENT: Record<string, [label: string, tone: "ok" | "err" | ""]> = {
  telegram_sent: ["Handoff note sent to the designers' Telegram group", "ok"],
  claimed: ["Claimed", "ok"],
  passed: ["Passed", ""],
  outcome: ["Stage updated", "ok"],
  hubspot_synced: ["Contact + deal created in HubSpot", "ok"],
  email_sent: ["Email sent", "ok"],
  escalated: ["Unclaimed past SLA: Nikhil alerted", "err"],
  complaint_paged: ["Complaint: Nikhil paged on Telegram", "err"],
  error: ["Integration error", "err"],
};
const ORDER = ["real_project", "service_area", "timeline", "budget", "decision_maker", "scope_fit"] as const;

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCall(Number(id));
  if (!c) notFound();
  const v = c.verdict as {
    criteria?: Record<string, { status: string; evidence: string }>;
    fields?: Record<string, string | number | null>;
    designer_notes?: string[];
    decline_reason?: string | null;
  } | null;
  const fl = v?.fields ?? {};
  const turns = parseTranscript(c.transcript);
  const facts: [string, unknown][] = [
    ["Locality", fl.locality],
    ["Property", [fl.property, fl.size_sqft ? `~${Number(fl.size_sqft).toLocaleString("en-IN")} sq ft` : null].filter(Boolean).join(", ")],
    ["Scope", fl.scope],
    ["Timeline", fl.timeline],
    ["Decision", fl.decision],
    ["Budget", fl.budget ?? "Not mentioned"],
    ["Source", [fl.source, fl.referral_name ? `(${fl.referral_name})` : null].filter(Boolean).join(" ")],
    ["Consultation", [String(fl.consultation_type ?? "").replace("_", " "), fl.preferred_slots].filter(Boolean).join(" · ")],
  ];
  const outcome = c.processing === "error" ? "needs_review" : c.outcome;

  return (
    <>
      <a className="back" href="/#calls">← All calls</a>

      <div className="page-head" style={{ marginTop: 0 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }} aria-hidden="true">{initials(c.first_name)}</span>
          <div>
            <p className="eyebrow">Call #{c.id} · {istDay(c.started_at ?? c.created_at)}, {istTime(c.started_at ?? c.created_at)}{c.after_hours ? " · after hours" : ""}</p>
            <h1 className="title">{c.first_name ?? "Unknown caller"}{fl.locality ? <span className="muted" style={{ fontWeight: 500 }}> · {String(fl.locality)}</span> : null}</h1>
            <div className="meta-row">
              <Outcome value={outcome} />
              {c.failed_criteria.length ? <span className="pill neutral">Failed: {c.failed_criteria.join(", ")}</span> : null}
              {c.claimed_by ? <span className="pill good">✓ Claimed by {c.claimed_by}</span> : null}
              <span className="pill neutral">⏱ {dur(c.duration_s)}</span>
              <span className="pill neutral">
                {inr((c.vaani_cost_inr ?? 0) + (c.llm_cost_inr ?? 0), 2)}
                {c.flags.includes("cost_estimated") ? " (est.)" : ""}
              </span>
              <Tags priority={c.priority} flags={c.flags} />
            </div>
          </div>
        </div>
        <form method="post" action={`/api/calls/${c.id}/rerun`}>
          <button type="submit" className="ghost" title="Re-runs the verdict from the stored post-call payload. Never sends a second Telegram message or HubSpot deal.">↻ Re-run verdict</button>
        </form>
      </div>

      {c.error ? <div className="card card-pad" style={{ borderColor: "var(--bad)", marginBottom: 16 }}><span className="pill bad">⚠ Processing error</span> <span className="small">{c.error}</span></div> : null}

      <div className="detail">
        <div style={{ display: "grid", gap: 16 }}>
          {c.summary ? (
            <div className="card">
              <div className="card-head"><h2 className="card-title">Summary</h2><p className="card-note">by Vaani</p></div>
              <p className="summary">{c.summary}</p>
            </div>
          ) : null}

          <div className="card">
            <div className="card-head"><h2 className="card-title">What the caller told us</h2></div>
            <dl className="facts" style={{ margin: "10px 0 0" }}>
              {facts.map(([k, val]) => (
                <div className="fact" key={k}>
                  <dt>{k}</dt>
                  <dd>{val ? String(val) : <span className="muted">—</span>}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card">
            <div className="card-head"><h2 className="card-title">Verdict: Nikhil's criteria</h2><p className="card-note">from qualified.md + services.md</p></div>
            {v?.criteria ? (
              <ul className="crit-list">
                {ORDER.filter((k) => v.criteria![k]).map((k) => {
                  const x = v.criteria![k];
                  return (
                    <li key={k}>
                      <span className={`cc ${x.status}`} aria-label={x.status}>{x.status === "pass" ? "✓" : x.status === "fail" ? "✕" : "?"}</span>
                      <span className="cname">{CRITERION_LABEL[k]}</span>
                      <span className="ev">{x.evidence}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="summary">No verdict yet.</p>
            )}
            {v?.decline_reason ? <p className="summary" style={{ borderTop: "1px solid var(--line)" }}><strong>Told the caller:</strong> {v.decline_reason}</p> : null}
          </div>

          {c.handoff_note ? (
            <div className="card">
              <div className="card-head"><h2 className="card-title">Handoff note</h2><p className="card-note">as the designers saw it on Telegram</p></div>
              <div className="tg-note">{toPlain(c.handoff_note)}</div>
            </div>
          ) : null}

          <div className="card">
            <div className="card-head"><h2 className="card-title">Activity</h2></div>
            <ul className="timeline">
              <li className="ok">
                Call ended and transcript received
                <div className="tt">{ist(c.ended_at ?? c.created_at)}</div>
              </li>
              {c.events.map((e, i) => {
                const [label, tone] = EVENT[e.kind] ?? [e.kind, ""];
                const d = (e.detail ?? {}) as Record<string, unknown>;
                const extra = d.by ? ` · ${d.by}` : d.outcome ? ` · ${String(d.outcome).replace("_", " ")}` : d.step ? ` · ${String(d.step)}: ${String(d.message ?? "").slice(0, 120)}` : "";
                return (
                  <li key={i} className={tone}>
                    {label}{extra}
                    <div className="tt">{ist(e.at)}</div>
                  </li>
                );
              })}
              {c.related.map((r) => (
                <li key={`r${r.id}`}>Same enquiry: <a href={`/calls/${r.id}`}>call #{r.id}</a><div className="tt">{ist(r.created_at)}</div></li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16, position: "sticky", top: 80 }}>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Recording</h2><p className="card-note">{dur(c.duration_s)}</p></div>
            <div className="player"><audio controls preload="metadata" src={`/api/recording/${c.id}`} aria-label="Call recording" /></div>
          </div>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Transcript</h2><p className="card-note">phone numbers redacted</p></div>
            {turns.length ? (
              <div className="chat" tabIndex={0} aria-label="Call transcript">
                {turns.map((m, i) => (
                  <div key={i} className={`msg ${m.who}`}>
                    <span className="who-l">{m.who === "agent" ? "Aangan agent" : c.first_name ?? "Caller"}{m.ts ? <span className="ts"> · {m.ts}</span> : null}</span>
                    <span className="bubble">{m.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="summary">{c.transcript ?? "Transcript not received yet."}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
