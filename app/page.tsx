import { listCalls, getStats, getAttention } from "@/lib/queries";
import { Outcome, OUTCOME_LABEL, CritChips, Tags, inr, lakh, ist, istDay, istTime, dur, secs, initials } from "./ui";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "qualified", "declined", "nurture", "complaint", "needs_review", "non_enquiry"] as const;
const ATTN: Record<string, [tone: string, icon: string]> = {
  "Unclaimed past SLA": ["bad", "⏱"],
  Complaint: ["bad", "!"],
  "Processing failed": ["bad", "⚠"],
  "Needs review": ["warn", "?"],
  "Price mentioned by agent": ["bad", "₹"],
  "Previously dropped": ["warn", "↺"],
  "Nurture follow-up due": ["info", "↻"],
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const { outcome: filter = "all" } = await searchParams;
  const [calls, stats, attention] = await Promise.all([listCalls(200), getStats(), getAttention()]);
  const t = stats.totals;
  const f = stats.funnel;
  const outcomeOf = (c: (typeof calls)[number]) => (c.processing === "error" ? "needs_review" : c.outcome ?? "");
  const counts = Object.fromEntries(FILTERS.map((k) => [k, k === "all" ? calls.length : calls.filter((c) => outcomeOf(c) === k).length]));
  const shown = filter === "all" ? calls : calls.filter((c) => outcomeOf(c) === filter);

  const totalCost = t.vaani_cost + t.llm_cost + t.email_cost;
  const hours = Array.from({ length: 24 }, (_, h) => stats.byHour.find((x) => x.hour === h)?.n ?? 0);
  const maxHour = Math.max(1, ...hours);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const pipelineValue = f.open_pipeline * stats.avgValue;
  const toDesigner = stats.speed?.median_to_designer_s ?? null;
  const month = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });

  const funnel = [
    { label: "Calls answered", n: t.calls },
    { label: "Qualified", n: f.qualified },
    { label: "Claimed by designer", n: f.claimed },
    { label: "Consultation booked", n: f.consultation },
    { label: "Signed", n: f.signed },
  ];
  const outcomes = [
    { k: "qualified", n: t.qualified },
    { k: "declined", n: t.declined },
    { k: "nurture", n: t.nurture },
    { k: "complaint", n: t.complaint },
    { k: "needs_review", n: t.needs_review },
    { k: "non_enquiry", n: t.non_enquiry },
  ];
  const maxOutcome = Math.max(1, ...outcomes.map((o) => o.n));
  const maxDecl = Math.max(1, ...stats.declinedBy.map((d) => d.n));
  const maxSrc = Math.max(1, ...stats.sources.map((s) => s.n));
  const maxLoc = Math.max(1, ...stats.localities.map((l) => l.n));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">{month}</p>
          <h1 className="title">Every call, answered.</h1>
          <p className="lede">
            {t.calls === 0 ? (
              <>No calls yet this month. When the agent answers one, it appears here within a minute, with its verdict, recording and cost.</>
            ) : (
              <>
                The agent answered <strong>{t.calls} call{t.calls === 1 ? "" : "s"}</strong>
                {t.after_hours ? <>, <strong>{t.after_hours}</strong> after the front desk closed</> : null}.{" "}
                <strong>{t.qualified}</strong> qualified lead{t.qualified === 1 ? "" : "s"} reached designers
                {toDesigner != null ? <> a median <strong>{secs(toDesigner)}</strong> after the caller hung up</> : null}, and
                {t.price_leaks === 0 ? <> no price was ever quoted.</> : <> <strong>{t.price_leaks}</strong> call{t.price_leaks === 1 ? "" : "s"} need a pricing check.</>}
              </>
            )}
          </p>
        </div>
      </div>

      {/* ---------- KPIs ---------- */}
      <section aria-label="This month at a glance" className="kpis">
        <div className="card kpi hero">
          <div className="label">Call end → designer</div>
          <div className="value">{toDesigner == null ? "—" : secs(toDesigner)}</div>
          <div className="foot">
            {toDesigner == null ? "No handoffs yet" : toDesigner <= 300 ? <span className="pill good">✓ Within 5-min promise</span> : <span className="pill bad">! Over 5 min</span>}
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Calls answered</div>
          <div className="value">{t.calls}</div>
          <div className="foot">{pct(t.after_hours, t.calls)} after the front desk closed</div>
        </div>
        <div className="card kpi">
          <div className="label">Qualified leads</div>
          <div className="value">{t.qualified}<small>{t.calls ? pct(t.qualified, t.calls) : ""}</small></div>
          <div className="foot">sent to designers on Telegram</div>
        </div>
        <div className="card kpi">
          <div className="label">Handoff → claim</div>
          <div className="value">{f.median_claim_min == null ? "—" : secs(f.median_claim_min * 60)}</div>
          <div className="foot">{f.unclaimed_late ? <span className="pill bad">! {f.unclaimed_late} past {stats.sla}-min SLA</span> : `SLA ${stats.sla} min · none late`}</div>
        </div>
        <div className="card kpi">
          <div className="label">Cost per qualified lead</div>
          <div className="value">{t.qualified ? inr(totalCost / t.qualified) : "—"}</div>
          <div className="foot">{inr(totalCost, 2)} this month · {t.calls ? inr(totalCost / t.calls, 1) : "—"}/call</div>
        </div>
        <div className="card kpi">
          <div className="label">Prices quoted by agent</div>
          <div className="value">{t.price_leaks}</div>
          <div className="foot">{t.price_leaks === 0 ? <span className="pill good">✓ Target 0 met</span> : <span className="pill bad">! Check transcripts</span>}</div>
        </div>
      </section>

      {/* ---------- Needs attention ---------- */}
      <section className="section" aria-labelledby="attn">
        <h2 className="section-title" id="attn">Needs attention</h2>
        <div className="card">
          {attention.length === 0 ? (
            <div className="empty-ok">
              <span className="attn-icon info" aria-hidden="true">✓</span>
              <span>Nothing waiting. No lead is past its {stats.sla}-minute claim window, and no call needs a human look.</span>
            </div>
          ) : (
            <ul className="attn-list">
              {attention.map((a, i) => {
                const [tone, icon] = ATTN[a.kind] ?? ["info", "•"];
                return (
                  <li key={i}>
                    <span className={`attn-icon ${tone}`} aria-hidden="true">{icon}</span>
                    <span>
                      <span className="attn-kind">{a.kind}</span>
                      <br />
                      <span className="attn-label">{a.label} · {ist(a.at)}</span>
                    </span>
                    {a.call_id ? <a className="btn-link" href={`/calls/${a.call_id}`}>Open call →</a> : <span />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- Pipeline + calls by hour ---------- */}
      <section className="section grid-2" aria-label="Pipeline and timing">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title" id="pipeline">Pipeline</h2>
            <p className="card-note">Designers mark stages on Telegram · mirrored in HubSpot</p>
          </div>
          <div className="chart">
            <div className="funnel" role="list">
              {funnel.map((s, i) => {
                const prev = i === 0 ? null : funnel[i - 1].n;
                return (
                  <div className="fstep" role="listitem" key={s.label}>
                    <span className="name"><span>{s.label}</span> <b>{s.n}</b></span>
                    <span className="track" aria-hidden="true">
                      <span
                        className="fill"
                        style={{ display: "block", width: `${funnel[0].n ? Math.max(2, (s.n / funnel[0].n) * 100) : 2}%`, background: `var(--ramp-${5 - i})` }}
                      />
                    </span>
                    <span className="conv">{prev == null ? "" : `${pct(s.n, prev)} of prev`}</span>
                  </div>
                );
              })}
            </div>
            <div className="pipeline-hero">
              <span className="big">{lakh(pipelineValue)}</span>
              <span className="muted small">open pipeline · {f.open_pipeline} lead{f.open_pipeline === 1 ? "" : "s"} × {lakh(stats.avgValue)} average project</span>
            </div>
            <form method="post" action="/api/settings" className="inline-form">
              <label htmlFor="avg">Average project value (₹ lakh)</label>
              <input id="avg" name="avg_lakh" type="number" step="0.5" min="1" defaultValue={stats.avgValue / 1e5} />
              <button type="submit" className="ghost">Update</button>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Calls by hour (IST)</h2>
            <div className="legend" aria-hidden="true">
              <span><i className="sw" style={{ background: "var(--s1)" }} />Front desk open</span>
              <span><i className="sw" style={{ background: "var(--s2)" }} />After hours</span>
            </div>
          </div>
          <div className="chart">
            <div className="cols" role="img" aria-label={`Calls per hour of day. ${hours.map((n, h) => (n ? `${h}:00, ${n} call${n === 1 ? "" : "s"}` : "")).filter(Boolean).join("; ") || "No calls yet"}.`}>
              <span className="band" style={{ left: `${(10 / 24) * 100}%`, width: `${(9 / 24) * 100}%` }} aria-hidden="true" />
              {hours.map((n, h) => {
                const off = h < 10 || h >= 19;
                return (
                  <span key={h} className={`col${off ? " off" : ""}${n ? "" : " zero"}`} tabIndex={n ? 0 : -1} data-tip={`${h}:00–${h + 1}:00 · ${n} call${n === 1 ? "" : "s"}${off ? " · after hours" : ""}`}>
                    <span className="bar" style={{ height: n ? `${(n / maxHour) * 100}%` : "2px" }} />
                  </span>
                );
              })}
            </div>
            <div className="axis" aria-hidden="true">{hours.map((_, h) => <span key={h}>{h % 3 === 0 ? (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`) : ""}</span>)}</div>
            <p className="card-note" style={{ marginTop: 10 }}>Shaded band: 10am–7pm, when the front desk is in. Everything outside it would have gone unanswered before.</p>
          </div>
        </div>
      </section>

      {/* ---------- Outcomes + why declined ---------- */}
      <section className="section grid-2" aria-label="Outcomes">
        <div className="card">
          <div className="card-head"><h2 className="card-title">Outcomes</h2><p className="card-note">this month</p></div>
          <div className="chart hbars">
            {outcomes.map((o) => (
              <div className="hbar" key={o.k} tabIndex={0} data-tip={`${OUTCOME_LABEL[o.k]}: ${o.n} (${pct(o.n, t.calls)})`}>
                <span><Outcome value={o.k} /></span>
                <span className="track" aria-hidden="true"><span className="fill" style={{ display: "block", width: `${(o.n / maxOutcome) * 100}%` }} /></span>
                <span className="val">{o.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Why calls were declined</h2><p className="card-note">failed criterion</p></div>
          <div className="chart hbars">
            {stats.declinedBy.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>No declines yet.</p>
            ) : (
              stats.declinedBy.map((d) => (
                <div className="hbar" key={d.criterion} tabIndex={0} data-tip={`${d.criterion}: ${d.n}`}>
                  <span>{d.criterion}</span>
                  <span className="track" aria-hidden="true"><span className="fill" style={{ display: "block", width: `${(d.n / maxDecl) * 100}%` }} /></span>
                  <span className="val">{d.n}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ---------- Sources, localities, cost ---------- */}
      <section className="section grid-2" aria-label="Where leads come from and what it costs">
        <div className="card">
          <div className="card-head"><h2 className="card-title">Where enquiries come from</h2></div>
          <div className="chart hbars">
            {stats.sources.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No enquiries yet.</p> : stats.sources.map((s) => (
              <div className="hbar" key={s.source} tabIndex={0} data-tip={`${s.source}: ${s.n}`}>
                <span style={{ textTransform: "capitalize" }}>{s.source.replace("_", " ")}</span>
                <span className="track" aria-hidden="true"><span className="fill" style={{ display: "block", width: `${(s.n / maxSrc) * 100}%` }} /></span>
                <span className="val">{s.n}</span>
              </div>
            ))}
            {stats.localities.length ? <p className="card-note" style={{ marginTop: 8 }}>Top localities (qualified / enquiries)</p> : null}
            {stats.localities.map((l) => (
              <div className="hbar" key={l.locality} tabIndex={0} data-tip={`${l.locality}: ${l.n} enquiries, ${l.qualified} qualified`}>
                <span>{l.locality}</span>
                <span className="track" aria-hidden="true"><span className="fill" style={{ display: "block", width: `${(l.n / maxLoc) * 100}%` }} /></span>
                <span className="val">{l.qualified}/{l.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="card-title">What it costs</h2><p className="card-note">this month, from provider data</p></div>
          <div className="chart">
            <div className="cost-rows">
              <div className="cost-row"><span>Vaani voice minutes</span><span className="num">{inr(t.vaani_cost, 2)}</span></div>
              <div className="cost-row"><span>Verdict model tokens</span><span className="num">{inr(t.llm_cost, 2)}</span></div>
              <div className="cost-row"><span>Email (Resend)</span><span className="num">{inr(t.email_cost, 2)}</span></div>
              <div className="cost-row"><span>Telegram · Vercel · Supabase · HubSpot</span><span className="num">₹0.00 <span className="muted small">free tiers</span></span></div>
              <div className="cost-row total"><span>Total</span><span className="num">{inr(totalCost, 2)}</span></div>
            </div>
            <div className="meta-row">
              <span className="pill neutral">{t.calls ? inr(totalCost / t.calls, 1) : "—"} per call</span>
              <span className="pill neutral">{t.qualified ? inr(totalCost / t.qualified) : "—"} per qualified lead</span>
              <span className="pill neutral">{f.signed ? inr(totalCost / f.signed) : "—"} per signed project</span>
            </div>
            <p className="card-note" style={{ marginTop: 12 }}>
              Vaani cost comes from Vaani's call history when available, otherwise call duration × Vaani's per-minute rate ({t.estimated_calls} of {t.calls} estimated). Model cost is from the tokens each verdict used.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Calls ---------- */}
      <section className="section" aria-labelledby="calls">
        <h2 className="section-title" id="calls">All calls</h2>
        <div className="card">
          <div className="toolbar">
            <nav className="chips" aria-label="Filter calls by outcome">
              {FILTERS.map((k) => (
                <a key={k} className="chip" href={k === "all" ? "/#calls" : `/?outcome=${k}#calls`} aria-current={filter === k ? "true" : undefined}>
                  {k === "all" ? "All" : OUTCOME_LABEL[k]} <b>{counts[k]}</b>
                </a>
              ))}
            </nav>
            {filter !== "all" ? <a className="btn-link" href="/#calls">Clear filter</a> : null}
          </div>
          <div className="table-wrap">
            <table className="calls">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Caller</th>
                  <th scope="col">Outcome</th>
                  <th scope="col" className="hide-sm">Criteria</th>
                  <th scope="col" className="hide-sm">Length · cost</th>
                  <th scope="col">Recording</th>
                  <th scope="col"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">
                        <div className="big">{filter === "all" ? "No calls yet" : `No ${OUTCOME_LABEL[filter]?.toLowerCase()} calls`}</div>
                        {filter === "all" ? "Start a test call in Vaani; it appears here within a minute." : <a href="/#calls">Show all calls</a>}
                      </div>
                    </td>
                  </tr>
                )}
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td className="when">
                      <div className="t">{istTime(c.started_at ?? c.created_at)}</div>
                      <div className="d">{istDay(c.started_at ?? c.created_at)}{c.after_hours ? " · after hours" : ""}</div>
                    </td>
                    <td>
                      <div className="who">
                        <span className="avatar" aria-hidden="true">{initials(c.first_name)}</span>
                        <span>
                          <span className="name">{c.first_name ?? "Unknown caller"}</span>
                          <br />
                          <span className="sub">{[c.locality, c.property].filter(Boolean).join(" · ") || "—"}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <Outcome value={c.processing === "error" ? "needs_review" : c.outcome} />
                      {c.failed_criteria.length ? <div className="small muted" style={{ marginTop: 4 }}>Failed: {c.failed_criteria.join(", ")}</div> : null}
                      {c.claimed_by ? <div className="small muted" style={{ marginTop: 4 }}>Claimed by {c.claimed_by}</div> : null}
                      <Tags priority={c.priority} flags={c.flags} />
                    </td>
                    <td className="hide-sm"><CritChips criteria={c.criteria} /></td>
                    <td className="hide-sm num">
                      {dur(c.duration_s)}
                      <div className="small muted">
                        {inr((c.vaani_cost_inr ?? 0) + (c.llm_cost_inr ?? 0), 2)}
                        {c.flags.includes("cost_estimated") ? <span data-tip="Estimated from duration × Vaani's per-minute rate" tabIndex={0}> est.</span> : null}
                      </div>
                    </td>
                    <td><audio controls preload="none" src={`/api/recording/${c.id}`} aria-label={`Recording of the call with ${c.first_name ?? "caller"}`} /></td>
                    <td><a className="open-link" href={`/calls/${c.id}`}>Details →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p className="foot-note">Updates automatically after every call · verdicts follow Nikhil's five criteria (qualified.md) · times in IST</p>
    </>
  );
}
