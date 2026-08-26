# qa — `src/domains/qa/`

**Temporary instrumentation for a manual QA pass. Built to be deleted.**

---

## 1 · The northstar

Someone clicks through the whole site; someone else follows along without
sitting next to them. The slice records what happened — clicks, navigations,
form submits, errors — so a bug can be discussed by what was actually done
rather than by what anyone remembers doing.

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

## 3 · Where we are now — 2026-08-15

- ✅ Click, navigation, form-submit, field-touch, window error, unhandled
  rejection and `console.error` are all captured.
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

---

## 4 · How to remove it

When the pass is done, this should go rather than linger:

1. Unset `QA_TOKEN` in Vercel. That alone disables everything.
2. `git rm -r src/domains/qa src/app/api/qa`
3. Remove `<QaProbe />` and its import from `app/layout.tsx`.
4. Remove the `qa_event` export from `src/db/schema.ts`.
5. Rename `drizzle/0020_drop_qa_event.sql.pending` to `.sql` and add its journal
   entry. It is already written.

Nothing else in the schema references the table, and nothing in the app imports
this slice except the layout.
