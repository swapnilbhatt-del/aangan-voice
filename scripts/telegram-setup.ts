// 1) Without APP_URL: lists chats the bot has seen, so you can copy the group's chat id.
//    (Add the bot to the group and send any message there first.)
// 2) With APP_URL set: registers the webhook with the secret token.
//   npm run telegram:setup
const T = process.env.TELEGRAM_BOT_TOKEN;
if (!T) throw new Error("TELEGRAM_BOT_TOKEN is not set");
const api = (m: string, body?: unknown) =>
  fetch(`https://api.telegram.org/bot${T}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());

async function main() {
  const me = await api("getMe");
  console.log(`Bot: @${me.result?.username}`);
  if (process.env.APP_URL) {
    const r = await api("setWebhook", {
      url: `${process.env.APP_URL}/api/telegram/webhook`,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["callback_query"],
    });
    console.log("setWebhook:", r.description ?? r);
    return;
  }
  await api("deleteWebhook");
  const u = await api("getUpdates");
  const chats = new Map<number, string>();
  for (const x of u.result ?? []) {
    const c = x.message?.chat ?? x.my_chat_member?.chat;
    if (c) chats.set(c.id, c.title ?? c.first_name ?? c.type);
  }
  if (!chats.size) console.log("No chats yet: add the bot to the designers group, send a message there, and DM the bot from Nikhil's account. Then re-run.");
  for (const [id, title] of chats) console.log(`${id}\t${title}`);
}
main();
