# qa — `src/domains/qa/`

**Temporary instrumentation for a manual QA pass. Built to be deleted.**

---

## 1 · The northstar

Someone clicks through the whole site; someone else follows along without
sitting next to them. The slice records what happened — clicks, navigations,
form submits, errors — so a bug can be discussed by what was actually done
rather than by what anyone remembers doing.

The slice is now **two instruments**, both temporary:

1. **The probe** — passive, on every page, recording what happened (this
   section's original subject).
2. **The board at `/qa`** — the shared record of a scripted manual pass: the
   itinerary of checks, a pass/fail/skip verdict on each, and the findings
   written against them. Two testers work one list and see each other's marks
   within seconds, without sitting together. It replaced an earlier
   published-artifact version of the same record — see §2b.

### The invariants

- **It records descriptions, never contents.** A click sends the element's
  accessible name; a form interaction sends the field's *name*, its type and how
  many characters were entered. What was typed is never sent and has nowhere to
  land. This is a production database holding real customers: a QA log that
  accumulated their details would be a second copy of that data, governed by
  none of the retention rules that cover the first.
- **Sensitive fields are dropped twice** — in the probe and again in the route.
  The probe is one of the things under test during a QA run, so a bug in it must
  not be able to write a password into a production table. `NEVER_RECORD`
  matches on substrings and errs wide: `confirmPassword`, `new_password` and
  `cardNumber` all match.
- **Off is the default, and off is total.** With `QA_TOKEN` unset, every
  `/api/qa/*` route answers 404 and no arming cookie can be minted. Deleting the
  variable ends a run everywhere.
- **404, never 401.** `/api` sits outside the Basic Auth gate, so these routes
  are reachable by anyone who guesses the path. An endpoint that answers "wrong
  token" has confirmed it exists.
- **The instrument must never become the bug.** Every listener is wrapped, the
  sender swallows its own failures, and the ingest route returns 200 even when
  the insert fails. A QA probe that breaks the page it is measuring is worse
  than no probe.

---

## 2 · How a run works

**Times.** `qa_event.at` is `timestamp with time zone` — an absolute instant,
not a wall clock. That is the only defensible storage for a team split between
Vancouver and Tokyo, and it is the same call `shared/ui/LocalTime` makes for the
portal. But reading rows back raw prints UTC, so the log says 19:28 while the
person who did the clicking is looking at 12:28. `npm run qa:tail` prints the
reader's own zone with the UTC instant beside it — the second half matters
because Stripe, Resend and Vercel are all UTC, and a run spends its time
cross-referencing them.

```bash
# Follow a run in your own timezone
npm run qa:tail            # live
npm run qa:tail -- --once  # print and stop
npm run qa:tail -- --clear # wipe the log

# 1. Arm this browser (once, in the address bar)
https://www.baseball-sensei.com/api/qa/session?token=$QA_TOKEN

# 2. Follow along from a terminal
curl -s "https://www.baseball-sensei.com/api/qa/events?token=$QA_TOKEN&limit=100" | jq .

# 3. Clear between phases
curl -s "https://www.baseball-sensei.com/api/qa/events?token=$QA_TOKEN&clear=1"

# 4. Disarm when finished
https://www.baseball-sensei.com/api/qa/session?token=$QA_TOKEN&off=1
```

`QA_TOKEN` is a server-only variable set in Vercel. It gates a production
endpoint, so it wants the length of a real secret rather than a word.

---

## 2b · The board — `/qa`

The shared record of a scripted pass, rendered on the site rather than published
as an artifact (that earlier version cost a stylesheet, a lost verdict and a
sharing puzzle before the trade became clear). The state is a table; the writers
are whoever armed a browser for the pass; there is no publish and no version to
match. It polls `router.refresh()` every four seconds — enough for two people
ticking a list to see each other, and a socket would be machinery for a page
built to be deleted.

**The itinerary is generated, not authored in place.** `docs/qa/itinerary.md` is
the source; `npm run qa:build` parses it into `model/itinerary.json`, which
`model/itinerary.ts` re-exports. Ids are permanent and never reused — the build
refuses a deletion and a reused id — so a verdict always describes the thing it
was recorded against. The page stamps which build it is showing (`itineraryMeta`)
so two people are comparing the same list. The current pass is ~199 checks across
its phases.

What the board holds, each a table of its own:

- **Marks** (`qa_mark`) — one `pass` / `fail` / `skip` verdict per check, with
  the actor's name, so the record says *who* decided a check passed. Optimistic
  on click, reconciled at render against the server's answer.
- **Findings** (`qa_note`) — prose a tester typed about a check. Carries a
  browser (from the probe's own roster, so "chrome" isn't spelled three ways), an
  author, and a status. **Editable only while `pending`** — the window where
  nobody has picked it up — and an edit keeps the prior wording in `revisions`.
- **Field checks** (`qa_check`) — a check added from the board mid-pass, before
  it reaches the markdown. Badged **provisional** on screen, placed by its dotted
  id (the id *is* the placement — phase, group and order), staged until a
  reconcile step folds it into the source. **Rows are never deleted**: a withdrawn
  id stays spent, because an id handed out twice would re-point every verdict
  under the first one.

**The finding lifecycle is `pending → claimed → fixed → resolved`, with `blocked`
off to one side.** `claimed` is what makes editing safe — a fixer claims a note
before working on it, which locks the wording. `fixed` is the most the patch's
author may assert; `resolved` belongs to whoever re-ran the check — the same line
the submission ladder draws between `complete` and `collected`. **`blocked` is
deliberately not terminal**: it is the handover list, the findings that outlive
the pass, waiting on client copy, a photograph, or a decision.

**Access follows whatever protects the site** (`api/qaAccess.ts`). While the site
is behind Basic Auth, everyone here already proved themselves at the front door,
so the board asks for nothing more. When that gate lifts, `QA_TOKEN` takes over —
a token on the query (`/qa?token=…`) arms the browser for eight hours. With
neither, the page 404s, because a public list of every check in the product is
not something to serve.

The board is instrumented by the same probe as every other page — its clicks and
the product's clicks land in one log.

Companion scripts: `qa:build` (source → json, with a self-publish check),
`qa:check` (build in `--check` mode), `qa:trail` and `qa:notes` (read the
findings from a terminal).

---

## 3 · Where we are now — 2026-08-15

- ✅ Click, navigation, form-submit, field-touch, window error, unhandled
  rejection, `console.error`, failed `fetch`, and control **state** changes (a
  checkbox ticked — including one that moves on its own) are all captured.
- ✅ The probe self-gates in the browser.
- 🔶 **The probe ships to every visitor**, inert. Gating it server-side meant
  reading a cookie in the root layout, which opts **every route in the app** out
  of static rendering — it turned `/` from ISR to dynamic and `/contact`,
  `/terms`, `/login` and `/status` from static to dynamic. A few inert kilobytes
  was the better trade.
- 🔶 **`qa_event` is a table in the production schema.** Serverless has no local
  disk that survives a request, so an observation has to land somewhere shared.
- 🔶 **No rate limit on ingest.** The arming cookie requires the token, so the
  exposure is small, but a compromised token could write rows until someone
  noticed.
- ✅ **Failed requests are captured** — a wrapped `fetch` records non-2xx
  responses and network failures by status and path. Only the path: the query
  string is where tokens travel. `/api/qa/*` is skipped, or reporting a failure
  would post a request whose failure would be reported.
- ✅ **Hash navigations are captured.** They were not at first, and the first
  real run made it obvious: this site navigates mostly by anchor, so four
  anchor clicks in a row recorded four clicks and no movement, which is the one
  thing worth checking on a page built out of anchors.
- 🔶 XHR (as opposed to `fetch`) is still uninstrumented. Nothing in this app
  uses it; a third-party script might.

### Since — the board (2026-08)

- ✅ **The shared board at `/qa`** replaced the published-artifact record: marks,
  findings and mid-pass checks, all in production tables, all seen across
  browsers within four seconds (§2b).
- ✅ **The itinerary is generated from `docs/qa/itinerary.md`** via `qa:build`,
  with permanent, never-reused ids and a build stamp on the page.
- ✅ **Findings carry a lifecycle** — `pending → claimed → fixed → resolved`, plus
  `blocked` for what outlives the pass — and are editable only while `pending`,
  keeping prior wordings in `revisions`.
- ✅ **The probe's credential leak was closed** — it had been writing live values
  into a production table before the sensitive-field drop was tightened;
  `NEVER_RECORD` now also covers `code`, `token` and `secret`.
- 🔶 **Three more tables live in production** alongside `qa_event`: `qa_mark`,
  `qa_note`, `qa_check`. Same trade as the event log — serverless has no shared
  disk — and the same obligation: no customer detail belongs in a finding's prose.

---

## 4 · How to remove it

When the pass is done, this should go rather than linger:

1. Unset `QA_TOKEN` in Vercel. That disables the **probe** (no arming cookie can
   be minted, `/api/qa/*` 404s) and the board once the Basic Auth gate is off.
   Note the board is still reachable while Basic Auth is on — `qaAccess` grants on
   the front-door gate alone — so removing the code and tables is what truly ends
   it.
2. `git rm -r src/domains/qa src/app/api/qa src/app/qa`
3. Remove `<QaProbe />` and its import from `app/layout.tsx`.
4. Remove the four QA table exports from `src/db/schema.ts` — `qaEventTable`,
   `qaMarkTable`, `qaNoteTable`, `qaCheckTable`.
5. Drop the four tables in a migration. `drizzle/0020_drop_qa_event.sql.pending`
   drops `qa_event` and is already written; `qa_mark`, `qa_note` and `qa_check`
   (migrations `0022`–`0025`) need the same treatment — extend that migration or
   add a companion, then add the journal entry.
6. Optional: remove the `qa:*` scripts from `package.json` and the source under
   `docs/qa/`.

Nothing else in the schema references these tables, and nothing in the app imports
this slice except the layout and the `/qa` page.
