-- Idempotent. Runs before every build (npm run db:setup).
-- PII (name, phone, email) lives only in `callers`. Transcripts and verdicts never hold a phone number.

create table if not exists callers (
  id          bigserial primary key,
  phone       text unique,               -- E.164 (+91...), null when the caller never gave one
  name        text,
  email       text,
  hubspot_contact_id text,
  created_at  timestamptz not null default now()
);

-- One enquiry per person-and-need, whatever the channel. A dropped call that rings back
-- within 30 minutes joins the same enquiry instead of creating a duplicate lead.
create table if not exists enquiries (
  id            bigserial primary key,
  caller_id     bigint references callers(id),
  channel       text not null default 'phone' check (channel in ('phone','whatsapp','web_form')),
  status        text not null default 'new'
                check (status in ('new','qualified','declined','nurture','complaint','non_enquiry','needs_review')),
  priority      text,                    -- 'previously_dropped' | 'vip_referral' | null
  locality      text,
  project_type  text,
  source        text,                    -- referral | instagram | linkedin | google | other | unknown
  follow_up_on  date,                    -- nurture leads: when the front desk calls back
  handoff_note  text,
  telegram_message_id bigint,
  handoff_sent_at timestamptz,
  claimed_by    text,
  claimed_at    timestamptz,
  passed_by     text[] not null default '{}',
  escalated_at  timestamptz,             -- SLA breach alert sent
  outcome       text check (outcome in ('consultation_booked','signed','lost')),
  outcome_at    timestamptz,
  hubspot_deal_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists enquiries_caller_idx on enquiries(caller_id, created_at desc);

-- Every Vaani call gets a row, even if processing fails.
create table if not exists calls (
  id              bigserial primary key,
  vaani_call_id   text unique not null,
  enquiry_id      bigint references enquiries(id),
  started_at      timestamptz,
  ended_at        timestamptz,
  duration_s      numeric,
  after_hours     boolean,
  end_reason      text,
  transcript      text,                  -- phone digits redacted before storage
  summary         text,
  entities        jsonb,
  dispositions    jsonb,
  verdict         jsonb,                 -- five criteria + outcome from the verdict model
  outcome         text,                  -- qualified | declined | nurture | complaint | non_enquiry | needs_review
  failed_criteria text[] not null default '{}',
  flags           text[] not null default '{}',
  price_leak      boolean not null default false,
  vaani_cost_inr  numeric,
  llm_input_tokens  int,
  llm_output_tokens int,
  llm_cost_inr    numeric,
  email_cost_inr  numeric not null default 0,
  processing      text not null default 'received' check (processing in ('received','processed','error')),
  error           text,
  created_at      timestamptz not null default now()
);
create index if not exists calls_created_idx on calls(created_at desc);

-- Raw webhook bodies: the audit trail if anything downstream breaks.
create table if not exists webhook_log (
  id          bigserial primary key,
  source      text not null,
  event       text,
  call_id     text,
  payload     jsonb,
  ok          boolean,
  error       text,
  received_at timestamptz not null default now()
);

create table if not exists events (
  id          bigserial primary key,
  enquiry_id  bigint references enquiries(id),
  call_id     bigint references calls(id),
  kind        text not null,             -- telegram_sent | claimed | passed | outcome | hubspot_synced | email_sent | escalated | complaint_paged | error
  detail      jsonb,
  at          timestamptz not null default now()
);
create index if not exists events_enquiry_idx on events(enquiry_id, at);

create table if not exists settings (
  key   text primary key,
  value text not null
);
insert into settings (key, value) values ('avg_project_value_inr', '1100000') on conflict (key) do nothing;
insert into settings (key, value) values ('claim_sla_minutes', '60') on conflict (key) do nothing;

create table if not exists health_checks (
  id          bigserial primary key,
  service     text not null,
  ok          boolean not null,
  detail      text,
  checked_at  timestamptz not null default now()
);

-- Supabase exposes `public` over its REST API with the anon key. The app connects directly as
-- the database owner (which bypasses RLS), so RLS with no policies closes that public door.
alter table callers       enable row level security;
alter table enquiries     enable row level security;
alter table calls         enable row level security;
alter table webhook_log   enable row level security;
alter table events        enable row level security;
alter table settings      enable row level security;
alter table health_checks enable row level security;
