// Creates the schema. Idempotent; runs before every build.
//   npm run db:setup
import { readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 1, prepare: false, onnotice: () => {} });

async function main() {
  await sql.unsafe(readFileSync(join(__dirname, "..", "db/schema.sql"), "utf8"));
  const [{ n }] = await sql`select count(*)::int as n from calls`;
  console.log(`Schema ready. ${n} calls logged so far.`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
