# settings — `src/domains/settings/`

The **settings slice** — the limits the admin tunes without a deploy.

---

## 1 · The northstar

Seven numbers, one row, one admin form:

| Setting | Default | What it governs |
| --- | --- | --- |
| `priceCents` | 8000 | what one submission costs |
| `maxFileSizeMb` | 50 | the largest single upload |
| `maxFilesPerSubmission` | 5 | how many files one submission carries |
| `retainCollectedDays` | 30 | how long files survive **after the customer downloads** |
| `retainDeliveredDays` | 90 | the backstop, for a customer who never downloads |
| `warnBeforeDeletionDays` | 7 | how much notice they get before deletion |
| `retainUnpaidHours` | 24 | when an abandoned submission's uploads are deleted |

### The timers, and why they aren't one mechanism

Three clocks govern a submission, and they are implemented three different ways.
Worth knowing before anyone asks for "a timer in admin":

| Clock | Value | How it's enforced |
| --- | --- | --- |
| **The flow window** — one clock for the whole unfinished attempt | **30 min**, sliding — and now the *only* clock before payment: the verification code shares it | the flow cookie's own TTL. No scheduler: an expired token simply fails to verify |
| **Deferred cleanup** — a released submission's files | `retainCollectedDays` from `collectedAt`, or `retainDeliveredDays` from `completedAt` — **whichever is later** | the nightly sweep. **All four folders go**, records stay |
| **A scheduled one-off** — the deletion warning | `warnBeforeDeletionDays` before the above | the same sweep, running *first* and against a nearer cutoff, so a single night can't both warn and delete |
| **Deferred cleanup** — an abandoned submission | `retainUnpaidHours` | the sweep *and* every new submission. **Deleted outright** — files and record |

**One window covers the whole attempt.** The verification code does *not* get an
expiry of its own — it lives and dies with the flow window, and a resent code
inherits whatever time is left rather than starting a new 30 minutes. A customer
should be able to hold one number in their head ("I have half an hour"), not
discover a second, shorter clock they were never told about.

✅ **The one-clock rework is done.** The window is **30 minutes and sliding**, and
there is now a single source of truth for it: `FLOW_WINDOW_MINUTES = 30` in
`shared/lib/flowWindow.ts`. Both consumers derive from it —
`FLOW_MAX_AGE_S` (via `FLOW_WINDOW_SECONDS`) in `domains/submission`, and
`CODE_TTL_MINUTES` (`= FLOW_WINDOW_MINUTES`) in `domains/verification`, which
re-exports rather than redeclares so the two can't drift. The former second,
independent 10-minute code clock is gone; the constant lives in `shared/` because
the two domains that depend on it may not own it without the other importing it
(PRINCIPLES §5). It was six hours, then ten minutes (2026-07-30, too tight to
verify then choose files), now thirty and sliding.

Both cleanup clocks are **relative to the submission**, never to a wall-clock
schedule — "24 hours after *it* completed", not "at 4am".

The two are not symmetrical, and shouldn't be. A paid submission's history
matters, so its record survives its files. Nothing was ever bought in the
abandoned case, so **nothing is retained** — a kept row would just be noise in
the queue.

**Running out is not an error — it's a scrub.** When the window lapses, or the
verification attempts are exhausted, the unfinished submission is discarded exactly
as a refresh discards it, and the customer is returned to step 1. One outcome, three
routes to it; the flow never leaves someone standing on a step whose submission is
gone.

🔶 **Half built.** A lapse during upload is now *named* rather than surfacing as an
opaque token error — "Your session timed out. Choose Start over…" — and "Start over"
genuinely resets to step 1. But the customer still has to press it: nothing returns
them automatically, and a lapse at step 2 or 4 is still an anonymous inline error.

**Only the resolved clock depends on the cron.** Vercel's Hobby plan permits one
cron run a day, so "24 hours after completion" is 24–48 in practice; hourly needs
Pro. The abandoned clock sidesteps that entirely — `startSubmissionAction` sweeps
unpaid submissions as well, so the flow cleans up after itself whenever anyone
starts one. With no traffic nothing is running anyway, and with traffic the cron
is only a backstop.

✅ **The retention rework shipped 2026-08-01.** The clock keys off the *customer's
download* — 30 days from collection, or 90 from delivery, whichever expires later
— and a one-week warning precedes deletion. **The coach's response is swept with
everything else**, which is only safe because the clock cannot start until the
customer has the files in hand.

**The fourth kind of clock now exists.** The warning is the first genuinely
*scheduled* effect in the system: "delete what's due" is derivable from state,
"warn a week out" is a one-off that must fire exactly once. `deletionWarnedAt` is
its guard, and it is stamped whether or not the send succeeded — retrying nightly
would turn one undelivered email into seven. That
warning is the "fourth kind" below — the first genuinely scheduled effect in the
system — so it can't be folded into the existing derivable sweeps. See
[`submission/_SubmissionDocumentation.md` §2](../submission/_SubmissionDocumentation.md).

**A fourth kind doesn't exist yet and isn't cheap.** "Email the coach if a
submission sits untouched for 48h" is not another row here — nothing on the
submission implies it, so it needs per-item scheduled state, once-only delivery,
and a decision about what happens when the submission changes while the timer is
pending. The two kinds above are cheap precisely because they're *derivable* from
a timestamp already on the row. Add named timers when a concrete one is wanted;
a generic rules engine is the platform build-out CLAUDE.md §2 rules out.

### Why these aren't env vars

**Env vars are the developer's configuration; these are the operator's.**
Different owner, different lifetime, different home. A redeploy to change "how
many files" is a bottleneck with one developer and a client in another timezone —
and these are business judgements, not engineering constants.

`shared/config/env.ts` keeps its rule intact: it is still the only place
`process.env` is read. These simply aren't env.

### The invariants

- **One row, always.** `SETTINGS_ID` is fixed, so the table cannot grow a second.
  `getSettings()` creates it on first read rather than returning defaults, so the
  admin form always has something to edit.
- **The schema bounds the knobs.** $1–$10,000, 1–2000 MB, 1–20 files, retention
  days 1–3650, the unpaid window 1 hour to a year. The ceilings stop a typo turning
  one upload into a storage bill; the retention floor stops an operator setting a
  sweep so aggressive it deletes files out from under a coach who is still working.
  A **cross-field `.refine`** also ties the fields together: the deletion warning
  must be no longer than the shorter of the two retention windows, or the sweep's
  `retain − warn` cutoff goes negative and warns every just-delivered submission.
  Per-field bounds can't express that, so it lives on the schema.
- **Read through `getSettings()`, which is `cache`d per request.** The upload
  route, the flow page, and the sweep all ask; they share one query.

---

## 1b · The slice owns its storage — 2026-08-05

`settings` is declared here now, in `model/settingTable.ts`
([ADR 015](../../../docs/decisions/015-schema-by-domain.md)). It references
nothing and nothing references it, so it's the one table the split left entirely
self-contained.

Its docblock came back with it, and was **misfiled** in the shared schema — it
sat above `submissionEventTable`, describing a table three hundred lines away.
Reattached to the declaration it belongs to, which is the failure mode a
one-declaration-per-file rule makes impossible.

## 2 · Where we are now — 2026-08-01

- ✅ **Retention is three knobs now**, not one: `retainCollectedDays` (30),
  `retainDeliveredDays` (90) and `warnBeforeDeletionDays` (7). `retainResolvedHours`
  is gone — it measured from completion, which deleted files the customer may
  never have collected.
- ✅ **`priceCents`** moved here from `site.ts`, so the price is the admin's rather
  than a deploy's.
- ✅ **The fourth kind of clock exists.** The deletion warning is the first
  genuinely *scheduled* effect in the system — see the timer taxonomy above.


### Before 2026-08-01

- ✅ **Built**, with the admin form at `/admin/settings`.
- ✅ **Enforced server-side on every upload** — the browser is told the limits so
  it can be helpful, never trusted to apply them.
- 🔶 **No audit trail.** `updatedAt` records *when*, not *who* or *what it was*.
  With one admin that's proportionate; with several it wouldn't be.
- 🔶 **Changing a limit doesn't affect files already stored.** Lowering the size
  cap won't retroactively delete an oversized upload, and lowering the file count
  won't trim an existing submission. That's deliberate — retroactive deletion on a
  settings save would be a nasty surprise — but it's worth knowing.
- 🔶 **Retention changes take effect on the next nightly sweep**, not immediately.

---

## 3 · Where we came from

New on 2026-07-30, created because
[ADR 009](../../../docs/decisions/009-upload-before-payment.md) needed an abuse
guard and the admin asked for the numbers to be his rather than ours
([ADR 012](../../../docs/decisions/012-retention-and-operator-settings.md)).

- **A single-row table, not a key/value store.** Four typed columns beat four
  rows of `(key, value::text)` that every caller has to parse and none of which
  the database can constrain.
- **Its own slice rather than living in `account`.** These are platform settings,
  not operator identity; the only thing they share is that an admin edits them.

**Hardened in the second bug-hunt round (2026-08, #10 and follow-ups):**

- **A missing settings row now says so, loudly.** `getSettings` still creates the
  row on first read, but when it has to fall back to `DEFAULT_SETTINGS` it
  `console.warn`s that the price is repricing to the default — because that branch
  silently makes the charge, the landing card and the terms page agree with each
  other and disagree with the operator, the one failure that looks like nothing is
  wrong.
- **Concurrency on the upsert.** `getSettings`'s seed uses `onConflictDoNothing`
  and `updateSettings` uses `onConflictDoUpdate`, so two requests racing to be
  first don't collide.
- **The cross-field warning constraint** (see the invariants) closed the case where
  a warning longer than a retention window warned every just-delivered submission.
- **The one-clock collapse** finished the flow-window rework: `CODE_TTL_MINUTES`
  now derives from the single `FLOW_WINDOW_MINUTES` constant rather than running its
  own 10-minute clock (see the timer taxonomy above).
