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
| The itinerary | [`docs/qa/itinerary.md`](../docs/qa/itinerary.md) — 168 checks, eleven phases |
| The record | A published artifact — tickable, shared, notes on failure |
| Phase 0 helpers | [`docs/qa/phase-0.sql`](../docs/qa/phase-0.sql) |

**Its sibling is [`docs/qa/qa-plan.md`](../docs/qa/qa-plan.md)**, which is the automation strategy —
what CI should gate. The two are cross-linked and answer different questions. Q12 moves lines from the
itinerary into that plan; **a check automated there is deleted here.**

### The pipeline (Q14)

```
docs/qa/itinerary.md   ──  npm run qa:build  ──▶  docs/qa/qa-run.html  ──▶  published artifact
       (source)                    │                    (generated)
                                   └── marks read back from the live artifact and merged by id
```

`docs/qa/template.html` is the page with the data punched out; `scripts/qa-build.mjs` parses the
itinerary's tables and fills it. **Edit the markdown, run `npm run qa:build`, republish.** Nothing is
hand-copied, and `npm run qa:check` parses without writing so a pull request can say whether the
itinerary still reads.

**Two conventions the build reads out of the markdown**, so flags live in the source too: an
expectation opening **⚠️** becomes a *Watch* badge (a decision to ratify, or a failure that hurts), and
one opening **✅** becomes *Settled*. 19 and 6 of them respectively today.

**Marks are merged, not overwritten.** The build takes the live marks — read back from the published
artifact — and carries them across by id, reporting any whose check has gone rather than dropping it.
That is what makes it safe to edit the itinerary mid-pass, which Q12 guarantees will happen.

**Before the pipeline existed the checks were written twice**: as tables in the markdown and as a
hand-transcribed array inside the artifact. They agreed for exactly as long as nobody edited either.
That is the evidence behind Q14.

### The record is instrumented too (Q15)

The page keeps a bounded trail of how it was used — opened, which phase is being read, jumps from the
rail, filter changes, marks and un-marks, and *that* a note was started on a check (never a word of it).
`npm run qa:trail -- <saved-artifact.html>` prints it in the reader's timezone.

**It cannot report the way the app does, and the difference is structural.** The viewer sandbox blocks
requests to other hosts, so there is no posting to `/api/qa/events`: the trail rides along in the state
the page already publishes and reaches the watcher when the page is next read.

**What it cannot see** — a session that never publishes. Somebody reading the record without marking
anything leaves no trace at all. That is a blind spot, not a gap to be closed later.

**Versions are the host's, not ours.** A build counter was added and then removed within the hour: the
artifact host already numbers every publish and shows it in a picker, and a second scheme beside it is
two names for one thing. It could not have been kept honest anyway — the version is assigned at publish,
after the file is written, and a tick that republishes the page carries the old stamp while the host
increments underneath it. Each publish gets a **label** instead, so the picker row says what changed.

### The record is a published artifact, and it does both of §6's jobs

**As the cursor, during the run.** A link — no checkout, no editor, nothing to install — that two
testers and a watcher hold open at once. Ticking a check embeds the marks in the page and republishes
it, and every open view reloads to the result, so a mark made by one person is on everyone's screen
within seconds. It carries live counts (**pass · fail · skip · to go**), a phase rail that goes green
when a phase is clean and red when something in it failed, and a filter down to what is left. The
toolbar states which mode it is in — **Shared**, **Saving…**, **Local only**, **Read-only** — because a
record claiming to be shared while writing to one browser is a lie in the direction of safety.

**As the report, afterwards.** The same page, filtered to failures, with each failure carrying the
sentence its tester wrote and every check still bearing its id.

Three implementation notes worth keeping:

- **Ticks are batched.** A publish reloads the view, so one per click would be unusable; a burst
  collapses into a single publish about a second after the last one, and scroll position survives it.
- **A conflict is expected, not an error.** Two testers ticking at once means one wins and both views
  reload to it. The page does nothing about it, which is the correct handling.
- **It regenerates itself from authored source**, never by serialising the DOM — the live DOM carries
  injected runtime scripts. The round-trip was proven idempotent across three hops before it shipped,
  because a page that rewrites itself imperfectly corrupts itself slowly.

**The first version stored marks in `localStorage`**, where the watcher — the entire reason it
existed — could not read them. That is the evidence behind Q11 and is cited in the law.

---

## 3 · Our three views (Q13)

| View | Who holds it | Reads |
|---|---|---|
| The screen | Ben, Aaron | the product itself |
| The instrument | Claude | `npm run qa:tail` — every action, refusal and failed request |
| The record | all three | the shared artifact — verdicts and what is left |
| **The system's state** | Claude | production Postgres over `PROD_DATABASE_URL`, read-only |

**The fourth view is what closes the loop.** A tester clicks *assign a coach*; the instrument confirms
the click; the database confirms the row moved to `assigned` and the trail recorded who did it. Three
kinds of evidence for one action, with nobody narrating.

⚠️ **`PROD_DATABASE_URL` is production.** It is deliberately not `DATABASE_URL` — for a period both
names were set in `.env.local` and the second won, which pointed `npm run simulate`, `flow`, `db:seed`
and `test:integration` at the live database. Those create *and delete* rows. The watcher's fourth view
is read-only by discipline, not by credential, and that is a known limit (§5).

---

## 4 · What a pass has caught

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

## 5 · Known limits of this pass

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
- **The watcher's database view is read-only by discipline, not by credential.** The connection can
  write. Nothing enforces that it does not.
