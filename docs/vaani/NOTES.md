# Vaani — what the docs actually support (read 10 Oct 2026)

Source: docs.vaanivoice.ai/llms-full.txt (saved alongside). Base URL `https://api.vaanivoice.ai`, auth header `X-API-Key`.

## Post-call data
- Webhook registered in dashboard: **Settings → Webhooks**. One URL gets all events.
- Use event `call_postprocessing` (not `call_ended`): carries `data.call_id`, `summary`, `entities`,
  `dispositions`, `recording_url`, `transcript` (`[hh:mm:ss] AGENT:/USER:` lines), `call_duration` in **ms**.
- `call_ended` has `call_duration` in **seconds**. Don't mix them.
- **Cost is not in the webhook.** `GET /api/call-history` rows have `call_cost`, `from_number`,
  `Start_time`, `End_time`, `user_picked_up_at`. Fetch after the webhook and store per call.
- `GET /api/call_details/{call_id}` returns transcript, entity, summary as a fallback.
- **Recording needs the API key** (`GET /api/stream/{call_id}`, audio/ogg or mpeg). A dashboard
  `<audio>` can't hit it directly → copy to Vercel Blob on ingest (or proxy through our API).

## Signatures
- `X-Vaani-Signature: sha256=<hmac>` + `X-Vaani-Timestamp` is documented **under Campaign Webhooks only**.
  Verify if the header is present; otherwise fall back to a secret token in the webhook URL query.
  Confirm on the first real test call.

## In-call capabilities (the "closed bubble")
- No custom mid-call HTTP functions are documented. Only built-ins: `transfer_call` (warm transfer),
  Cal.com booking integration, knowledge base (RAG), FAQ, guardrails.
- So: service-area list, decline lines and pricing deflection all live in the system prompt / KB.
  Repeat-caller match, dropped-call merge and complaint paging run post-call in our backend.

## Agent config (PATCH /api/agent/{id}/{section})
- `persona`: system prompt, voice, language, STT keywords (boost locality names!), LLM temperature.
- `training`: knowledge (RAG), FAQ map, guardrails.
- `experience`: idle timeout, end-call phrase, **max call duration (1–60 min)** → set ~8 min to protect test budget.
- `analysis`: `extraction.data_collection.data_points[]` {name ≤30 chars, prompt, enum list, nullable};
  `evaluations.dispositions`; `collect_concerns`. These arrive in the webhook as `entities` / `dispositions`.

## Integrations
- Cal.com: Settings → Integrations → Cal.com, API key + event type. Books during the call.
- WhatsApp: OAuth to WhatsApp Business (extension note only).
