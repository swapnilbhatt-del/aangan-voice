// Deterministic rules that must not depend on a model: service area, phone handling,
// office hours and the zero-price guardrail.

// services.md names these explicitly.
const LISTED = [
  "Kothrud", "Baner", "Aundh", "Wakad", "Koregaon Park", "Kalyani Nagar", "Viman Nagar", "Hadapsar",
  "Magarpatta", "NIBM", "Kondhwa", "Undri", "Shivane", "Warje", "Erandwane", "Deccan",
  "Pimpri", "Chinchwad", "Pimple Saudagar", "Pimple Nilakh", "Ravet", "Hinjewadi",
];
// services.md says "and adjoining areas" without naming them. These are inside Pune city / PCMC
// limits; T08 (Nanded City) and T10 (Kharadi) come from this list. Listed in the README as an
// open question for Nikhil.
const ADJOINING = [
  "Nanded City", "Kharadi", "Bavdhan", "Pashan", "Balewadi", "Sus", "Wagholi", "Dhanori", "Yerawada",
  "Camp", "Sinhagad Road", "Bibwewadi", "Katraj", "Dhayari", "Sahakar Nagar", "Shivaji Nagar", "Model Colony",
  "Prabhat Road", "Boat Club Road", "Sadashiv Peth", "Kasba Peth", "Swargate", "Mundhwa", "Keshav Nagar",
  "Wanowrie", "Fatima Nagar", "Lohegaon", "Vishrantwadi", "Kalyani Nagar", "Bopodi", "Khadki", "Ambegaon",
  "Moshi", "Akurdi", "Nigdi", "Tathawade", "Punawale", "Bhosari", "Pradhikaran", "Thergaon", "Rahatani",
  "Kasarwadi", "Dapodi", "Sangvi", "Pimple Gurav", "Chikhali", "Dighi", "Charholi", "Marunji", "Mahalunge",
  "Pune", "PCMC", "Pimpri Chinchwad", "Dahanukar Colony", "Cybercity", "Amanora", "Kalyani Nagar",
];
const OUT = [
  "Talegaon", "Lonavala", "Nashik", "Mumbai", "Thane", "Navi Mumbai", "Satara", "Kolhapur", "Aurangabad",
  "Nagpur", "Bangalore", "Bengaluru", "Hyderabad", "Goa", "Lavasa", "Chakan", "Shirur", "Baramati",
  "Alibaug", "Panvel", "Khandala", "Kamshet", "Saswad", "Bhor", "Delhi", "Gurgaon", "Noida",
];
// Common speech-to-text and spelling variants.
const ALIASES: Record<string, string> = {
  vakad: "Wakad", wakkad: "Wakad", banner: "Baner", banair: "Baner", aundh: "Aundh", oundh: "Aundh",
  kotrud: "Kothrud", kothroad: "Kothrud", "kp": "Koregaon Park", "koregaon": "Koregaon Park",
  "viman": "Viman Nagar", "vimannagar": "Viman Nagar", "kalyaninagar": "Kalyani Nagar",
  "magarpatta city": "Magarpatta", "hinjawadi": "Hinjewadi", "hinjewadi phase": "Hinjewadi",
  "pimple saudagar": "Pimple Saudagar", "pimplesaudagar": "Pimple Saudagar", "pcmc": "PCMC",
  "pimpri-chinchwad": "Pimpri Chinchwad", "pimpri chinchwad": "Pimpri Chinchwad", "nandedcity": "Nanded City",
  "kharadi": "Kharadi", "khardi": "Kharadi", "nibm road": "NIBM", "talegaon dabhade": "Talegaon",
  "bombay": "Mumbai", "nasik": "Nashik", "lonawala": "Lonavala",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export type AreaCheck = { status: "in" | "out" | "unclear"; matched: string | null };

// "in" / "out" only on a confident match; anything else is "unclear" so the model's
// reading of the transcript (or a designer) decides.
export function checkServiceArea(raw: string | null | undefined): AreaCheck {
  if (!raw) return { status: "unclear", matched: null };
  const text = norm(raw);
  const squashed = text.replace(/ /g, "");
  for (const [alias, canon] of Object.entries(ALIASES)) {
    const a = norm(alias);
    if (` ${text} `.includes(` ${a} `) || (a.length >= 6 && squashed.includes(a.replace(/ /g, "")))) {
      return { status: OUT.includes(canon) ? "out" : "in", matched: canon };
    }
  }
  // Whole words only: "Koregoan" must not match "Goa". Out-of-area first, so
  // "Talegaon near Pune" reads as Talegaon.
  const has = (place: string) => ` ${text} `.includes(` ${norm(place)} `);
  for (const place of OUT) if (has(place)) return { status: "out", matched: place };
  for (const place of [...LISTED, ...ADJOINING]) if (has(place)) return { status: "in", matched: place };
  // Fuzzy: each word (and word pair) against each place, tolerating 1–2 typos on longer names.
  const words = text.split(" ");
  const grams = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
  let best: { place: string; dist: number; out: boolean } | null = null;
  for (const g of grams) {
    if (g.length < 4) continue;
    for (const [list, out] of [[OUT, true], [[...LISTED, ...ADJOINING], false]] as const) {
      for (const place of list) {
        const p = norm(place);
        const dist = lev(g, p);
        const allowed = p.length >= 8 ? 2 : p.length >= 5 ? 1 : 0;
        if (dist <= allowed && (!best || dist < best.dist)) best = { place, dist, out };
      }
    }
  }
  if (best) return { status: best.out ? "out" : "in", matched: best.place };
  return { status: "unclear", matched: null };
}

// Indian numbers as spoken or typed: "98220 12345", "+91-98220-12345", "098220...".
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

// Strip phone-like digit runs so transcripts and the verdict model never hold a number.
export function redactPhones(text: string): string {
  return text.replace(/(\+?\d[\d\s-]{8,}\d)/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[PHONE]" : m));
}

export function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  return phone.slice(0, 3) + " ••••• " + phone.slice(-3);
}

// Front desk hours are 10am–7pm IST.
export function isAfterHours(d: Date): boolean {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(d));
  return h < 10 || h >= 19;
}

// Guardrail from pricing.md: the agent must never say a number tied to price.
// Scans only AGENT turns; a caller volunteering a budget (T10) is fine.
const PRICE_PATTERNS = [
  /₹\s?\d/i, /\brs\.?\s?\d/i, /\brupees?\b/i, /\d[\d,.]*\s?(lakh|lac|lakhs|crore|k)\b/i,
  /per\s+(sq|square)\s*(ft|feet|foot)/i, /\bstarts?\s+(at|from)\s+\d/i, /costs?\s+(around|about|roughly)\b/i,
  /\b(lakh|लाख|हजार|रुपये|रुपए)\b/i,
];
export function findPriceLeaks(transcript: string): string[] {
  const hits: string[] = [];
  for (const line of transcript.split("\n")) {
    if (!/AGENT\s*:/i.test(line)) continue;
    const said = line.replace(/^.*?AGENT\s*:/i, "");
    if (PRICE_PATTERNS.some((p) => p.test(said))) hits.push(said.trim().slice(0, 200));
  }
  return hits;
}
