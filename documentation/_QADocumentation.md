# \_QADocumentation — how we run a pass here

This project's instance of [`_QALaw`](../laws/_QALaw.md). The law says what an instrument, an itinerary
and a record must be; this says which ones we have, how to run them, and what they have caught.

**Adopted 2026-08-26**, written during the first cover-to-cover pass rather than before it — which is
the order the law's §8 asks for, and the reason the rails read as specific as they do.

---

## 1 · Our instrument — `src/domains/qa/`

A probe that runs in the tester's browser and posts what it sees to an endpoint only a token opens.

| Piece | Where |
|---|---|
| The probe | [`src/domains/qa/ui/QaProbe.tsx`](../src/domains/qa/ui/QaProbe.tsx) |
| Ingest + read | [`src/app/api/qa/events/route.ts`](../src/app/api/qa/events/route.ts) |
| Arm / disarm | [`src/app/api/qa/session/route.ts`](../src/app/api/qa/session/route.ts) |
| The log | `qa_event` — one table, dropped when the pass is over |
| Reading it | `npm run qa:tail` |

**What it captures** — clicks by accessible name, navigation including hash movement, form fields by
name, submissions, window errors, unhandled rejections, `console.error`, failed requests by status and
path, and **rendered `role="alert"` messages**, which is how this app reports refusal (Q3).

**Running a pass:**

```bash
# Arm a browser — paste in the address bar, once per tester
https://<site>/api/qa/session?token=$QA_TOKEN

npm run qa:tail              # follow live, in your own timezone
npm run qa:tail -- --once    # print and stop
npm run qa:tail -- --clear   # wipe before a phase

https://<site>/api/qa/session?token=$QA_TOKEN&off=1   # disarm
```

**Tearing it down** — five steps, in [`src/domains/qa/_QaDocumentation.md`](../src/domains/qa/_QaDocumentation.md) §4.
`drizzle/0020_drop_qa_event.sql.pending` is written and waiting. Unsetting `QA_TOKEN` disables
everything on its own (Q6).

### Where we knowingly depart from the law

- **The probe ships to every visitor, inert.** Gating it server-side meant reading a cookie in the root
  layout, which opts **every route in the app** out of static rendering — `/` fell from ISR to dynamic
  and four static pages became dynamic, to decide whether to render a component that is almost always
  nothing. A few inert kilobytes was the better trade. It self-gates in the browser.
- **`qa_event` lives in the production schema.** Serverless has no local disk that survives a request,
  so an observation has to land somewhere shared. Q6's teardown is the mitigation.
- **No rate limit on ingest.** The arming cookie needs the token, so the exposure is small; a
  compromised token could write rows until someone noticed.
- **XHR is uninstrumented.** Nothing in this app uses it. A third-party script might.

---

## 2 · Our itinerary and record

| Thing | Where |
|---|---|
| The itinerary | [`docs/qa/itinerary.md`](../docs/qa/itinerary.md) — 166 checks, eleven phases |
| The record | A published artifact — tickable, shared, notes on failure |
| Phase 0 helpers | [`docs/qa/phase-0.sql`](../docs/qa/phase-0.sql) |

**Its sibling is [`docs/qa/qa-plan.md`](../docs/qa/qa-plan.md)**, which is the automation strategy —
what CI should gate. The two are cross-linked and answer different questions. Q12 moves lines from the
itinerary into that plan; **a check automated there is deleted here.**

**The record is an artifact that publishes itself.** A tick embeds the marks in the page and republishes
it, so both testers and whoever is following see one set of marks (Q11). The first version stored them
in `localStorage`, where the watcher could not read them — which is the evidence behind Q11 and is cited
in the law.

---

## 3 · What a pass has caught

Past tense, permanent, never pruned ([PRINCIPLES §12a](../PRINCIPLES.md)).

### The instrument caught itself first — 2026-08-26

Four defects, all in the probe, all found by watching a real run rather than by reading code. This is
Q2 working, and the whole reason the law says to expect it.

| # | Found | Why nothing else would have |
|---|---|---|
| 1 | **Hash navigation uncaptured.** The route watcher compared `pathname + search` and ignored the hash. On a site navigated almost entirely by anchor, four anchor clicks recorded four clicks and no movement | Only visible by watching someone use anchors and seeing nothing follow |
| 2 | **Failed requests uncaptured.** A first run showed zero errors, which read as reassuring and was incomplete | A server action returning 500 raises no window error and often logs nothing |
| 3 | **Framework prefetches reported as failures.** Fetch capture immediately produced four "network failures" in one second — all React Server Component prefetches abandoned by the navigation that made them moot | Q4. The instrument was crying wolf within an hour of gaining the ability to cry at all |
| 4 | **Rendered refusals uncaptured — the important one.** A tester submitted a verification code and the log went silent. This app answers `{ok:false, error}` over **HTTP 200** and renders the message into the page, so the product's most common failure mode was invisible to error, console *and* fetch capture alike | Q3. Nothing short of asking "how does this system say no?" finds it |

Two smaller ones the same day: a `<select>` logged its entire option list as its accessible name, and a
click on nothing interactive logged a bare `div` with no context.

### The pass reordered itself — 2026-08-26

**Stripe moved from Phase 0 to Phase 11.** The itinerary originally required live keys before anything
else. Checking rather than assuming showed production was on test keys *and* that the whole payment
path already worked end to end — so going live first would have made every payment check a real charge
with a refund to chase, while removing the ability to trigger a decline or an authentication challenge
at all. That is Q10, learned by getting it wrong first.

### Findings in the product

*(To be filled as the pass runs. Each entry: the check id, what happened, what was expected, and
whether it became a gate under Q12.)*

---

## 4 · Known limits of this pass

Stated because coverage claimed but not exercised is worse than an acknowledged gap.

- **The author is testing his own work.** Most of the surfaces in Phases 1 and 2 were built in the same
  week by the person reading the log. The law names this in §7: it bounds what the pass is worth, and
  it is recorded here rather than left implicit.
- **Nothing in Phases 1–2 had been opened in a browser before the pass began.** Compiled, linted,
  prerendered and serving the right strings — but unseen.
- **375px is reasoned, not observed**, until Phase 10 runs.
- **No accessibility audit.** Token contrast was checked by hand; `ink-muted` on paper is 3.88:1 and
  below AA, which is the designer's own ramp step and so was left rather than quietly changed.
- **Phase 9's sweep and webhook checks touch production data** and are ordered last for that reason.
