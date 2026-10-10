// Resend: a record copy of each handoff to the studio inbox, and the consultation link
// to the caller once a designer has claimed the lead.
import { Resend } from "resend";

const FROM = process.env.RESEND_FROM || "Aangan Studio <onboarding@resend.dev>";
let client: Resend | null = null;

export async function sendEmail(to: string, subject: string, text: string) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  client ??= new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await client.emails.send({ from: FROM, to, subject, text });
  if (error) throw new Error(`Resend: ${error.message}`);
  return data?.id;
}
