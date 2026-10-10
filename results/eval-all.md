# Verdict evaluation: September phone transcripts

Run: 2026-10-10T11:16:03.984Z · model: gemini-3.8-flash

**Accuracy: 18/19** (T08 is a missed call with no transcript; the 24/7 agent is what fixes it.)
Front-desk lines containing a price figure (in the September transcripts): 1.
Model cost for this run: set GEMINI_USD_PER_M_* to compute.

| ID | Expected | Verdict | Why | Case | Match |
|---|---|---|---|---|---|
| T01 | qualified | qualified | vip_referral |  | ✅ |
| T02 | qualified | qualified | — | pricing push | ✅ |
| T03 | declined | declined | failed: Area | area (Nashik) | ✅ |
| T04 | declined | declined | failed: Real project, Scope | advice only | ✅ |
| T05 | qualified | qualified | vip_referral | VIP referral | ✅ |
| T06 | qualified | qualified | — | commercial 800 sq ft | ✅ |
| T07 | nurture | nurture | failed: timeline | Diwali in 3 weeks; November start | ✅ |
| T08 | missed | — | — | 10:47pm missed call: agent would now answer | n/a |
| T09 | complaint | complaint | caller_frustrated, asked_for_human | existing client | ✅ |
| T10 | declined | declined | failed: Budget | volunteered budget too low | ✅ |
| T11 | qualified | qualified | rented_no_structural | rented, no structural | ✅ |
| T12 | qualified | qualified | — | villa, site visit | ✅ |
| T13 | qualified | qualified | timeline_not_asked | pricing push | ✅ |
| T14 | qualified | qualified | — | son calling; parents decide and attend | ✅ |
| T15 | qualified | qualified | — | possession in 6 weeks | ✅ |
| T16 | qualified | qualified | caller_frustrated, mentions_previous_unanswered_enquiry, decision_maker_uncertain, timeline_not_asked, real_project_unconfirmed | previously dropped | ✅ |
| T17 | qualified | qualified | — | dropped + call-back (merged by pipeline) | ✅ |
| T18 | qualified | needs_review | commercial_under_500_designer_to_confirm, timeline_not_asked, low_confidence | 180 sq ft pod: designer to confirm | ❌ |
| T19 | declined | declined | failed: Scope | restaurant | ✅ |
| T20 | qualified | qualified | — |  | ✅ |
