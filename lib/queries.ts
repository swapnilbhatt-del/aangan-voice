// Read-side queries for the founder dashboard. Everything is computed from stored rows;
// nothing is typed in by hand.
import { sql, getSetting } from "./db";

export type CallRow = {
  id: number;
  created_at: Date;
  started_at: Date | null;
  ended_at: Date | null;
  duration_s: number | null;
  after_hours: boolean | null;
  outcome: string | null;
  failed_criteria: string[];
  flags: string[];
  price_leak: boolean;
  processing: string;
  vaani_cost_inr: number | null;
  llm_cost_inr: number | null;
  summary: string | null;
  enquiry_id: number | null;
  first_name: string | null;
  locality: string | null;
  claimed_by: string | null;
  enquiry_outcome: string | null;
  priority: string | null;
  criteria: Record<string, { status: string; evidence: string }> | null;
  property: string | null;
  handoff_sent_at: Date | null;
};

export async function listCalls(limit = 100) {
  return sql<CallRow[]>`
    select c.id, c.created_at, c.started_at, c.ended_at, c.duration_s::float, c.after_hours, c.outcome,
           c.failed_criteria, c.flags, c.price_leak, c.processing, c.vaani_cost_inr::float, c.llm_cost_inr::float,
           c.summary, c.enquiry_id, coalesce(c.verdict->'fields'->>'caller_first_name', p.name) as first_name,
           coalesce(e.locality, c.verdict->'fields'->>'locality') as locality, e.claimed_by, e.outcome as enquiry_outcome, e.priority,
           c.verdict->'criteria' as criteria, c.verdict->'fields'->>'property' as property, e.handoff_sent_at
    from calls c
    left join enquiries e on e.id = c.enquiry_id
    left join callers p on p.id = e.caller_id
    order by coalesce(c.started_at, c.created_at) desc
    limit ${limit}`;
}

export async function getStats() {
  const avgValue = Number(await getSetting("avg_project_value_inr", "1100000"));
  const sla = Number(await getSetting("claim_sla_minutes", "60"));

  const [totals] = await sql<
    {
      calls: number; after_hours: number; qualified: number; declined: number; nurture: number; complaint: number;
      non_enquiry: number; needs_review: number; price_leaks: number; vaani_cost: number; llm_cost: number;
      email_cost: number; costed_calls: number; estimated_calls: number; avg_duration: number | null;
    }[]
  >`
    select count(*)::int as calls,
           count(*) filter (where after_hours)::int as after_hours,
           count(*) filter (where outcome = 'qualified')::int as qualified,
           count(*) filter (where outcome = 'declined')::int as declined,
           count(*) filter (where outcome = 'nurture')::int as nurture,
           count(*) filter (where outcome = 'complaint')::int as complaint,
           count(*) filter (where outcome = 'non_enquiry')::int as non_enquiry,
           count(*) filter (where outcome = 'needs_review' or processing = 'error')::int as needs_review,
           count(*) filter (where price_leak)::int as price_leaks,
           coalesce(sum(vaani_cost_inr), 0)::float as vaani_cost,
           coalesce(sum(llm_cost_inr), 0)::float as llm_cost,
           coalesce(sum(email_cost_inr), 0)::float as email_cost,
           count(*) filter (where vaani_cost_inr is not null)::int as costed_calls,
           count(*) filter (where 'cost_estimated' = any(flags))::int as estimated_calls,
           avg(duration_s)::float as avg_duration
    from calls where coalesce(started_at, created_at) >= date_trunc('month', now() at time zone 'Asia/Kolkata')`;

  const declinedBy = await sql<{ criterion: string; n: number }[]>`
    select unnest(failed_criteria) as criterion, count(*)::int as n from calls
    where outcome = 'declined' and coalesce(started_at, created_at) >= date_trunc('month', now() at time zone 'Asia/Kolkata')
    group by 1 order by 2 desc`;

  const byHour = await sql<{ hour: number; n: number }[]>`
    select extract(hour from coalesce(started_at, created_at) at time zone 'Asia/Kolkata')::int as hour, count(*)::int as n
    from calls group by 1 order by 1`;

  const [funnel] = await sql<
    { qualified: number; claimed: number; consultation: number; signed: number; lost: number; open_pipeline: number; median_claim_min: number | null; unclaimed_late: number }[]
  >`
    select count(*) filter (where status = 'qualified')::int as qualified,
           count(*) filter (where claimed_at is not null)::int as claimed,
           count(*) filter (where outcome in ('consultation_booked','signed'))::int as consultation,
           count(*) filter (where outcome = 'signed')::int as signed,
           count(*) filter (where outcome = 'lost')::int as lost,
           count(*) filter (where status = 'qualified' and coalesce(outcome, '') not in ('signed','lost'))::int as open_pipeline,
           (percentile_cont(0.5) within group (order by extract(epoch from claimed_at - handoff_sent_at) / 60)
              filter (where claimed_at is not null and handoff_sent_at is not null))::float as median_claim_min,
           count(*) filter (where status = 'qualified' and claimed_by is null and handoff_sent_at < now() - make_interval(mins => ${sla}))::int as unclaimed_late
    from enquiries`;

  // The brief's promise: a qualified lead reaches a designer within 5 minutes of the call ending.
  const [speed] = await sql<{ median_to_designer_s: number | null; max_to_designer_s: number | null; handed_off: number }[]>`
    select (percentile_cont(0.5) within group (order by extract(epoch from e.handoff_sent_at - c.ended_at)))::float as median_to_designer_s,
           max(extract(epoch from e.handoff_sent_at - c.ended_at))::float as max_to_designer_s,
           count(*)::int as handed_off
    from enquiries e
    join lateral (select ended_at from calls where enquiry_id = e.id and ended_at is not null order by created_at limit 1) c on true
    where e.handoff_sent_at is not null`;

  const sources = await sql<{ source: string; n: number }[]>`
    select coalesce(source, 'unknown') as source, count(*)::int as n from enquiries group by 1 order by 2 desc`;
  const localities = await sql<{ locality: string; n: number; qualified: number }[]>`
    select locality, count(*)::int as n, count(*) filter (where status = 'qualified')::int as qualified
    from enquiries where locality is not null group by 1 order by 2 desc limit 8`;

  const health = await sql<{ service: string; ok: boolean; checked_at: Date }[]>`
    select distinct on (service) service, ok, checked_at from health_checks order by service, checked_at desc`;

  return { totals, declinedBy, byHour, funnel, sources, localities, avgValue, sla, speed, health };
}

export async function getAttention() {
  const sla = Number(await getSetting("claim_sla_minutes", "60"));
  return sql<{ kind: string; call_id: number | null; enquiry_id: number | null; label: string; at: Date }[]>`
    select 'Unclaimed past SLA' as kind, (select max(id) from calls where enquiry_id = e.id) as call_id, e.id as enquiry_id,
           coalesce(e.locality, 'lead') || ' · sent ' || to_char(e.handoff_sent_at at time zone 'Asia/Kolkata', 'DD Mon HH12:MI am') as label, e.handoff_sent_at as at
      from enquiries e where status = 'qualified' and claimed_by is null and handoff_sent_at < now() - make_interval(mins => ${sla})
    union all
    select 'Complaint', c.id, c.enquiry_id, coalesce(left(c.summary, 120), 'Existing client complaint'), c.created_at
      from calls c where c.outcome = 'complaint' and c.created_at > now() - interval '7 days'
    union all
    select case when c.processing = 'error' then 'Processing failed' else 'Needs review' end, c.id, c.enquiry_id,
           coalesce(c.error, left(c.summary, 120), 'Unclear after the call'), c.created_at
      from calls c where (c.outcome = 'needs_review' or c.processing = 'error') and c.created_at > now() - interval '14 days'
    union all
    select 'Price mentioned by agent', c.id, c.enquiry_id, 'Check transcript: possible price figure spoken', c.created_at
      from calls c where c.price_leak
    union all
    select 'Previously dropped', c.id, c.enquiry_id, coalesce(e.locality, '') || ' · repeat caller, earlier enquiry had no follow-up', c.created_at
      from calls c join enquiries e on e.id = c.enquiry_id where e.priority = 'previously_dropped' and e.claimed_by is null
    union all
    select 'Nurture follow-up due', (select max(id) from calls where enquiry_id = e.id), e.id,
           coalesce(e.locality, '') || ' · call back on ' || to_char(e.follow_up_on, 'DD Mon'), e.created_at
      from enquiries e where e.status = 'nurture' and (e.follow_up_on is null or e.follow_up_on <= current_date + 3)
    order by at desc limit 30`;
}

export async function getCall(id: number) {
  const [c] = await sql<(CallRow & { transcript: string | null; verdict: Record<string, any> | null; vaani_call_id: string; error: string | null; handoff_note: string | null; llm_input_tokens: number | null; llm_output_tokens: number | null })[]>`
    select c.*, c.duration_s::float, c.vaani_cost_inr::float, c.llm_cost_inr::float,
           coalesce(c.verdict->'fields'->>'caller_first_name', p.name) as first_name, e.locality, e.claimed_by,
           e.outcome as enquiry_outcome, e.priority, e.handoff_note
    from calls c left join enquiries e on e.id = c.enquiry_id left join callers p on p.id = e.caller_id
    where c.id = ${id}`;
  if (!c) return null;
  const events = await sql<{ kind: string; detail: Record<string, unknown> | null; at: Date }[]>`
    select kind, detail, at from events where call_id = ${id} or (enquiry_id is not null and enquiry_id = ${c.enquiry_id}) order by at`;
  const related = c.enquiry_id
    ? await sql<{ id: number; created_at: Date; outcome: string | null }[]>`select id, created_at, outcome from calls where enquiry_id = ${c.enquiry_id} and id <> ${id} order by created_at`
    : [];
  return { ...c, events, related };
}
