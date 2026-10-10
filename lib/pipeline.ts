// Everything that happens after a call ends: verdict → enquiry (merge/repeat detection) →
// routing (Telegram, HubSpot, email, founder alerts) → log. Each integration step fails on its
// own; one broken provider never loses the call.
import { sql, getSetting, logEvent } from "./db";
import { judgeCall, llmCostInr, type Verdict } from "./ai";
import { decide, type Decision } from "./decide";
import { findCallInHistory } from "./vaani";
import { findPriceLeaks, isAfterHours, normalizePhone, redactPhones, maskPhone } from "./rules";
import { buildHandoff, toPlain } from "./handoff";
import { sendMessage, alertFounder, esc } from "./telegram";
import * as hubspot from "./hubspot";
import { sendEmail } from "./email";

export type PostCall = {
  call_id: string;
  call_duration?: number; // ms in call_postprocessing
  end_reason?: string;
  summary?: string;
  entities?: Record<string, unknown> | null;
  dispositions?: Record<string, unknown> | null;
  recording_url?: string;
  transcript?: string;
  timestamp?: string;
};

const MERGE_WINDOW_MIN = 30;
const str = (x: unknown) => (typeof x === "string" && x.trim() && !/^(null|n\/a|none|unknown)$/i.test(x.trim()) ? x.trim() : null);

async function step<T>(name: string, ids: { enquiryId?: number | null; callId: number }, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${name}]`, msg);
    await logEvent("error", { ...ids, detail: { step: name, message: msg } });
    await sql`
      update calls set flags = array_append(flags, ${"integration_error:" + name})
      where id = ${ids.callId} and not (${"integration_error:" + name} = any(flags))`;
    return null;
  }
}

export async function processCall(p: PostCall): Promise<{ callRowId: number; outcome: string }> {
  // 1. Log row first, so the call exists even if everything below fails.
  const [row] = await sql<{ id: number; processing: string }[]>`
    insert into calls (vaani_call_id, end_reason, summary, entities, dispositions, duration_s)
    values (${p.call_id}, ${p.end_reason ?? null}, ${p.summary ?? null}, ${sql.json((p.entities ?? null) as never)},
            ${sql.json((p.dispositions ?? null) as never)}, ${p.call_duration != null ? p.call_duration / 1000 : null})
    on conflict (vaani_call_id) do update set
      summary = coalesce(excluded.summary, calls.summary), entities = coalesce(excluded.entities, calls.entities),
      dispositions = coalesce(excluded.dispositions, calls.dispositions), duration_s = coalesce(excluded.duration_s, calls.duration_s)
    returning id, processing`;
  const callId = row.id;
  if (row.processing === "processed") return { callRowId: callId, outcome: "duplicate" };
  // A (re-)run starts clean: errors from an earlier attempt shouldn't outlive the fix.
  await sql`update calls set flags = array(select x from unnest(flags) x where x not like 'integration_error:%') where id = ${callId}`;

  try {
    return await run(p, callId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`update calls set processing = 'error', error = ${msg}, outcome = 'needs_review' where id = ${callId}`;
    await logEvent("error", { callId, detail: { step: "process", message: msg } });
    await alertFounder(`⚠️ A call could not be processed automatically and needs a human look.\nCall ${esc(p.call_id)}: ${esc(msg.slice(0, 200))}\n${process.env.APP_URL ?? ""}/calls/${callId}`).catch(() => {});
    return { callRowId: callId, outcome: "error" };
  }
}

async function run(p: PostCall, callId: number) {
  const ents = (p.entities ?? {}) as Record<string, unknown>;

  // 2. Cost, timing and caller number live in call history, not the webhook.
  const hist = await step("vaani_history", { callId }, () => findCallInHistory(p.call_id));
  const endedAt = hist?.End_time ? new Date(hist.End_time + (hist.End_time.endsWith("Z") ? "" : "Z")) : p.timestamp ? new Date(p.timestamp) : new Date();
  const startedAt = hist?.Start_time ? new Date(hist.Start_time + (hist.Start_time.endsWith("Z") ? "" : "Z")) : null;
  const afterHours = isAfterHours(startedAt ?? endedAt);

  // WebRTC test calls carry no caller ID, so the agent asks for the number and Vaani extracts it.
  const phone = normalizePhone(hist?.direction?.toLowerCase() === "inbound" ? hist?.from_number : null) ?? normalizePhone(str(ents.phone_number));
  const transcript = redactPhones(p.transcript ?? "");
  const leaks = findPriceLeaks(transcript);

  // Vaani's call history is the source of truth for cost. If it's unavailable, estimate from
  // duration × the per-minute rate on Vaani's billing page (env), and flag it as an estimate.
  let vaaniCost: number | null = hist?.call_cost ?? null;
  const rate = Number(process.env.VAANI_INR_PER_MIN);
  if (vaaniCost == null && rate && p.call_duration) vaaniCost = Math.round((p.call_duration / 60000) * rate * 100) / 100;
  const costEstimated = hist?.call_cost == null && vaaniCost != null;

  // 3. Verdict. The model never sees phone or email.
  const { phone_number: _p, email: _e, ...safeFields } = ents;
  const { verdict, usage } = await judgeCall({ transcript, callDate: startedAt ?? endedAt, vaaniFields: safeFields });
  const d = decide(verdict);
  if (leaks.length) d.flags.push("price_leak");
  if (costEstimated) d.flags.push("cost_estimated");

  // 4. Caller (PII table) and enquiry, with dropped-call merge and repeat-caller detection.
  const name = verdict.fields.caller_first_name ?? str(ents.caller_name);
  const email = str(ents.email)?.toLowerCase().replace(/\s+at\s+/g, "@").replace(/\s+dot\s+/g, ".").replace(/\s/g, "") ?? null;
  const validEmail = email && /^[^@]+@[^@]+\.[a-z]{2,}$/.test(email) ? email : null;

  // A re-run keeps the call's existing enquiry and caller, so it never creates duplicates
  // (a caller without a phone number can't be matched any other way).
  const [own] = await sql<{ enquiry_id: number | null; caller_id: number | null }[]>`
    select c.enquiry_id, e.caller_id from calls c left join enquiries e on e.id = c.enquiry_id where c.id = ${callId}`;
  let enquiryId: number | null = own?.enquiry_id ?? null;
  let callerId: number | null = own?.caller_id ?? null;
  if (callerId) {
    await sql`update callers set name = coalesce(${name}, name), email = coalesce(${validEmail}, email),
              phone = coalesce(phone, (select ${phone}::text where not exists (select 1 from callers where phone = ${phone})))
              where id = ${callerId}`;
  } else {
    callerId = await upsertCaller(phone, name, validEmail);
  }
  let priority: string | null = verdict.flags.includes("vip_referral") ? "vip_referral" : null;
  if (callerId && !enquiryId) {
    const prior = await sql<{ id: number; status: string; claimed_at: Date | null; minutes_ago: number }[]>`
      select e.id, e.status, e.claimed_at,
             extract(epoch from (now() - coalesce((select max(c.created_at) from calls c where c.enquiry_id = e.id and c.id <> ${callId}), e.created_at)))::float / 60 as minutes_ago
      from enquiries e where e.caller_id = ${callerId} order by e.created_at desc limit 5`;
    const recent = prior.find((e) => e.minutes_ago <= MERGE_WINDOW_MIN && e.status !== "complaint");
    if (recent && d.outcome !== "complaint") {
      enquiryId = recent.id;
      d.flags.push("merged_dropped_call");
    } else if (prior.some((e) => ["qualified", "new", "needs_review", "nurture"].includes(e.status) && !e.claimed_at)) {
      priority = "previously_dropped";
    }
  }
  if (verdict.flags.includes("mentions_previous_unanswered_enquiry")) priority = "previously_dropped";

  const f = verdict.fields;
  if (enquiryId) {
    // A call-back only upgrades the enquiry: a cut-off first call is never the final word.
    await sql`
      update enquiries set status = ${d.outcome}, locality = coalesce(${f.locality}, locality), project_type = ${f.project_type},
        source = ${f.source}, priority = coalesce(${priority}, priority), updated_at = now()
      where id = ${enquiryId}`;
  } else {
    const [e] = await sql<{ id: number }[]>`
      insert into enquiries (caller_id, channel, status, priority, locality, project_type, source, follow_up_on)
      values (${callerId}, 'phone', ${d.outcome}, ${priority}, ${f.locality}, ${f.project_type}, ${f.source},
              ${d.outcome === "nurture" ? (f.follow_up_date ?? null) : null})
      returning id`;
    enquiryId = e.id;
  }

  await sql`
    update calls set enquiry_id = ${enquiryId}, started_at = ${startedAt}, ended_at = ${endedAt}, after_hours = ${afterHours},
      transcript = ${transcript}, verdict = ${sql.json(verdict as never)}, outcome = ${d.outcome},
      failed_criteria = ${d.failed},
      flags = array(select distinct f from unnest(array(select x from unnest(calls.flags) x where x like 'integration_error:%') || ${[...new Set(d.flags)]}::text[]) f),
      price_leak = ${leaks.length > 0},
      vaani_cost_inr = ${vaaniCost}, llm_input_tokens = ${usage.input}, llm_output_tokens = ${usage.output},
      llm_cost_inr = ${llmCostInr(usage)},
      duration_s = coalesce(duration_s, ${hist?.Start_time && hist?.End_time ? (endedAt.getTime() - (startedAt?.getTime() ?? endedAt.getTime())) / 1000 : null})
    where id = ${callId}`;

  // 5. Route.
  const ids = { enquiryId, callId };
  if (d.outcome === "qualified") await routeQualified({ verdict, d, ids, endedAt, callId, priority, phone, name, email });
  if (d.outcome === "complaint") {
    await step("complaint_page", ids, async () => {
      await alertFounder(
        `🚨 <b>EXISTING CLIENT COMPLAINT</b>${afterHours ? " (after hours: callback promised)" : ""}\n${esc(name ?? "Caller")} · ${maskPhone(phone)}\n${esc(p.summary ?? "")}\nCall back within 15 minutes.\n${process.env.APP_URL ?? ""}/calls/${callId}`,
      );
      await logEvent("complaint_paged", ids);
    });
  }
  if (priority === "previously_dropped" && d.outcome !== "complaint") {
    await step("dropped_alert", ids, () =>
      alertFounder(`🔴 Repeat caller whose earlier enquiry got no follow-up: ${esc(name ?? "caller")} (${esc(f.locality ?? "")}). Outcome now: ${d.outcome}.\n${process.env.APP_URL ?? ""}/calls/${callId}`),
    );
  }

  await sql`update calls set processing = 'processed', error = null where id = ${callId}`;
  return { callRowId: callId, outcome: d.outcome };
}

async function upsertCaller(phone: string | null, name: string | null, email: string | null): Promise<number | null> {
  if (!phone && !name && !email) return null;
  if (phone) {
    const [c] = await sql<{ id: number }[]>`
      insert into callers (phone, name, email) values (${phone}, ${name}, ${email})
      on conflict (phone) do update set name = coalesce(excluded.name, callers.name), email = coalesce(excluded.email, callers.email)
      returning id`;
    return c.id;
  }
  const [c] = await sql<{ id: number }[]>`insert into callers (name, email) values (${name}, ${email}) returning id`;
  return c.id;
}

async function routeQualified(o: {
  verdict: Verdict;
  d: Decision;
  ids: { enquiryId: number; callId: number };
  endedAt: Date;
  callId: number;
  priority: string | null;
  phone: string | null;
  name: string | null;
  email: string | null;
}) {
  const [{ duration_s }] = await sql<{ duration_s: number | null }[]>`select duration_s::float from calls where id = ${o.callId}`;
  const note = buildHandoff({ v: o.verdict, d: o.d, endedAt: o.endedAt, durationS: duration_s, priority: o.priority, callId: o.callId });
  await sql`update enquiries set handoff_note = ${note} where id = ${o.ids.enquiryId}`;

  const [enq] = await sql<{ telegram_message_id: number | null; hubspot_deal_id: string | null }[]>`
    select telegram_message_id, hubspot_deal_id from enquiries where id = ${o.ids.enquiryId}`;

  // Telegram first: speed to a designer is the whole point.
  if (!enq.telegram_message_id) {
    await step("telegram_handoff", o.ids, async () => {
      const msg = await sendMessage(process.env.TELEGRAM_DESIGNERS_CHAT_ID, note, [
        [
          { text: "✋ Claim", callback_data: `claim:${o.ids.enquiryId}` },
          { text: "Pass", callback_data: `pass:${o.ids.enquiryId}` },
        ],
      ]);
      await sql`update enquiries set telegram_message_id = ${msg.message_id}, handoff_sent_at = now() where id = ${o.ids.enquiryId}`;
      await logEvent("telegram_sent", { ...o.ids, detail: { message_id: msg.message_id } });
    });
  }

  if (!enq.hubspot_deal_id) {
    await step("hubspot", o.ids, async () => {
      const contactId = await hubspot.upsertContact({ phone: o.phone, firstName: o.name, email: o.email, locality: o.verdict.fields.locality });
      const amount = Number(await getSetting("avg_project_value_inr", "1100000"));
      const f = o.verdict.fields;
      const dealId = await hubspot.createDeal({
        name: `${o.name ?? "Caller"} · ${f.locality ?? "Pune"} · ${f.property ?? f.project_type}`,
        amount,
        contactId,
        description: toPlain(note),
      });
      await sql`update callers set hubspot_contact_id = ${contactId} where id = (select caller_id from enquiries where id = ${o.ids.enquiryId})`;
      await sql`update enquiries set hubspot_deal_id = ${dealId} where id = ${o.ids.enquiryId}`;
      await logEvent("hubspot_synced", { ...o.ids, detail: { contactId, dealId } });
    });
  }

  if (process.env.STUDIO_EMAIL) {
    await step("email_copy", o.ids, async () => {
      const id = await sendEmail(process.env.STUDIO_EMAIL!, `Qualified lead: ${o.name ?? "caller"} · ${o.verdict.fields.locality ?? ""}`, toPlain(note));
      await logEvent("email_sent", { ...o.ids, detail: { to: "studio", id } });
    });
  }
}
