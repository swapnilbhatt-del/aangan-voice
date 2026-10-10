// Runs the post-call verdict on the 20 September phone transcripts (T01–T20) and compares
// against the expected outcome. Costs only model tokens, no Vaani minutes.
//   npm run eval            (all 20)
//   npm run eval T01 T19 T14
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { judgeCall, llmCostInr } from "../lib/ai";
import { decide, type Outcome } from "../lib/decide";
import { findPriceLeaks } from "../lib/rules";

const root = join(__dirname, "..");

// Expected verdicts. T18 follows our rule (commercial under 500 sq ft → forward, designer to confirm),
// not the front desk's call on the day; T08 was a missed call with no transcript.
const EXPECTED: Record<string, { outcome: Outcome | "missed"; note?: string; flag?: string }> = {
  T01: { outcome: "qualified" },
  T02: { outcome: "qualified", note: "pricing push" },
  T03: { outcome: "declined", note: "area (Nashik)" },
  T04: { outcome: "declined", note: "advice only" },
  T05: { outcome: "qualified", note: "VIP referral", flag: "vip_referral" },
  T06: { outcome: "qualified", note: "commercial 800 sq ft" },
  T07: { outcome: "nurture", note: "Diwali in 3 weeks; November start" },
  T08: { outcome: "missed", note: "10:47pm missed call: agent would now answer" },
  T09: { outcome: "complaint", note: "existing client" },
  T10: { outcome: "declined", note: "volunteered budget too low" },
  T11: { outcome: "qualified", note: "rented, no structural" },
  T12: { outcome: "qualified", note: "villa, site visit" },
  T13: { outcome: "qualified", note: "pricing push" },
  T14: { outcome: "qualified", note: "son calling; parents decide and attend" },
  T15: { outcome: "qualified", note: "possession in 6 weeks" },
  T16: { outcome: "qualified", note: "previously dropped", flag: "mentions_previous_unanswered_enquiry" },
  T17: { outcome: "qualified", note: "dropped + call-back (merged by pipeline)" },
  T18: { outcome: "qualified", note: "180 sq ft pod: designer to confirm", flag: "commercial_under_500_designer_to_confirm" },
  T19: { outcome: "declined", note: "restaurant" },
  T20: { outcome: "qualified" },
};

type T = { id: string; header: string; date: Date; transcript: string };

function parse(): T[] {
  const raw = readFileSync(join(root, "source/enquiries.txt"), "utf8").split("SECTION 2")[0];
  // pypdf splits words onto their own lines; rejoin everything that isn't a new speaker/header.
  const lines = raw.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const merged: string[] = [];
  for (const l of lines) {
    if (/^(T\d{2} ·|Front Desk:|Caller:|Note:|First call|Second call|Missed call)/.test(l) || !merged.length) merged.push(l);
    else merged[merged.length - 1] += " " + l;
  }
  const out: T[] = [];
  for (const l of merged) {
    const m = l.match(/^(T\d{2}) · Phone · (\d+) September · ([\d:]+[ap]m)/);
    if (m) {
      const [h, min] = m[3].replace(/[ap]m/, "").split(":").map(Number);
      const hour = (h % 12) + (m[3].endsWith("pm") ? 12 : 0);
      out.push({ id: m[1], header: l, date: new Date(Date.UTC(2026, 8, Number(m[2]), hour - 5, min - 30)), transcript: "" });
    } else if (out.length) {
      out[out.length - 1].transcript += l.replace(/^Front Desk:/, "AGENT:").replace(/^Caller:/, "USER:") + "\n";
    }
  }
  return out;
}

async function main() {
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const all = parse().filter((t) => !only.length || only.includes(t.id));
  const rows: string[] = [];
  let correct = 0, judged = 0, leaks = 0, cost = 0;

  const results = await Promise.all(
    all.map(async (t) => {
      const exp = EXPECTED[t.id];
      if (exp.outcome === "missed") return { t, exp, skipped: true as const };
      // Front-desk "Note:" lines are hindsight, not part of the call; the agent wouldn't have them.
      const transcript = t.transcript.split("\n").filter((l) => !l.startsWith("Note:")).join("\n");
      try {
        const { verdict, usage } = await judgeCall({ transcript, callDate: t.date, vaaniFields: {} });
        return { t, exp, verdict, d: decide(verdict), usage, leaks: findPriceLeaks(transcript) };
      } catch (e) {
        return { t, exp, error: (e as Error).message };
      }
    }),
  );

  for (const r of results) {
    if ("skipped" in r) {
      rows.push(`| ${r.t.id} | missed | — | — | ${r.exp.note} | n/a |`);
      continue;
    }
    if ("error" in r) {
      rows.push(`| ${r.t.id} | ${r.exp.outcome} | ERROR | — | ${r.error?.slice(0, 80)} | ❌ |`);
      judged++;
      continue;
    }
    judged++;
    const ok = r.d!.outcome === r.exp.outcome && (!r.exp.flag || r.d!.flags.includes(r.exp.flag));
    if (ok) correct++;
    leaks += r.leaks!.length ? 1 : 0;
    cost += llmCostInr(r.usage!) ?? 0;
    const why = r.d!.failed.length ? `failed: ${r.d!.failed.join(", ")}` : r.d!.flags.join(", ") || "—";
    rows.push(`| ${r.t.id} | ${r.exp.outcome} | ${r.d!.outcome} | ${why} | ${r.exp.note ?? ""} | ${ok ? "✅" : "❌"} |`);
    if (!ok) console.log(`\n${r.t.id} mismatch:`, JSON.stringify(r.verdict!.criteria, null, 1));
  }

  const md = `# Verdict evaluation: September phone transcripts

Run: ${new Date().toISOString()} · model: ${process.env.GEMINI_MODEL || "gemini-3.8-flash"}

**Accuracy: ${correct}/${judged}** (T08 is a missed call with no transcript; the 24/7 agent is what fixes it.)
Front-desk lines containing a price figure (in the September transcripts): ${leaks}.
Model cost for this run: ${cost ? "₹" + cost.toFixed(2) : "set GEMINI_USD_PER_M_* to compute"}.

| ID | Expected | Verdict | Why | Case | Match |
|---|---|---|---|---|---|
${rows.sort().join("\n")}
`;
  mkdirSync(join(root, "results"), { recursive: true });
  const file = join(root, "results", only.length ? `eval-${only.join("-")}.md` : "eval-all.md");
  writeFileSync(file, md);
  console.log("\n" + md + `\nSaved ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
