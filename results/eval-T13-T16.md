# Verdict evaluation: September phone transcripts

Run: 2026-10-10T11:15:38.993Z · model: gemini-3.8-flash

**Accuracy: 0/2** (T08 is a missed call with no transcript; the 24/7 agent is what fixes it.)
Front-desk lines containing a price figure (in the September transcripts): 0.
Model cost for this run: set GEMINI_USD_PER_M_* to compute.

| ID | Expected | Verdict | Why | Case | Match |
|---|---|---|---|---|---|
| T13 | qualified | needs_review | low_confidence | pricing push | ❌ |
| T16 | qualified | needs_review | caller_frustrated, mentions_previous_unanswered_enquiry, low_confidence | previously dropped | ❌ |
