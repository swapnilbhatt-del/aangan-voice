"""Generates docs/components-map.svg: the Aangan voice desk as a swimlane components map
(Trigger → Input → Context → Processing → AI → Output). Run: python3 scripts/components-map.py"""
from pathlib import Path
from html import escape as esc

COLS = ["TRIGGER", "INPUT", "CONTEXT", "PROCESSING", "AI", "OUTPUT"]
LANES = [
    "CALLER",
    "VAANI\n(Voice agent)",
    "AANGAN BACKEND\n(Next.js · Vercel)",
    "GEMINI\n(LLM)",
    "SUPABASE\n(Database)",
    "TELEGRAM\n(Bot)",
    "HUBSPOT\n(CRM)",
    "DESIGNERS\n& NIKHIL",
]
LX, LW = 20, 150          # lane-label column
X0, CW = LX + LW, 250     # first column x, column width
Y0, LH = 104, 118          # first lane y, lane height
BW, BH = 206, 78          # box size
W = X0 + CW * len(COLS) + 20
H = Y0 + LH * len(LANES) + 150

# id: (col, lane, lines, kind)   kind: "" normal, "ai" AI step, "key" headline output
N = {
    "c_trig": (0, 0, ["Calls the studio number", "(any hour, incl. after 7pm)"], ""),
    "c_in":   (1, 0, ["Says what they need: rooms,", "locality, size, timeline,", "who decides, phone no."], ""),
    "c_out":  (5, 0, ["Hears an honest outcome:", "\"a designer will call you\"", "or a warm, specific decline"], ""),
    "v_trig": (0, 1, ["Answers instantly", "1st line: AI assistant +", "call is recorded"], ""),
    "v_ctx":  (2, 1, ["System prompt: 5 criteria,", "Pune/PCMC localities, exact", "pricing line, decline lines", "(pricing.md never loaded)"], ""),
    "v_proc": (3, 1, ["One question at a time;", "reads back phone number;", "STT keywords + pronunciation", "dictionary for localities"], ""),
    "v_ai":   (4, 1, ["Vaani LLM runs the", "conversation (temp 0.2);", "never quotes a price"], "ai"),
    "v_out":  (5, 1, ["Post-call webhook:", "transcript, summary,", "extracted fields, recording"], ""),
    "b_trig": (0, 2, ["call_postprocessing", "→ /api/vaani/webhook", "(secret token checked)"], ""),
    "b_in":   (1, 2, ["Logs raw payload + call row", "(every call, even on error);", "redacts phone numbers"], ""),
    "b_ctx":  (2, 2, ["qualified.md + services.md", "(Nikhil's rubric, scope),", "locality list"], ""),
    "b_proc": (3, 2, ["Rules in code: locality", "fuzzy match, price-leak scan,", "dropped-call merge (30 min),", "repeat caller, decide()"], ""),
    "b_out":  (5, 2, ["Routes by outcome:", "qualified → Telegram + HubSpot", "complaint → Nikhil", "every call → dashboard"], "key"),
    "g_ai":   (4, 3, ["Verdict as JSON: 5 criteria", "+ scope, fields, flags", "(no phone/email sent)"], "ai"),
    "s_ctx":  (2, 4, ["Earlier enquiries for", "this caller (repeat /", "previously dropped)"], ""),
    "s_proc": (3, 4, ["Stores callers (PII only),", "enquiries, calls, events,", "per-call cost"], ""),
    "t_out":  (5, 5, ["Lead note + Claim / Pass", "to designers' group;", "complaints + SLA → Nikhil"], "key"),
    "h_out":  (5, 6, ["Contact + deal in", "'Aangan Enquiries' pipeline", "(₹11 L default value)"], "key"),
    "d_out":  (5, 7, ["Designer taps Claim / Booked /", "Signed → HubSpot stage moves;", "Nikhil reads the dashboard"], "key"),
}

def box(nid):
    c, l, *_ = N[nid]
    cx = X0 + c * CW + CW / 2
    cy = Y0 + l * LH + LH / 2
    return cx, cy

def edge(a, b, mode="h", off=0):
    ax, ay = box(a)
    bx, by = box(b)
    if mode == "v":       # straight down/up between lanes in one column
        sy = ay + BH / 2 if by > ay else ay - BH / 2
        ey = by - BH / 2 if by > ay else by + BH / 2
        return f"M{ax + off},{sy} L{bx + off},{ey}"
    if mode == "back":    # next row, back to an earlier column: down, left, down
        gy = ay + LH / 2 + 2
        return f"M{ax},{ay + BH / 2} L{ax},{gy} L{bx},{gy} L{bx},{by - BH / 2}"
    if mode == "under":   # skip a box in between: down, along the lane bottom, up
        gy = ay + LH / 2 - 8
        return f"M{ax},{ay + BH / 2} L{ax},{gy} L{bx - 40},{gy} L{bx - 40},{by + BH / 2}"
    if mode == "side":    # down the right-hand gutter into the target's right edge
        gx = ax + BW / 2 + 16 + off
        return f"M{ax + BW / 2},{ay + off / 2} L{gx},{ay + off / 2} L{gx},{by} L{bx + BW / 2},{by}"
    if mode == "lside":   # down the left-hand gutter into the target's left edge
        gx = ax - BW / 2 - 16
        return f"M{ax - BW / 2},{ay} L{gx},{ay} L{gx},{by} L{bx - BW / 2},{by}"
    # elbow: right edge → mid gutter → left edge
    sx, ex = ax + BW / 2, bx - BW / 2
    mx = ex - 18 if abs(ay - by) > 1 else (sx + ex) / 2
    return f"M{sx},{ay} L{mx},{ay} L{mx},{by} L{ex},{by}"

E = [
    ("c_trig", "v_trig", "v", 0),
    ("c_in", "v_proc", "h", 0),
    ("v_trig", "c_in", "h", 0),
    ("v_ctx", "v_proc", "h", 0),
    ("v_proc", "v_ai", "h", 0),
    ("v_ai", "c_out", "h", 0),
    ("v_ai", "v_out", "h", 0),
    ("v_out", "b_trig", "back", 0),
    ("b_trig", "b_in", "h", 0),
    ("b_in", "b_proc", "under", 0),
    ("b_ctx", "b_proc", "h", 0),
    ("s_ctx", "b_ctx", "v", 0),
    ("b_proc", "g_ai", "h", 0),
    ("g_ai", "b_out", "h", 0),
    ("b_proc", "s_proc", "v", 0),
    ("b_out", "t_out", "v", 0),
    ("b_out", "h_out", "side", 0),
    ("t_out", "d_out", "lside", 0),
    ("d_out", "h_out", "v", 30),
]

INK, MUTED, LINE, ACC, AIC = "#1c1a17", "#6b655c", "#cfc8bb", "#9a4a1c", "#2a78d6"
out = []
a = out.append
a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Inter, Helvetica, Arial, sans-serif">')
a(f'''<defs>
  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{MUTED}"/></marker>
</defs>
<rect width="{W}" height="{H}" fill="#ffffff"/>''')
a(f'<text x="{LX}" y="34" font-size="22" font-weight="700" fill="{INK}">Aangan Studio — Voice Call Desk · Components Map</text>')
a(f'<text x="{LX}" y="56" font-size="13" fill="{MUTED}">Inbound phone calls · Vaani answers 24/7 · verdict by Nikhil\'s five criteria · handoff to designers on Telegram, pipeline in HubSpot, every call on the dashboard</text>')

gy0, gy1 = Y0, Y0 + LH * len(LANES)
# "during the call" band (closed bubble)
a(f'<rect x="{X0}" y="{Y0}" width="{CW * len(COLS)}" height="{LH * 2}" fill="#fbf3ec"/>')
a(f'<text x="{X0 + CW * len(COLS) - 10}" y="{Y0 + 16}" font-size="10.5" font-weight="700" fill="{ACC}" text-anchor="end" letter-spacing="1">DURING THE CALL — CLOSED BUBBLE (only what is inside Vaani)</text>')
a(f'<text x="{X0 + CW + 10}" y="{Y0 + LH * 2 + 16}" font-size="10.5" font-weight="700" fill="{MUTED}" letter-spacing="1">AFTER THE CALL — POST-PROCESSING</text>')
# column headers + grid
for i, c in enumerate(COLS):
    x = X0 + i * CW
    a(f'<text x="{x + CW / 2}" y="{Y0 - 10}" font-size="12" font-weight="700" fill="{AIC if c == "AI" else INK}" text-anchor="middle" letter-spacing="1.5">{c}</text>')
    a(f'<line x1="{x}" y1="{gy0}" x2="{x}" y2="{gy1}" stroke="{LINE}" stroke-dasharray="3 4"/>')
a(f'<line x1="{X0 + CW * len(COLS)}" y1="{gy0}" x2="{X0 + CW * len(COLS)}" y2="{gy1}" stroke="{LINE}"/>')
a(f'<rect x="{X0 + 4 * CW}" y="{gy0}" width="{CW}" height="{gy1 - gy0}" fill="{AIC}" fill-opacity="0.04"/>')
for j, l in enumerate(LANES):
    y = Y0 + j * LH
    a(f'<line x1="{LX}" y1="{y}" x2="{X0 + CW * len(COLS)}" y2="{y}" stroke="{LINE}"/>')
    lines = l.split("\n")
    for k, t in enumerate(lines):
        a(f'<text x="{LX + LW / 2}" y="{y + LH / 2 - (len(lines) - 1) * 8 + k * 16 + 4}" font-size="{12 if k == 0 else 11}" font-weight="{700 if k == 0 else 400}" fill="{INK if k == 0 else MUTED}" text-anchor="middle">{esc(t)}</text>')
a(f'<line x1="{LX}" y1="{gy1}" x2="{X0 + CW * len(COLS)}" y2="{gy1}" stroke="{LINE}"/>')
a(f'<line x1="{LX}" y1="{gy0}" x2="{LX}" y2="{gy1}" stroke="{LINE}"/>')
a(f'<line x1="{X0}" y1="{gy0}" x2="{X0}" y2="{gy1}" stroke="{LINE}"/>')

for s, t, mode, off in E:
    a(f'<path d="{edge(s, t, mode, off)}" fill="none" stroke="{MUTED}" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#arr)"/>')

for nid, (c, l, lines, kind) in N.items():
    cx, cy = box(nid)
    stroke = AIC if kind == "ai" else ACC if kind == "key" else "#8f877b"
    fill = "#eef4fc" if kind == "ai" else "#fdf6f0" if kind == "key" else "#ffffff"
    a(f'<rect x="{cx - BW / 2}" y="{cy - BH / 2}" width="{BW}" height="{BH}" rx="7" fill="{fill}" stroke="{stroke}" stroke-width="1.3"/>')
    top = cy - (len(lines) - 1) * 7.5
    for k, t in enumerate(lines):
        a(f'<text x="{cx}" y="{top + k * 15 + 4}" font-size="11.5" fill="{INK}" text-anchor="middle">{esc(t)}</text>')

# legend / notes
ly = gy1 + 30
notes = [
    "Booking: Vaani's Cal.com integration is OFF — the call only collects preferred slots; the designer who claims the lead confirms the time.",
    "Guardrails: no price is ever spoken (agent turns are scanned after every call); phone numbers never reach the LLM; PII lives only in the callers table.",
    "Reliability: a health check (DB, Telegram, HubSpot, Vaani) + SLA escalation runs on a cron and alerts Nikhil on Telegram; every webhook body is logged.",
]
for k, t in enumerate(notes):
    a(f'<text x="{LX}" y="{ly + k * 20}" font-size="12" fill="{MUTED}">• {esc(t)}</text>')
lx = LX
for label, fill, stroke in [("Step", "#ffffff", "#8f877b"), ("AI step", "#eef4fc", AIC), ("What people see / receive", "#fdf6f0", ACC)]:
    a(f'<rect x="{W - 520 + (lx - LX)}" y="{ly + 68}" width="18" height="12" rx="3" fill="{fill}" stroke="{stroke}"/>')
    a(f'<text x="{W - 520 + (lx - LX) + 24}" y="{ly + 78}" font-size="12" fill="{INK}">{label}</text>')
    lx += 150
a("</svg>")

p = Path(__file__).resolve().parent.parent / "docs" / "components-map.svg"
p.write_text("\n".join(out))
print(f"wrote {p} ({W}x{H})")
