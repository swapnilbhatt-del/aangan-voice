import { notFound } from "next/navigation";
import { getCall } from "@/lib/queries";
import { CRITERION_LABEL } from "@/lib/decide";
import { toPlain } from "@/lib/handoff";
import { Outcome, inr, ist, dur, flagList } from "../../ui";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = { pass: "✅", fail: "❌", unclear: "⚠️" };
const EVENT_LABEL: Record<string, string> = {
  telegram_sent: "Handoff sent to designers on Telegram",
  claimed: "Claimed",
  passed: "Passed",
  outcome: "Outcome marked",
  hubspot_synced: "Contact + deal created in HubSpot",
  email_sent: "Email sent",
  escalated: "SLA breach: Nikhil alerted",
  complaint_paged: "Complaint: Nikhil paged on Telegram",
  error: "Integration error",
};

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCall(Number(id));
  if (!c) notFound();
  const v = c.verdict as { criteria?: Record<string, { status: string; evidence: string }>; fields?: Record<string, unknown>; designer_notes?: string[]; decline_reason?: string | null } | null;

  return (
    <>
      <p><a href="/">← All calls</a></p>
      <h2 style={{ marginTop: 0 }}>
        Call #{c.id} · {ist(c.started_at ?? c.created_at)} <Outcome value={c.processing === "error" ? "needs_review" : c.outcome} />
      </h2>
      <p className="muted small">
        {dur(c.duration_s)} · {c.after_hours ? "after hours" : "office hours"} · cost {inr((c.vaani_cost_inr ?? 0) + (c.llm_cost_inr ?? 0), 2)}
        {" "}(Vaani {inr(c.vaani_cost_inr, 2)}, model {inr(c.llm_cost_inr, 2)} for {c.llm_input_tokens ?? 0}+{c.llm_output_tokens ?? 0} tokens) · Vaani id {c.vaani_call_id}
      </p>
      {c.error ? <p className="badge b-declined">Processing error: {c.error}</p> : null}

      <div className="two">
        <div>
          <h2>Verdict</h2>
          <div className="card">
            {v?.criteria ? (
              (Object.keys(CRITERION_LABEL) as (keyof typeof CRITERION_LABEL)[]).filter((k) => v.criteria![k]).map((k) => [k, v.criteria![k]] as const).map(([k, x]) => (
                <div className="crit" key={k}>
                  <span aria-label={x.status}>{ICON[x.status]}</span>
                  <span><strong>{CRITERION_LABEL[k]}</strong></span>
                  <span>{x.evidence}</span>
                </div>
              ))
            ) : (
              <p className="muted">No verdict yet.</p>
            )}
            {v?.decline_reason ? <p><strong>Reason given to caller:</strong> {v.decline_reason}</p> : null}
            {c.flags.length || c.priority ? <p className="small">Flags: {flagList(c.priority, c.flags).join(" · ")}</p> : null}
            <form method="post" action={`/api/calls/${c.id}/rerun`}>
              <button type="submit">Re-run verdict</button>{" "}
              <span className="small muted">Uses the stored post-call payload; safe to repeat.</span>
            </form>
          </div>

          {c.handoff_note ? (
            <>
              <h2>Handoff note sent to designers</h2>
              <pre className="transcript">{toPlain(c.handoff_note)}</pre>
            </>
          ) : null}

          <h2>Timeline</h2>
          <div className="card">
            <ul className="attn">
              <li>{ist(c.ended_at ?? c.created_at)} · Call ended, transcript received</li>
              {c.events.map((e, i) => (
                <li key={i}>
                  {ist(e.at)} · {EVENT_LABEL[e.kind] ?? e.kind}
                  {e.detail && (e.detail.by || e.detail.outcome || e.detail.message) ? (
                    <span className="muted small"> ({String(e.detail.by ?? "")}{e.detail.outcome ? ` ${String(e.detail.outcome).replace("_", " ")}` : ""}{e.detail.message ? ` ${String(e.detail.step)}: ${String(e.detail.message).slice(0, 140)}` : ""})</span>
                  ) : null}
                </li>
              ))}
              {c.related.map((r) => (
                <li key={r.id}>Same enquiry: <a href={`/calls/${r.id}`}>call #{r.id}</a> ({ist(r.created_at)})</li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h2>Recording</h2>
          <div className="card"><audio controls preload="none" src={`/api/recording/${c.id}`} style={{ width: "100%" }} aria-label="Call recording" /></div>
          {c.summary ? (
            <>
              <h2>Summary</h2>
              <div className="card">{c.summary}</div>
            </>
          ) : null}
          <h2>Transcript</h2>
          <pre className="transcript">{c.transcript ?? "Transcript not received yet."}</pre>
        </div>
      </div>
    </>
  );
}
