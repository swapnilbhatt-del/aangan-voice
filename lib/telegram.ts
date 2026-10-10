// Telegram Bot API. Designers get the handoff note with Claim / Pass buttons in their group;
// Nikhil gets complaints, SLA breaches and health alerts.
const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

type Button = { text: string; callback_data: string } | { text: string; url: string };

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(api(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

export async function sendMessage(chatId: string | undefined, text: string, buttons?: Button[][]) {
  if (!chatId) throw new Error("Telegram chat id not configured");
  return tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export async function editMessage(chatId: string | number, messageId: number, text: string, buttons?: Button[][]) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: buttons ?? [] },
  });
}

export async function answerCallback(id: string, text: string) {
  return tg("answerCallbackQuery", { callback_query_id: id, text });
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function alertFounder(text: string) {
  return sendMessage(process.env.TELEGRAM_FOUNDER_CHAT_ID, text);
}
