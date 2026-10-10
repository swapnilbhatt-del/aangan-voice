# Verdict evaluation: September phone transcripts

Run: 2026-10-10T11:15:05.389Z · model: gemini-3.8-flash

**Accuracy: 3/3** (T08 is a missed call with no transcript; the 24/7 agent is what fixes it.)
Front-desk lines containing a price figure (in the September transcripts): 0.
Model cost for this run: set GEMINI_USD_PER_M_* to compute.

| ID | Expected | Verdict | Why | Case | Match |
|---|---|---|---|---|---|
| T01 | qualified | qualified | vip_referral |  | ✅ |
| T14 | qualified | qualified | — | son calling; parents decide and attend | ✅ |
| T19 | declined | declined | failed: Scope | restaurant | ✅ |
