// Button taps from the designers' group. Claim → owner + timestamp (+ HubSpot stage, caller email).
// After a claim the designer marks outcomes from the same message, which feeds the funnel.
import { sql, logEvent } from "@/lib/db";
import { answerCallback, editMessage, esc } from "@/lib/telegram";
import * as hubspot from "@/lib/hubspot";
import { sendEmail } from "@/lib/email";

type CallbackQuery = {
  id: string;
  data?: string;
  from: { id: number; first_name?: string; username?: string };
  message?: { message_id: number; chat: { id: number } };
};

export async function POST(req: Request) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const update = (await req.json()) as { callback_query?: CallbackQuery };
  const q = update.callback_query;
  if (!q?.data || !q.message) return Response.json({ ok: true });

  const [action, idStr] = q.data.split(":");
  const enquiryId = Number(idStr);
  const who = q.from.first_name ?? q.from.username ?? `user ${q.from.id}`;
  const [e] = await sql<{ id: number; handoff_note: string | null; claimed_by: string | null; hubspot_deal_id: string | null; caller_id: number | null; outcome: string | null }[]>`
    select id, handoff_note, claimed_by, hubspot_deal_id, caller_id, outcome from enquiries where id = ${enquiryId}`;
  if (!e) {
    await answerCallback(q.id, "Enquiry not found");
    return Response.json({ ok: true });
  }
  const chat = q.message.chat.id;
  const mid = q.message.message_id;
  const note = e.handoff_note ?? "";
  const outcomeButtons = [
    [
      { text: "📅 Consultation booked", callback_data: `outcome_consultation_booked:${enquiryId}` },
      { text: "🖊 Signed", callback_data: `outcome_signed:${enquiryId}` },
      { text: "Lost", callback_data: `outcome_lost:${enquiryId}` },
    ],
  ];
  const stamp = () => new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

  if (action === "claim") {
    // Only the first tap wins.
    const won = await sql`update enquiries set claimed_by = ${who}, claimed_at = now(), updated_at = now() where id = ${enquiryId} and claimed_by is null returning id`;
    if (!won.length) {
      await answerCallback(q.id, `Already claimed by ${e.claimed_by}`);
      return Response.json({ ok: true });
    }
    await logEvent("claimed", { enquiryId, detail: { by: who } });
    await editMessage(chat, mid, `${note}\n\n✋ <b>Claimed by ${esc(who)}</b> at ${stamp()}`, outcomeButtons);
    await answerCallback(q.id, "Claimed. It's yours.");
    if (e.hubspot_deal_id) await hubspot.moveDeal(e.hubspot_deal_id, "claimed").catch((err) => logEvent("error", { enquiryId, detail: { step: "hubspot_claim", message: String(err) } }));
    // Caller gets the booking link, from the studio, naming their designer.
    const [c] = e.caller_id ? await sql<{ email: string | null; name: string | null }[]>`select email, name from callers where id = ${e.caller_id}` : [];
    if (c?.email && process.env.CAL_BOOKING_URL) {
      await sendEmail(
        c.email,
        "Your Aangan Studio consultation",
        `Hi ${c.name ?? ""},\n\nThank you for calling Aangan Studio. ${who} from our design team will take your project forward and will call you shortly.\n\nIf you'd like to pick a consultation time right away, you can book here: ${process.env.CAL_BOOKING_URL}\n\nWarm regards,\nAangan Studio, Pune`,
      )
        .then((id) => logEvent("email_sent", { enquiryId, detail: { to: "caller", id } }))
        .catch((err) => logEvent("error", { enquiryId, detail: { step: "caller_email", message: String(err) } }));
    }
  } else if (action === "pass") {
    await sql`update enquiries set passed_by = array_append(passed_by, ${who}) where id = ${enquiryId}`;
    await logEvent("passed", { enquiryId, detail: { by: who } });
    await answerCallback(q.id, "Passed. Someone else can claim it.");
  } else if (action.startsWith("outcome_")) {
    const outcome = action.slice("outcome_".length) as "consultation_booked" | "signed" | "lost";
    await sql`update enquiries set outcome = ${outcome}, outcome_at = now(), updated_at = now() where id = ${enquiryId}`;
    await logEvent("outcome", { enquiryId, detail: { outcome, by: who } });
    if (e.hubspot_deal_id) await hubspot.moveDeal(e.hubspot_deal_id, outcome).catch((err) => logEvent("error", { enquiryId, detail: { step: "hubspot_outcome", message: String(err) } }));
    const label = { consultation_booked: "📅 Consultation booked", signed: "🖊 Signed", lost: "Lost" }[outcome];
    await editMessage(chat, mid, `${note}\n\n✋ Claimed by ${esc(e.claimed_by ?? who)}\n<b>${label}</b> (${esc(who)}, ${stamp()})`, outcome === "consultation_booked" ? [outcomeButtons[0].slice(1)] : []);
    await answerCallback(q.id, `Marked: ${label}`);
  }
  return Response.json({ ok: true });
}
