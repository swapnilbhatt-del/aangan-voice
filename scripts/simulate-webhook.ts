// Posts a realistic call_postprocessing payload to the webhook so the whole pipeline
// (verdict → database → Telegram → HubSpot → email → dashboard) can be tested without spending
// Vaani minutes. Simulated call ids start with "sim-"; `--cleanup` deletes them.
//   npm run simulate -- qualified|declined|complaint [http://localhost:3000]
//   npm run simulate -- --cleanup
import postgres from "postgres";

const SCRIPTS: Record<string, string> = {
  qualified: `AGENT: Namaste, thank you for calling Aangan Studio. I'm Aangan's AI assistant, and this call is recorded so our designers get your details right. How can I help you today?
USER: Hi, I'm Priya. Shruti Joshi gave me your number, she had her flat done by you in Aundh.
AGENT: Thank you, Priya. What are you looking to do?
USER: We have a 3BHK in Kothrud, Dahanukar Colony, about 1400 square feet carpet. It still looks like the builder flat. We want to redo the kitchen, living room and both bedrooms, design and execution.
AGENT: That sounds like a complete redesign. When would you need it complete?
USER: By March. No rush.
AGENT: Will you be making the decision?
USER: Me and my husband. He knows I'm calling and is happy to go ahead.
AGENT: Would you prefer a site visit or a studio consultation, and which days suit you?
USER: Site visit, Saturday morning or Tuesday evening.
AGENT: And the best number to reach you?
USER: 98220 12345.
AGENT: That's 9 8 2 2 0, 1 2 3 4 5. Correct?
USER: Yes.
AGENT: Thank you. I've passed this to our design team with everything you've told me. A designer will call you to fix the consultation. Your designer will confirm the exact slot.`,
  declined: `AGENT: Namaste, thank you for calling Aangan Studio. I'm Aangan's AI assistant, and this call is recorded so our designers get your details right. How can I help you today?
USER: Hi, I'm opening a restaurant in Koregaon Park and I love your work. Can you design the interiors?
AGENT: Thank you for thinking of us. We focus on homes and offices, so restaurant interiors are outside what we do. A studio that specialises in hospitality would serve you better.
USER: Okay, thanks. My name is Rohan, number 9811122233.`,
  complaint: `AGENT: Namaste, thank you for calling Aangan Studio. I'm Aangan's AI assistant, and this call is recorded so our designers get your details right. How can I help you today?
USER: I need someone right now. My project in Viman Nagar has been going three months and my designer Aryan hasn't replied in five days. This is not acceptable.
AGENT: I'm very sorry, I understand that's frustrating. May I have your name?
USER: Sheetal Deshpande. 9890011122.
AGENT: I'm flagging this to Nikhil and our senior team right now. Someone senior will call you back as a priority.`,
};

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--cleanup") {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", prepare: false });
    const ids = await sql<{ id: number; enquiry_id: number | null }[]>`select id, enquiry_id from calls where vaani_call_id like 'sim-%'`;
    const enq = ids.map((r) => r.enquiry_id).filter((x): x is number => x != null);
    await sql`delete from events where call_id = any(${ids.map((r) => r.id)}) or enquiry_id = any(${enq})`;
    await sql`delete from calls where vaani_call_id like 'sim-%'`;
    await sql`delete from enquiries e where e.id = any(${enq}) and not exists (select 1 from calls c where c.enquiry_id = e.id)`;
    await sql`delete from webhook_log where call_id like 'sim-%'`;
    console.log(`Removed ${ids.length} simulated calls.`);
    await sql.end();
    return;
  }
  const kind = args[0] ?? "qualified";
  const base = args[1] ?? process.env.APP_URL ?? "http://localhost:3000";
  const callId = `sim-${kind}-${Date.now()}`;
  const body = {
    event: "call_postprocessing",
    call_id: callId,
    timestamp: new Date().toISOString(),
    data: {
      room_name: callId,
      call_id: callId,
      call_duration: 240000,
      end_reason: "Call ended",
      summary: `Simulated ${kind} call.`,
      entities: {},
      dispositions: {},
      recording_url: "",
      transcript: SCRIPTS[kind],
    },
  };
  const res = await fetch(`${base}/api/vaani/webhook?token=${process.env.VAANI_WEBHOOK_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log(res.status, await res.text(), `→ ${callId}`);
}
main();
