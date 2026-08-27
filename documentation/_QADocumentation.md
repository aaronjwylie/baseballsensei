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
| The itinerary — the source | [`docs/qa/itinerary.md`](../docs/qa/itinerary.md) — 168 checks, twelve phases |
| The ledger — every id ever issued | [`docs/qa/ledger.json`](../docs/qa/ledger.json) |
| The record — the live cursor | [`/qa`](../src/app/qa/page.tsx), a temporary page on the site itself |
| Phase 0 helpers | [`docs/qa/phase-0.sql`](../docs/qa/phase-0.sql) |

**Its sibling is [`docs/qa/qa-plan.md`](../docs/qa/qa-plan.md)**, which is the automation strategy —
what CI should gate. The two are cross-linked and answer different questions. Q12 moves lines from the
itinerary into that plan; **a check automated there is retired here, never deleted** — it keeps the
verdicts already recorded against it and is offered no new ones.

### The record is a temporary page inside the product

| Piece | Where |
|---|---|
| The page | [`src/app/qa/page.tsx`](../src/app/qa/page.tsx) — server component, three access outcomes |
| The gate | [`src/domains/qa/api/qaAccess.ts`](../src/domains/qa/api/qaAccess.ts) |
| The board | [`src/domains/qa/ui/QaBoard.tsx`](../src/domains/qa/ui/QaBoard.tsx) |
| The state | `qa_mark` — one row per check, **check id as the primary key** |
| The checks it renders | `src/domains/qa/model/itinerary.json`, emitted by `npm run qa:build` |

It is a page in the app under test, which is the whole point: it is already deployed, already gated,
already instrumented, and it is deleted with its table when the pass ends — the teardown the law asks
for at build time is recorded in [`docs/OUTSTANDING.md`](../docs/OUTSTANDING.md).

**The gate follows the protection that is already there** (§6). While the site sits behind HTTP Basic
Auth, anyone who reached `/qa` at all has passed it, and asking them for a second secret buys nothing —
so `qaAccess()` returns `granted`. Once Basic Auth is lifted the page falls back to its own key,
`QA_TOKEN`, held in a `qa_auth` cookie. With neither set the page **404s** rather than existing
unprotected, because a public list of every check in the product is a map of where to look.

```
Basic Auth on   →  granted        (the site's gate is the record's gate)
QA_TOKEN set    →  needs-token    (?token=… → /api/qa/session → cookie → /qa)
neither         →  absent         (404 — the page does not exist)
```

`/api/qa/session` exists because a Server Component may not set a cookie during render; the route
validates the token and a same-site `?next=`, then redirects. **The page and the write path call the
same `qaAccess()`** — two answers to *may you write this?* is how a board lets someone tick a box that
then quietly does nothing.

**Sync, without ceremony.** Marks are last-writer-wins on the check id: two people ticking one row is a
correction, not a conflict, and nobody is asked to resolve a merge mid-pass. The board polls
`router.refresh()` every four seconds, paused when the tab is hidden. A tick paints immediately and the
optimistic overlay is reconciled **at render**, not in an effect, so a slow write never un-ticks itself
under the tester's cursor. **Verified in both directions** on 2026-08-26 with two testers on separate
machines.

**It says who.** The gate is shared, so a mark would otherwise be anonymous; the board carries a name
field and stores it on the row. A verdict nobody owns is one nobody can be asked about.

### Ids are permanent, and `qa:build` enforces it

Q12 guarantees the itinerary changes *while the pass is running*, so the ids have to mean one thing
afterwards. Three rules, all mechanical — `npm run qa:build` fails rather than trusting anyone to
remember them mid-pass:

| Rule | What the build does |
|---|---|
| A check is **retired, never deleted** | an id in the ledger that vanishes from the markdown fails the build: *"…has been deleted. Retire it instead — strike the text through with `~~…~~`"* |
| An id is **never reused** | a retired id that returns with different wording fails the build |
| A rewording **leaves a breadcrumb** | the previous wording is appended to that id's `history[]` and shown on the row |

Retirement is a markdown convention, so it lives in the source: `~~struck through~~` renders the row
with a line through it and a **Retired** badge, keeping any verdict already recorded and disabling the
buttons unless it is already marked. A reworded check shows a `<details>` disclosure — *"Reworded N× — a
verdict given earlier was against different words"* — because *"5.4 passed"* means something different
if 5.4 used to say something else.

[`docs/qa/ledger.json`](../docs/qa/ledger.json) holds every id ever issued with its wording, its
history, and its retired flag. All three guarantees were tested by deliberately breaking the itinerary,
then restored: **168 ids, 0 retired, 0 edited** at Build 13.

### The version stamp

The page's header reads, server-rendered from the deploy:

```
Itinerary · Build 13 · Generated 2026-08-26 22:00Z · Checks 168 live [· N retired · N reworded]
```

It is honest **because the page is server-rendered from a build**: what is on screen is what was
generated, so a stale tab shows a stale number rather than a fresh one. That is the property a
self-rewriting document could not have — its stamp is written before the publish that assigns the
version.

### The pipeline (Q14)

```
docs/qa/itinerary.md  ──  npm run qa:build  ──▶  src/domains/qa/model/itinerary.json  ──▶  /qa
      (source)                    │                          (generated)
                                  ├──▶  docs/qa/ledger.json   (id permanence, history, retirement)
                                  └──▶  docs/qa/qa-run.html   (the shareable report, published at the end)
```

**Edit the markdown, run `npm run qa:build`, deploy.** Nothing is hand-copied. `npm run qa:check` parses
without writing, so a pull request can say whether the itinerary still reads.

**Marks survive a rebuild** — they live in `qa_mark`, keyed by check id, entirely outside the generated
file, so editing the itinerary mid-pass cannot cost anyone a verdict. A mark whose check has been
retired is still shown, on its struck-through row, rather than dropped.

**The generator refuses to guess.** A row that looks like a check but will not parse is a hard error,
never a skip. Two conventions are read out of the markdown so flags live in the source too: an
expectation opening **⚠️** becomes a *Watch* badge (a decision to ratify, or a failure that would hurt)
and one opening **✅** becomes *Settled* — 19 and 6 of them today.

**Before the pipeline existed the checks were written twice**: as tables in the markdown and as a
hand-transcribed array in the record. They agreed for exactly as long as nobody edited either. That is
the evidence behind Q14.

### The record is instrumented by the site's own probe (Q15)

**Nothing was added.** `/qa` is a page in the app, so the probe that is on every other page is on it,
and the record's clicks arrive in `/api/qa/events` **in the same stream, in order** as the product's
clicks. A session reads as one story: tick 3.4, open the flow, submit, fail, tick 3.5 fail with a note.
That single stream is the argument for putting the record here rather than anywhere else, and it is now
Q15's preferred answer.

The probe reports interactions by accessible name, so the trail carries which phase was being read, a
tick reversed a minute later, a filter to failures that says the run has turned from testing to
reviewing — and, per Q5, *that* a note was typed on a check, never a word of it. `npm run qa:tail`
prints the stream in the reader's timezone.

**It self-arms.** `src/proxy.ts` sets the `qa_auth` and `qa_on` cookies once a request has passed Basic
Auth, so a tester does not have to be talked through turning the instrument on before the pass can
start.

**What it still cannot see** — a session that only reads. Someone scrolling the record without clicking
anything leaves no trace. That is a blind spot, not a gap to be closed later.

### Findings, and the loop to the fixing session (Q16–Q18)

| Piece | Where |
|---|---|
| The findings | `qa_note` — append-under, one row per finding |
| Provisional checks | `qa_check` — added from the board, folded into the markdown later |
| The fixer's read | [`/api/qa/notes`](../src/app/api/qa/notes/route.ts) + `npm run qa:notes` |

**The loop, end to end.** A tester expands a check on `/qa`, writes what they saw and picks the
browser from the roster the probe reported. In the other terminal, `npm run qa:notes` prints it
**beside the check's own expectation** — *"the panel is see-through"* is not actionable without
*"solid dark ground; the hero photo must not show through it"*. That session claims it, patches it,
marks it fixed; the tester's board shows **fixed · awaiting re-test** within four seconds. Nothing was
copied between two windows, and neither person had to describe the other's half.

**`pending → claimed → fixed → resolved`, with `blocked` aside.** The two distinctions that carry
weight are `fixed` ≠ `resolved` (the tester re-tests; the fixer never closes their own finding) and
`blocked` ≠ `resolved` (blocked is *open and waiting*, and is the handover list that outlives the
pass). Both are Q16.

**A note is editable and deletable only while nobody has taken it.** Claiming locks it — that is what
`claimed` is for, and it exists because *pending* never meant *unread*: a fixer could list the queue
and start work while the wording was still changeable. An edit keeps the previous text and the row
shows *"Edited N× — earlier wording kept"*. Delete is a real delete, for the note typed into the wrong
check; a board of struck-through mistakes reads worse than one without them.

The status check is a **condition on the UPDATE**, not a read followed by a write — two people polling
each other every four seconds is precisely where check-then-act loses.

**The queue prints what it is hiding** — `(not shown: 1 blocked, 2 resolved)` — because a filter
nobody can see is how a finding is lost between two people who each assumed the other had it.

⚠️ **The lock is a protocol, not enforcement.** It holds only if the fixing session claims before it
starts. `qa:notes` leads with that instruction and says why; nothing compels it.

### Adding a check mid-pass

The board's **"+ Add a check"** takes an id, and **the id is the placement**: `1.1.15` lands at the end
of group 1.1, `1.1.3.1` between 1.1.3 and 1.1.4, ordered componentwise so `1.1.10` follows `1.1.9`.
Placement compares against the generated checks **in the markdown's own document order** rather than
sorting the group — re-sorting would let the board silently disagree with the itinerary.

An id whose group does not exist collects under **"Added mid-pass"** rather than being refused: a
tester should not have to negotiate where a finding belongs before being allowed to write it down.

Rows are badged **"Added here"** and are staging, not a second source — `docs/qa/itinerary.md` stays
the source, and these fold into it at a phase boundary. **The server refuses an id already spent**,
withdrawn rows included; the primary key settles the case where two people post the same id in one
second.

**This started as a per-row "+" that inserted beneath that check**, which quietly meant a finding could
only be recorded where a check already existed — no use for one belonging to a phase nobody had
reached. That is why the control is global and the id is typed.

### The report, afterwards

`qa:build` also emits [`docs/qa/qa-run.html`](../docs/qa/qa-run.html): the same checks, standalone,
publishable to whoever has no login to the site. It is the *report* — §6's second job — and it is
published when the pass is done, not ticked during it. The site page is the *cursor*.

---

## 3 · Our three views (Q13)

| View | Who holds it | Reads |
|---|---|---|
| The screen | Ben, Aaron | the product itself |
| The instrument | Claude | `npm run qa:tail` — every action, refusal and failed request |
| The record | all three | `/qa` on the site — verdicts and what is left, live for everyone |
| **The system's state** | Claude | production Postgres over `PROD_DATABASE_URL`, read-only |

**The fourth view is what closes the loop.** A tester clicks *assign a coach*; the instrument confirms
the click; the database confirms the row moved to `assigned` and the trail recorded who did it. Three
kinds of evidence for one action, with nobody narrating.

⚠️ **`PROD_DATABASE_URL` is production.** It is deliberately not `DATABASE_URL` — for a period both
names were set in `.env.local` and the second won, which pointed `npm run simulate`, `flow`, `db:seed`
and `test:integration` at the live database. Those create *and delete* rows. The watcher's fourth view
is read-only by discipline, not by credential, and that is a known limit (§6).

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

### The instrument outgrew this project — 2026-08-27

The probe, the board and the fix loop are now a **Tool** in the doctrine template
(`tools/qa/`), snapshotted from this repo with the commit it came from. Not a package and not a
service: `_QALaw` §9 says extract at the **third** project, because one instance cannot tell you which
parts are general and two do not define a line either.

What ports by hand regardless of stack is the protocol — the five note states, who may set which, the
id guarantees, and the record/report split. What ports as code only ports to another Next.js · Drizzle
· Tailwind project, and `qaAccess.ts` must be rewritten rather than copied in every case.

**Improvements made here go back to the template.** A snapshot nobody refreshes is worse than none,
because it looks current.

---

## 5 · Where we came from

Past tense, append-only. Each of these is cited as evidence in a rail of the law, which is why it is
kept rather than tidied.

### The record was a `localStorage` checklist — retired 2026-08-26

The first version stored its marks in the tester's own browser, where the watcher — the entire reason
it existed — could not read them. It did the one thing it was built to do in the one place nobody
else could see. **Evidence behind Q11.**

### The record was a published artifact — retired 2026-08-26

Its replacement was a self-publishing document, hosted outside the product: a link two testers and a
watcher held open at once, which embedded its marks in its own HTML and republished itself on every
tick. The idea was sound and the shape was wrong, in four ways that a page inside the product does not
have:

- **It had to rebuild itself perfectly on every tick, and did not.** One careless selector —
  `document.querySelector("style")` — matched the platform's injected reset rather than the page's own
  stylesheet, and wrote the reset out as the whole stylesheet. The record came back unstyled.
  *(`scripts/qa-selfpublish-check.mjs` survives from this: it asserts the round-trip is idempotent
  before anything is published.)*
- **A save reloaded the view.** A tick that had in fact saved reloaded two seconds later, which read
  as a failure, so it was clicked again — and the second click un-ticked it. A verdict was lost this
  way before the cause was understood.
- **Writers were granted one at a time, and readers could be pinned to an old copy.** Getting the
  second tester write access was a support question in the middle of a QA run.
- **It could not honestly say which version it was.** The host assigns a version at publish, *after*
  the file is written, so a page that republishes itself always carries the previous stamp. A build
  counter was added, removed as duplicative of the host's numbering, then restored — and only settled
  once the record moved somewhere server-rendered, where the number on screen is the number that was
  built.

It also could not report to `/api/qa/events` at all: the viewer sandbox blocks requests to other
hosts, so its trail had to ride inside the state it published and arrived later and coarser than the
product's own. **Evidence behind Q11 and Q15**, both of which now name the in-product page as the
answer.

**The artifact is not gone; it changed jobs.** `qa:build` still emits `docs/qa/qa-run.html`, which is
the *report* for whoever has no login — §6's second job, published once at the end. What moved into
the product was the *cursor*.

---

## 6 · Known limits of this pass

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
