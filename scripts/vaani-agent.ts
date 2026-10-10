// Creates the Aangan agent in Vaani (first run) and pushes its config from this repo, so the
// agent's prompt and extraction fields are versioned in git rather than living only in a dashboard.
//   npm run agent:sync
// Voice and language are picked in the Vaani dashboard (Agents → Aangan → Persona).
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = process.env.VAANI_API_BASE || "https://api.vaanivoice.ai";
const KEY = process.env.VAANI_API_KEY;
if (!KEY) throw new Error("VAANI_API_KEY is not set in .env");
const root = join(__dirname, "..");
const systemPrompt = readFileSync(join(root, "prompts/agent-system-prompt.md"), "utf8");

const GREETING =
  "Namaste, thank you for calling Aangan Studio. I'm Aangan's AI assistant, and this call is recorded so our designers get your details right. How can I help you today?";

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "X-API-Key": KEY!, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

// What Vaani extracts after each call; arrives in the webhook as `entities` (name ≤ 30 chars).
const DATA_POINTS = [
  { name: "caller_name", prompt: "The caller's first name (and surname if given).", nullable: true },
  { name: "phone_number", prompt: "The phone number the caller confirmed for callbacks, digits only.", nullable: true },
  { name: "email", prompt: "The caller's email address if they gave one, normalised (e.g. 'priya dot s at gmail dot com' → priya.s@gmail.com).", nullable: true },
  { name: "locality", prompt: "Area/locality of the site, e.g. 'Kothrud (Dahanukar Colony)'.", nullable: true },
  { name: "property", prompt: "Property type and size, e.g. '3BHK flat, 1400 sq ft carpet' or 'office bare shell 800 sq ft'.", nullable: true },
  { name: "scope", prompt: "Which rooms/areas and what work they want (design + execution, advice only, etc.).", nullable: true },
  { name: "timeline", prompt: "When they need it complete / when the site is available, in the caller's words.", nullable: true },
  { name: "budget_volunteered", prompt: "Any budget amount the caller volunteered, else null. Never inferred.", nullable: true },
  { name: "decision_maker", prompt: "Who decides and whether they're on board / will attend the consultation.", nullable: true },
  { name: "lead_source", prompt: "How they heard of Aangan.", enum: ["referral", "instagram", "linkedin", "google", "repeat_client", "other", "unknown"], nullable: false },
  { name: "referred_by", prompt: "Name of the person who referred them, if any.", nullable: true },
  { name: "preferred_slots", prompt: "Days/times the caller said suit them for a consultation, and site visit vs studio.", nullable: true },
  { name: "call_intent", prompt: "Main reason for the call.", enum: ["new_project", "existing_client_complaint", "callback_request", "other"], nullable: false },
];

async function main() {
  let agentId = process.env.VAANI_AGENT_ID;
  if (!agentId) {
    const r = await call("POST", "/api/create-agent", {
      agent_display_name: "Aangan Studio – Inbound",
      config: { persona: { identity: { system_prompt: systemPrompt } } },
    });
    agentId = r.agent_id as string;
    const envPath = join(root, ".env");
    writeFileSync(envPath, readFileSync(envPath, "utf8").replace(/^VAANI_AGENT_ID=.*$/m, `VAANI_AGENT_ID=${agentId}`));
    console.log(`Created agent ${agentId} (saved to .env)`);
  }

  const steps: [string, unknown][] = [
    ["persona", { identity: { system_prompt: systemPrompt, greeting_message: { agent_message: GREETING, agent_speech_delay: 0, interruptible: true } } }],
    [
      "training",
      {
        know_how: {
          faq: {
            "How much will it cost?": "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.",
            "Do you work outside Pune?": "We work only in Pune city and PCMC, because our own contractors carry out the execution.",
            "Is the consultation free?": "Your designer will confirm everything about the consultation when they call you.",
            "How long does a project take?": "Design usually takes three to four weeks from the first consultation, and execution eight to sixteen weeks depending on size and site readiness.",
            "Do you do rented flats?": "Yes, as long as there are no structural changes and your landlord is fine with the work.",
          },
          guardrails: { level: "medium" },
        },
      },
    ],
    [
      "experience",
      {
        settings: {
          call_settings: { max_call_duration: 8, max_duration_enabled: true },
        },
      },
    ],
    [
      "analysis",
      {
        evaluations: {
          dispositions: {
            enabled: true,
            prompt_based: [
              {
                name: "lead_fit",
                type: "string",
                prompt: "Using Aangan's five criteria (real design+execution project, Pune/PCMC, not needed in under 6 weeks, no clearly-too-low volunteered budget, decision-maker), what is this call?",
                list_of_tags: {
                  qualified: "passes all five",
                  declined: "fails at least one",
                  nurture: "only timing fails and caller open to later",
                  complaint: "existing client complaint",
                  other: "not an enquiry",
                },
              },
            ],
          },
        },
        extraction: { data_collection: { enabled: true, data_points: DATA_POINTS }, collect_concerns: { enabled: true } },
      },
    ],
  ];
  for (const [section, body] of steps) {
    try {
      await call("PATCH", `/api/agent/${agentId}/${section}`, body);
      console.log(`✓ ${section}`);
    } catch (e) {
      console.error(`✗ ${section}: ${(e as Error).message}`);
    }
  }
  console.log(`\nAgent ${agentId} synced. In the Vaani dashboard: pick an Indian multilingual voice, set LLM temperature ≈ 0.2, add Pune locality names as STT keywords, and register the webhook URL.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
