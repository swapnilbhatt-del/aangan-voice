import { listCalls, getStats, getAttention } from "@/lib/queries";
import { Outcome, OUTCOME_LABEL, inr, lakh, ist, dur, flagList } from "./ui";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "qualified", "declined", "nurture", "complaint", "needs_review", "non_enquiry"] as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const { outcome: filter = "all" } = await searchParams;
  const [calls, stats, attention] = await Promise.all([listCalls(200), getStats(), getAttention()]);
  const shown = filter === "all" ? calls : calls.filter((c) => (c.outcome ?? "") === filter);
  const t = stats.totals;
  const totalCost = t.vaani_cost + t.llm_cost + t.email_cost;
  const f = stats.funnel;
  const hours = Array.from({ length: 24 }, (_, h) => stats.byHour.find((x) => x.hour === h)?.n ?? 0);
  const maxHour = Math.max(1, ...hours);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const pipelineValue = f.open_pipeline * stats.avgValue;
  const maxSource = Math.max(1, ...stats.sources.map((s) => s.n));

  return (
    <>
      <section aria-labelledby="attn">
        <h2 id="attn">Needs attention</h2>
        <div className="card">
          {attention.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>Nothing waiting. Every lead is claimed and no call needs a human look.</p>
          ) : (
            <ul className="attn">
              {attention.map((a, i) => (
                <li key={i}>
                  <strong>{a.kind}</strong> · {a.label} · <span className="muted small">{ist(a.at)}</span>{" "}
                  {a.call_id ? <a href={`/calls/${a.call_id}`}>Open call</a> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="month">
        <h2 id="month">This month</h2>
        <div className="grid">
          <div className="card kpi"><div className="v">{t.calls}</div><div className="l">Calls answered by the agent</div><div className="s">{pct(t.after_hours, t.calls)} after hours (outside 10am–7pm)</div></div>
          <div className="card kpi"><div className="v">{t.qualified}</div><div className="l">Qualified → designers</div><div className="s">{pct(t.qualified, t.calls)} of calls</div></div>
          <div className="card kpi"><div className="v">{f.median_claim_min == null ? "—" : `${Math.round(f.median_claim_min)} min`}</div><div className="l">Median handoff → claim</div><div className="s">SLA {stats.sla} min · {f.unclaimed_late} late now</div></div>
          <div className="card kpi"><div className="v">{inr(totalCost)}</div><div className="l">Cost this month</div><div className="s">{inr(t.calls ? totalCost / t.calls : null, 1)} per call</div></div>
          <div className="card kpi"><div className="v">{inr(t.qualified ? totalCost / t.qualified : null)}</div><div className="l">Cost per qualified lead</div><div className="s">{inr(f.signed ? totalCost / f.signed : null)} per signed project</div></div>
          <div className="card kpi"><div className="v">{t.price_leaks}</div><div className="l">Calls where a price was spoken</div><div className="s">Target: 0 (pricing.md)</div></div>
        </div>
      </section>

      <section className="two" aria-label="Outcomes and timing">
        <div>
          <h2>Outcomes</h2>
          <div className="card">
            {(["qualified", "declined", "nurture", "complaint", "needs_review", "non_enquiry"] as const).map((k) => {
              const n = k === "needs_review" ? t.needs_review : (t[k] as number);
              return (
                <div className="hbar" key={k}>
                  <span><Outcome value={k} /></span>
                  <div className="track" aria-hidden="true"><div className="fill" style={{ width: `${t.calls ? (n / t.calls) * 100 : 0}%` }} /></div>
                  <span className="num">{n}</span>
                </div>
              );
            })}
            <p className="small muted" style={{ marginBottom: 0 }}>
              Declined by failed criterion:{" "}
              {stats.declinedBy.length ? stats.declinedBy.map((d) => `${d.criterion} ${d.n}`).join(" · ") : "none yet"}
            </p>
          </div>
        </div>
        <div>
          <h2>Calls by hour (IST)</h2>
          <div className="card">
            <div className="bars" role="img" aria-label={`Calls per hour of day. Darker bars are outside 10am to 7pm. ${hours.map((n, h) => (n ? `${h}:00 ${n}` : "")).filter(Boolean).join(", ") || "No calls yet"}`}>
              {hours.map((n, h) => (
                <div key={h} className={h < 10 || h >= 19 ? "off" : ""} style={{ height: `${(n / maxHour) * 100}%` }} title={`${h}:00 · ${n} calls`} />
              ))}
            </div>
            <div className="barlabels" aria-hidden="true">{hours.map((_, h) => <span key={h}>{h % 3 === 0 ? h : ""}</span>)}</div>
            <p className="small muted" style={{ marginBottom: 0 }}>Darker bars: after hours, when the front desk is closed and only the agent answers.</p>
          </div>
        </div>
      </section>

      <section className="two" aria-label="Pipeline and cost">
        <div>
          <h2 id="pipeline">Pipeline (designers mark outcomes on Telegram; mirrored in HubSpot)</h2>
          <div className="card">
            <table>
              <tbody>
                <tr><td>Calls</td><td className="num">{t.calls}</td><td className="num muted">100%</td></tr>
                <tr><td>Qualified</td><td className="num">{f.qualified}</td><td className="num muted">{pct(f.qualified, t.calls)}</td></tr>
                <tr><td>Claimed by a designer</td><td className="num">{f.claimed}</td><td className="num muted">{pct(f.claimed, f.qualified)}</td></tr>
                <tr><td>Consultation booked</td><td className="num">{f.consultation}</td><td className="num muted">{pct(f.consultation, f.claimed)}</td></tr>
                <tr><td>Signed</td><td className="num">{f.signed}</td><td className="num muted">{pct(f.signed, f.consultation)}</td></tr>
              </tbody>
            </table>
            <p style={{ margin: "12px 0 6px" }}>
              Open pipeline: <strong>{lakh(pipelineValue)}</strong> <span className="muted small">({f.open_pipeline} open × {lakh(stats.avgValue)} average)</span>
            </p>
            <form method="post" action="/api/settings" className="small">
              <label htmlFor="avg">Average project value (₹ lakh): </label>
              <input id="avg" name="avg_lakh" type="number" step="0.5" min="1" defaultValue={stats.avgValue / 1e5} />{" "}
              <button type="submit">Update</button>
            </form>
          </div>
        </div>
        <div>
          <h2>What it costs (this month, from provider data)</h2>
          <div className="card">
            <table>
              <tbody>
                <tr><td>Vaani voice minutes</td><td className="num">{inr(t.vaani_cost, 2)}</td></tr>
                <tr><td>Verdict model tokens</td><td className="num">{inr(t.llm_cost, 2)}</td></tr>
                <tr><td>Email (Resend)</td><td className="num">{inr(t.email_cost, 2)}</td></tr>
                <tr><td>Telegram, Vercel, Neon, HubSpot</td><td className="num">₹0 <span className="muted small">free tiers</span></td></tr>
                <tr><th scope="row">Total</th><td className="num"><strong>{inr(totalCost, 2)}</strong></td></tr>
              </tbody>
            </table>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Vaani cost comes from Vaani's call history when it's available; otherwise it's the call's duration × Vaani's per-minute rate ({t.estimated_calls} of {t.calls} calls estimated this way). Model cost is computed from the tokens each verdict used.
            </p>
          </div>
        </div>
      </section>

      <section className="two" aria-label="Sources and localities">
        <div>
          <h2>Leads by source</h2>
          <div className="card">
            {stats.sources.length === 0 ? <p className="muted small">No enquiries yet.</p> : stats.sources.map((s) => (
              <div className="hbar" key={s.source}>
                <span>{s.source}</span>
                <div className="track" aria-hidden="true"><div className="fill" style={{ width: `${(s.n / maxSource) * 100}%` }} /></div>
                <span className="num">{s.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2>Top localities</h2>
          <div className="card">
            {stats.localities.length === 0 ? <p className="muted small">No enquiries yet.</p> : (
              <table>
                <thead><tr><th>Locality</th><th className="num">Enquiries</th><th className="num">Qualified</th></tr></thead>
                <tbody>{stats.localities.map((l) => <tr key={l.locality}><td>{l.locality}</td><td className="num">{l.n}</td><td className="num">{l.qualified}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="calls">
        <h2 id="calls">All calls</h2>
        <nav className="filters" aria-label="Filter calls by outcome">
          {FILTERS.map((k) => (
            <a key={k} href={k === "all" ? "/" : `/?outcome=${k}#calls`} aria-current={filter === k ? "true" : undefined}>
              {k === "all" ? "All" : OUTCOME_LABEL[k]}
            </a>
          ))}
        </nav>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>When</th><th>Outcome</th><th>Caller</th><th className="hide-sm">Why</th><th className="num">Length</th>
                <th className="num hide-sm">Cost</th><th>Recording</th><th><span className="skip">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={8} className="muted">{filter === "all" ? "No calls yet. Make a test call from Vaani and it will appear here within a minute." : <>No {OUTCOME_LABEL[filter]?.toLowerCase()} calls. <a href="/#calls">Show all</a></>}</td></tr>
              )}
              {shown.map((c) => (
                <tr key={c.id}>
                  <td>{ist(c.started_at ?? c.created_at)}{c.after_hours ? <div className="small muted">after hours</div> : null}</td>
                  <td>
                    <Outcome value={c.processing === "error" ? "needs_review" : c.outcome} />
                    {c.claimed_by ? <div className="small muted">claimed: {c.claimed_by}</div> : null}
                    {c.enquiry_outcome ? <div className="small muted">{c.enquiry_outcome.replace("_", " ")}</div> : null}
                  </td>
                  <td>{c.first_name ?? "—"}<div className="small muted">{c.locality ?? ""}</div></td>
                  <td className="hide-sm small">
                    {c.failed_criteria.length ? <>Failed: {c.failed_criteria.join(", ")}<br /></> : null}
                    {flagList(c.priority, c.flags).join(" · ")}
                  </td>
                  <td className="num">{dur(c.duration_s)}</td>
                  <td className="num hide-sm">{inr((c.vaani_cost_inr ?? 0) + (c.llm_cost_inr ?? 0), 2)}</td>
                  <td><audio controls preload="none" src={`/api/recording/${c.id}`} aria-label={`Recording of call ${c.id}`} /></td>
                  <td><a href={`/calls/${c.id}`}>Transcript</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
