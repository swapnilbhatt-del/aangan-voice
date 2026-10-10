import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

// prepare: false is required by Supabase's transaction pooler (port 6543).
export const sql =
  globalThis.__sql ??
  postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 5, prepare: false });

if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;

export async function getSetting(key: string, fallback: string): Promise<string> {
  const rows = await sql<{ value: string }[]>`select value from settings where key = ${key}`;
  return rows[0]?.value ?? fallback;
}

export async function logEvent(kind: string, opts: { enquiryId?: number | null; callId?: number | null; detail?: unknown }) {
  await sql`
    insert into events (enquiry_id, call_id, kind, detail)
    values (${opts.enquiryId ?? null}, ${opts.callId ?? null}, ${kind}, ${sql.json((opts.detail ?? null) as never)})`;
}
