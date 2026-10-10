# Aangan Studio · Voice Call Desk

Every call to Aangan Studio gets answered, day or night, by a Vaani voice agent. After the call,
this app decides whether the enquiry is worth a designer's time (Nikhil's five criteria), sends
qualified leads to the designers' Telegram group with everything already asked, creates the
contact and deal in HubSpot, and logs every call (qualified or not) on a dashboard with its
recording, transcript, verdict and cost.

**Scope:** inbound phone calls only. WhatsApp and the web form are out of scope; the data model is
channel-agnostic (`enquiries.channel`) so they plug into the same pipeline (see *Extension* below).

## Components map

| | Trigger | Input | Context | Processing | AI | Output |
|---|---|---|---|---|---|---|
| **During the call (Vaani, closed bubble)** | Caller rings the studio number (after hours, or front desk busy / no answer in ~20 s) | Caller's voice (English / Hindi / Marathi) | System prompt: opening + disclosure, question order, five criteria, locality list, decline lines, exact pricing line, angry-caller rules. FAQ. *(pricing.md is never given to Vaani)* | Vaani asks one question at a time, reads back phone number, handles corrections | Vaani's LLM runs the conversation | Caller hears an honest outcome; Vaani extracts fields + transcript + recording |
| **After the call (our backend)** | Vaani `call_postprocessing` webhook → `/api/vaani/webhook` | Transcript (phone numbers redacted), extracted fields, Vaani call cost (call-history API) | `qualified.md` + `services.md`, locality list, caller's earlier enquiries in the database | Locality check (fuzzy, spelling-tolerant), price-leak scan, dropped-call merge (≤30 min), repeat-caller check, boundary logic in code | Gemini Flash verdict: 5 criteria + scope, structured JSON | Supabase Postgres rows (calls, enquiries, PII separate) |
| **People** | Verdict = qualified / complaint / SLA breach | Handoff note (only fields a designer needs) | Telegram designers' group, Nikhil's chat | Claim / Pass buttons → owner + timestamp; outcome buttons → funnel | none | Telegram note + Claim; HubSpot contact + deal (pipeline stage moves on claim/outcome); Resend email copy; caller gets Cal.com link on claim; dashboard |

Booking happens **after** the call (a designer confirms the slot), so Vaani's Cal.com booking
integration stays **off**. Cal.com is used post-claim: the caller is emailed the booking link.

## API call flow (one call)

1. Caller dials → Vaani answers. *(no API call from us; the call is a closed bubble)*
2. Vaani converses using only what's in its dashboard config. *(no API call)*
3. Call ends → Vaani `POST /api/vaani/webhook?token=…` (`call_ended`, then `call_postprocessing`).
4. We write `webhook_log` + a `calls` row immediately, reply 200, continue in the background. *(DB only)*
5. `GET api.vaanivoice.ai/api/call-history` → `call_cost`, start/end times, caller number.
6. Locality check, phone redaction, price-leak scan. *(no API call; code)*
7. `generateContent` (Gemini) → verdict JSON. The model never sees phone or email.
8. Boundary logic → outcome; upsert caller (PII table), merge/repeat checks, enquiry row. *(DB only)*
9. Qualified → Telegram `sendMessage` (designers, Claim/Pass) → HubSpot contact search/create + deal create → Resend email copy.
10. Complaint / previously-dropped → Telegram `sendMessage` to Nikhil.
11. Designer taps Claim → Telegram `POST /api/telegram/webhook` → `editMessageText`, HubSpot stage → "Claimed", Resend booking link to caller.
12. Designer taps Consultation booked / Signed / Lost → HubSpot stage moves; dashboard funnel updates.
13. `/api/cron/tick` (Vercel cron + 5-min external pinger): health of the database/Telegram/HubSpot/Vaani (the daily DB query also keeps the free Supabase project from pausing), SLA escalation → Telegram to Nikhil.
14. Dashboard reads the database *(no external API)*; recordings stream through `/api/recording/:id` (Vaani needs the API key).

## Data model (Supabase Postgres, RLS on, app connects server-side only)

- `callers`: **PII only** (phone, name, email, HubSpot contact id).
- `enquiries`: one per person-and-need; `channel`, status, priority, locality, source, handoff note, Telegram message, claim, outcome, HubSpot deal.
- `calls`: one per Vaani call, always (even on failure): redacted transcript, verdict JSON, outcome, failed criteria, flags, price-leak, Vaani cost, model tokens and cost.
- `events`: audit trail (telegram_sent, claimed, outcome, hubspot_synced, email_sent, escalated, error).
- `webhook_log`: every raw webhook body. `settings`: average project value (₹11 L), claim SLA. `health_checks`.

## Qualification rules (in code: `lib/decide.ts`)

Pass/fail on Nikhil's five criteria (`source/qualified.md`) plus scope from `source/services.md`.
Unclear on 1–3 after the call → *needs review*. Unclear on budget / decision-maker → forwarded with a note.
Never disqualify for: not knowing what they want, calling after hours, asking for pricing, style
uncertainty, one room with execution, rented with no structural changes.

**The cut:** the agent never quotes per-sq-ft pricing, even though Nikhil asked for it. His own
`pricing.md` forbids quoting any figure; ranges span 2×, and a spoken number anchors a ₹8–14 lakh
project. Every agent turn is scanned for price figures; the dashboard shows the count (target 0).

## Open questions for Nikhil (not silently decided)

1. **Commercial minimum size.** The front desk turned down a 180 sq ft pod (T18) as "below our 500 sq ft minimum", but `services.md` sets no minimum. Until confirmed: under 500 sq ft is forwarded, flagged "designer to confirm".
2. **Timeline floor.** `qualified.md` says 8–10 weeks from consultation; `services.md` says nothing that needs completion in under 6 weeks. We use 6 weeks as the hard fail and flag 6–10 weeks.
3. **"Adjoining areas".** `services.md` doesn't list them. We treat Nanded City (T08), Kharadi (T10), Bavdhan, Wagholi, Moshi, etc. as in-area (full list in `lib/rules.ts`). Please confirm the edges (Wagholi? Chakan? Talegaon is out).
4. **Claim SLA.** Set to 60 minutes (the 4× conversion window). Editable in `settings`.
5. **Who gets complaint pages after hours?** Currently Nikhil's Telegram.

## Setup

```bash
npm install
cp .env.example .env        # fill in keys (see comments in the file)
npm run db:setup            # creates tables (idempotent; also runs on every build)
npm run hubspot:setup       # creates the "Aangan Enquiries" deal pipeline
npm run agent:sync          # creates/updates the Vaani agent from prompts/agent-system-prompt.md
npm run eval                # verdict on the 20 September transcripts → results/eval-all.md
npm run dev
```

Deploy to Vercel (region `bom1`), add every `.env` key to the project's environment variables, then:

- **Vaani → Settings → Webhooks:** `https://<app>.vercel.app/api/vaani/webhook?token=<VAANI_WEBHOOK_TOKEN>`
- `APP_URL=https://<app>.vercel.app npm run telegram:setup` (registers the bot webhook with its secret)
- **Vaani agent:** pick an Indian multilingual voice, LLM temperature ~0.2, add locality names as STT keywords. Leave Cal.com booking **off**.
- **5-minute pinger** (Vercel Hobby crons run daily): cron-job.org → `GET https://<app>.vercel.app/api/cron/tick?secret=<CRON_SECRET>` every 5 min.
- Test the whole pipeline without spending Vaani minutes: `npm run simulate -- qualified` (then `npm run simulate -- --cleanup`).

## Security and privacy

- Keys live in `.env` (git-ignored) and Vercel env vars.
- Vaani webhook: secret token in the URL, plus HMAC (`X-Vaani-Signature`) verified when a signing secret is configured.
- Telegram webhook: `X-Telegram-Bot-Api-Secret-Token` checked on every update.
- Phone numbers are redacted from stored transcripts and never sent to the verdict model; PII lives only in `callers`. The dashboard masks numbers.
- Telegram notes carry only what a designer needs; the transcript stays on the dashboard.

## Extension: WhatsApp and web form

Same `enquiries` table (`channel = 'whatsapp' | 'web_form'`), same verdict and handoff pipeline:
a WhatsApp Business webhook (or Vaani's WhatsApp integration) and a form POST each become a
"transcript" for `processCall`. Why it's worth doing: W01/W05 show after-hours WhatsApp messages
sitting unanswered until the next working day (W05 waited from Saturday evening to Monday), and
F04/F07 are cost-only form submissions with almost nothing to qualify on. An instant reply with the
pricing deflection and the same qualifying questions closes both gaps.
