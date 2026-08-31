# Rollout — from what's deployed to the northstar pipeline

The northstar is [`domains/submission/_SubmissionDocumentation.md` §2](../../src/domains/submission/_SubmissionDocumentation.md):
seventeen stages, sixteen statuses, nine emails. This is the route from what runs
in production today to that, in the order the dependencies actually allow.

**Read the path doc for *what*; read this for *when and why in this order*.**
Nothing here is new design — every item traces to a `(not built)` marker or a
`(today: …)` divergence already recorded there. If something in this plan isn't in
that doc, one of the two is wrong.

_Written 2026-08-01, against `main` @ `126c8a4`._

---

## 0 · Status — 2026-08-01, evening

**Phases 1–6 are shipped and verified.** Every stage of the seventeen has code
behind it; the path doc's table carries no `(not built)` markers for the first
time. Phase 7 is effectively complete via Aaron's status-code work.

**What's left is Phase 0**, which is operations rather than code: live Stripe
keys and webhook, clearing the Basic Auth gate, real coach content, and one human
test of a card. Until those land, none of this can take an order.

**The window that mattered closed on the right side of the line.** There were no
real customers when the sixteen-value enum, the events table, the four file kinds,
the two file-set columns and the two retention anchors all went in — five
migrations that would each have needed a careful, reversible, data-preserving plan
a week later.

---

## 1 · Where we actually are (as of the morning)

Seven stages of seventeen run end to end in production. The customer funnel is
complete through payment; the operator loop works but is blind in places; nothing
after delivery exists.

| Stage | State |
| --- | --- |
| 1–4 details → verify → upload → pay | ✅ **built and walked in a browser** |
| 5 coach assigned | ✅ built — minus the translation derivation |
| 6–7 originals translated | ❌ nothing |
| 8 handed to the coach | 🔶 built, but sends everything and jumps to `in_review` |
| 9 coach downloads | ❌ nothing |
| 10 coach delivers | ✅ built — multi-file, direct-to-Blob, approval gate. **No email** |
| 11–12 response translated | ❌ nothing |
| 13 approved & sent | 🔶 built — no language choice, no retention copy |
| 14 customer downloads | 🔶 the *link* is built; the **stamp** isn't |
| 15 resolved | ❌ nothing |
| 16 deletion warning | ❌ nothing |
| 17 files purged | 🔶 sweeps customer uploads only, on the old 24h clock |

### What landed on 2026-08-01, and what it means for this plan

Four commits moved the needle more than their size suggests:

- **A signed capability token** (`domains/feedback/api/feedbackToken.ts`) — purpose-bound,
  unforgeable, one year. **This is half of the northstar's magic link**, and the
  hard half: the crypto, the purpose binding, and the route that consumes it all
  exist. Extending it to a *status* capability is a second purpose, not a new
  mechanism.
- **`submissionFiles.kind`** — one table, two roles, kept apart by a discriminator.
  **This is the four-folder model's foundation**, already carrying two of the four
  values.
- **Multi-file coach feedback** — the response is a pack, like the submission. The
  path doc assumed this; now it's true.
- **The status lookup stopped serving feedback.** It says "we've emailed you a
  private link" instead. That closes the hole where an unverified email could
  collect a stranger's review — the sharpest security gap the doc recorded.

**Two things landed that now contradict settled decisions.** Neither is a mistake;
both predate the decision. They need resolving before the phase that touches them:

1. **"The coach's feedback file is never swept"** — stated in `retentionSweep.ts`
   and in the token's own comment. The settled northstar is **everything is swept
   together** (step 17), which is only safe because the clock starts on collection.
   Phase 6 changes this; until then the two documents disagree and the code wins.
2. **The token lives a year; the files won't.** With 30-day-from-collection
   retention, a link mailed today resolves to **410 Gone** long before it expires.
   That's defensible — the route already answers 410 — but it should be a decision,
   not a leftover. **Settled 2026-08-01: the year stays.** A link that says "this has
   been deleted" is a kinder answer than one that says "invalid", and the route already
   distinguishes them.

### The naming collision — settled

`submissionFiles.kind` shipped as **`submission` / `feedback`**; the settled status
names use **`intake_*` / `response_*`** for the same two concepts. **The decision is
`intake` / `response` everywhere** — the shipped values get renamed, not the statuses.

It costs a data migration the other direction wouldn't have. It buys a vocabulary
that survives: *intake* and *response* say **who the files came from**, which is the
distinction that actually matters, while `submission`-inside-`submissionFileTable` says
almost nothing. The full vocabulary is now [`_NomenclatureLaw.md`](../../laws/_NomenclatureLaw.md).

**Grammar keeps the two axes apart** where the stem is shared — a file kind is a
**noun** (*what is this file*), a status is a **participle** (*what has happened*):

| | File kind | Status |
| --- | --- | --- |
| customer's files | `intake` · `intake_translation` | `intake_translating` · `intake_translated` |
| coach's files | `response` · `response_translation` | `response_translating` · `response_translated` |

So `kind === 'intake_translation'` never reads as `status === 'intake_translated'`.

⚠️ Phase 1 now carries the rename: `UPDATE submission_files SET kind = 'intake' WHERE
kind = 'submission'` and the same for `feedback` → `response`. Small, but it touches
live rows — and it must land **in the same migration as the enum**, so the two
vocabularies never coexist in a deployed state.

---

## 2 · How the phases are ordered

Three rules decided the sequence, in this priority:

1. **Nothing destructive ships before the handle that undoes it.** Operator
   override (Phase 5) precedes the retention rework (Phase 6). the admin gets the manual
   purge and the status reset *before* the system starts deleting more, on a longer
   clock, with a warning email.
2. **The record before the behaviour.** Phase 1 is schema only — no visible change,
   everything after depends on it. Building step 9's download stamp against a status
   enum that can't express `sent_to_coach` means building it twice.
3. **Cheapest trust first.** Phase 2 is five small fixes that each stop a customer
   being silently stranded. Best value per hour in the whole plan, and none of it
   blocks anything else — it can run in parallel with Phase 1.

---

## Phase 0 · Take money

*Not pipeline work, but it gates everything. Already scoped in [OPERATIONS.md](../../OPERATIONS.md).*

- Live Stripe keys + the `payment_intent.succeeded` webhook
- Clear `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` when the site should be reachable
- Confirm `NEXT_PUBLIC_SITE_URL` is the `www` host — it's inlined at build time, so
  changing it needs a redeploy
- Real coach content and photography for the landing page
- One human test of the card field and 3-D Secure

**Until this is done, every phase below is preparation for a product that can't
take an order.** It should not wait on any of them.

⚠️ **But Phase 1's migration should land before this does.** There are no real
customers yet, which makes a sixteen-value enum change nearly free; the first real
payment closes that window permanently. Phase 0 is operations and Phase 1 is code,
so they run in parallel — the constraint is only on the order they *finish*.

---

## Phase 1 · The spine of record — ✅ **shipped 2026-08-01**

**Schema only. Nothing visible changes; almost everything after depends on it.**

| | Ships | |
| --- | --- | --- |
| 1.1 | Status enum: seven values → sixteen | ✅ migration `0008` |
| 1.2 | `submission_event` table — `submissionId` · `status` · `at` · `actorId` · `note` | ✅ |
| 1.3 | Every existing transition writes an event | ✅ in `updateSubmission`, the one write path |
| 1.4 | `submissionFiles.kind`: rename `submission`→`intake`, `feedback`→`response`, then extend to four | ✅ now a `file_kind` enum |
| 1.5 | The paid-ness `Record` answers all sixteen | ✅ — **and three more like it** |
| 1.6 | The customer status lookup collapses sixteen states into calm language | ✅ eleven rungs → one sentence |

### What the build surfaced that the plan didn't

**The hazard was worse than "grep before, not after".** Thirteen call sites compared
`status === "complete"` to mean *the customer may see this*. The moment `collected`
exists, that comparison goes false **the instant a customer downloads** — they would
have revoked their own access by using it. None of it is a type error; all of it is
silent.

The fix is the `isPaid` lesson applied three more times: **derived predicates over
literal comparisons**, each an exhaustive `Record<SubmissionStatus, boolean>` so a
new rung can't be added without answering.

| Predicate | Asks | Replaces |
| --- | --- | --- |
| `isReleased` | may the customer see it? | `status === "complete"` (13 sites) |
| `hasResponse` | has the coach delivered? | `awaiting_approval \|\| complete` |
| `isWithCoach` | is it on a coach's desk? | `assigned \|\| in_review` |

**The actor is read from the session, not passed in.** Every caller would otherwise
have to remember a parameter, and the one that forgets writes an anonymous event
indistinguishable from a legitimate one. Reading it inside the event writer makes the
right answer the default; null is meaningful — the customer and the cron genuinely
have no session.

**The trail is transactional, not best-effort.** `updateSubmission` reads the
previous status, writes, and stamps, all in one transaction — so the history cannot
disagree with `submissions.status`, and a *repeated* set (a redelivered webhook, a
double-clicked button) produces no second event. That read-before-write is the extra
query earning its place.

**Verified** by walking one submission through all sixteen rungs: twelve changes
produced twelve events, a repeat produced none, a non-status patch produced none,
ordering held, and the events cascaded on delete.

**Why first:** three later phases say "the status moves to X". None can be built
honestly against an enum that can't say X.

**Why it's safer than it looks:** paid-ness is a `Record<SubmissionStatus, boolean>`,
so adding a status without answering "is this paid" is a **compile error**. That's
how `awaiting_approval` was caught. All nine new values are paid — the ladder only
branches after step 4.

**The risk that isn't compile-checked:** every admin filter and query that names a
status. `in_review` in particular changes meaning — from "we emailed the coach" to
"the coach has the files" — and `sent_to_coach` takes over the old sense. Grep
before, not after.

**Verifiable when:** the seed runs, the admin queue renders every existing
submission unchanged, and `submission_event` has a row per historical transition
we can reconstruct (or is deliberately empty before the cutover — decide which).

---

## Phase 2 · Stop stranding customers — ✅ **shipped 2026-08-01**

**Five small independent fixes.** Every one of them was a case where the product
failed silently.

| | Ships | | Fixed |
| --- | --- | --- | --- |
| 2.1 | `{ ok: false, gone: true }` — the flow resets to step 1 rather than showing an inline error | ✅ | a customer uploading into a submission the server swept |
| 2.2 | One clock — the code's TTL *is* the flow window | ✅ | a code that dies while the session is alive |
| 2.3 | The code send is confirmed before the customer advances | ✅ | a missing key leaving them waiting for nothing |
| 2.4 | "Check your spam folder" on step 2 | ✅ | *already shipped* |
| 2.5 | A declined card emails a way back, and extends the window | ✅ | files swept from under someone finding another card |

### What the build surfaced that the plan didn't

**"Best-effort" and "unreportable" had been collapsed into one thing.**
`sendEmail` returned `void` and swallowed every failure, so 2.3 wasn't a matter of
checking a result — there was no result. ADR 004 only ever meant *never throw into
a webhook or a portal action*; it never meant delivery should be unknowable. The
transport now returns a boolean and still never throws. Most callers rightly ignore
it; the one whose customer is **blocked** on the message does not.

**One clock had to move to `shared/`.** `FLOW_MAX_AGE_S` lived in
`domains/submission` and `CODE_TTL_MINUTES` in `domains/verification`, and neither
domain can own a constant the other needs without inverting a dependency. It now
lives in `shared/lib/flowWindow.ts` — the highest node where it's still true
(PRINCIPLES §5) — so "one clock" is structural rather than a comment someone has to
honour.

**2.5's email was the easy half.** "Extends the window" can't be done from a
webhook — there's no cookie to touch. The real fix was that `findAbandonedDue`
measured from `submittedAt`, so the clock ran from creation no matter what the
customer did; it now measures from `updatedAt`. Recording the decline **is** the
extension, which is why the note is written rather than only logged — and it
incidentally protects anyone else mid-flow, not just the declined card.

**Verified:** the three clocks agree (30m / 30m / 1800s), and a backdated
submission due for sweeping stops being due the moment a failed payment touches it.

---

## Phase 3 · Make the queue tell the truth — ✅ **shipped 2026-08-01**

**the admin's visibility.** Five of the nine emails tell him something and four didn't
exist, so he learned that a payment landed, that a coach picked work up, that a
response was waiting, and that a customer collected — **by looking.**

| | Ships | |
| --- | --- | --- |
| 3.1 | Step 8 sets `sent_to_coach`, not `in_review` | ✅ |
| 3.2 | **Step 9** — the coach's first download stamps, moves to `in_review`, emails ④ | ✅ |
| 3.3 | Step 10 emails ⑤ — the admin *and* the coach | ✅ |
| 3.4 | **Step 14** — the customer's first download stamps, moves to `collected`, emails ⑦ | ✅ |
| 3.5 | Step 4's ② also goes to the admin | ✅ |
| 3.6 | Server-side status guards on steps 5 and 10 | ✅ |

### What the build surfaced that the plan didn't

**A download says who, and that turned out to matter twice.** The plan treated
"observe a download" as one problem; it's really "observe *the right person's*
download". An admin opening an intake file is checking on the work, not starting
it — counting it would make `in_review` meaningless again. the admin opening a response
to check it is not the customer collecting it — counting it would delete their
feedback thirty days after *he* looked. Both stamps are gated on the actor, and
step 9's additionally on it being **that coach's** submission, since the route can
only see that *a* coach is logged in.

**Neither stamp is awaited.** They hang off routes whose actual job is delivering
bytes, so a notification must never be the reason a download fails. Both swallow
their own errors for the same reason — a rejected promise from a fire-and-forget
call is an unhandled one.

**Operator notifications read the `operator` table**, not an env var. The people who
should hear about a stalled hand-off are exactly the people who can log in and fix
it; a config value lets those two drift the moment an operator changes. Empty is
survivable — the send is skipped rather than crashing a webhook.

**Verified:** collecting is refused before hand-off and before release, the first
collection moves the status, the second is a no-op, and the trail reads
`draft → assigned → sent_to_coach → in_review → awaiting_approval → complete → collected`.

---

## Phase 4 · Language — ✅ **shipped 2026-08-01**

| | Ships | |
| --- | --- | --- |
| 4.1 | Admin file view shows four sets by `kind` | ✅ `FileFolders` |
| 4.2 | Step 5 derives translation need from the coach's languages | ✅ surfaced on the row |
| 4.3 | **Steps 6–7** — download originals, upload translations, two statuses | ✅ |
| 4.4 | **Steps 11–12** — the same, for the response | ✅ *one action, both directions* |
| 4.5 | Step 8's radio; records the choice; sends only that | ✅ `SendWithFileSet` |
| 4.6 | Step 13's radio | ✅ *the same component* |

**Unknown is not the same as no.** A coach with no languages recorded returns
`null` rather than "needs translation" — prompting on the strength of a blank
field would nag on every submission until someone filled it in, and a prompt
that's usually wrong is one people learn to dismiss. The row says "no languages
recorded" instead.

**One upload action serves both directions.** Steps 6–7 and 11–12 are the same
act with a different destination, so they're one function taking a `kind` rather
than two that could drift on the guard or the retention. Only the two
*translation* folders are writable — an admin overwriting an original would
destroy the record of what was actually submitted.

## Phase 5 · Operator control — ✅ **shipped 2026-08-01**

| | Ships | |
| --- | --- | --- |
| 5.1 | Purge any of the four folders now | ✅ |
| 5.2 | Reset a status to any earlier rung | ✅ |
| 5.3 | Both write to the event trail with the actor | ✅ |
| 5.4 | Step 15 — "Mark resolved" + the ⑧ thank-you | ✅ |

**Two rungs refuse to be undone**, and the reasoning is the same both times: a
status must never claim something the world can't back up. Nothing comes out of
`purged`, because the bytes are gone. Nothing goes back before payment, because
that puts a paid submission somewhere the discard path is willing to delete
outright.

**Resolving stayed manual**, as decided — and `collected` is what makes that safe.
The objection was always "he'll forget"; the answer isn't automation, it's a queue
he can filter. Only a *collected* submission can be resolved, so a thank-you can't
go out for something the customer hasn't seen.

## Phase 6 · The ending — ✅ **shipped 2026-08-01**

| | Ships | |
| --- | --- | --- |
| 6.1 | Collection +30d, or delivery +90d, whichever is later | ✅ |
| 6.2 | ⑥ states the retention window at delivery | ✅ |
| 6.3 | **Step 16** — the ⑨ warning, its own stamp, `purge_imminent` | ✅ |
| 6.4 | **Step 17** — purge all four sets, keep every record forever | ✅ |
| 6.5 | The "feedback is never swept" contradiction | ✅ resolved |

### What the build surfaced that the plan didn't

**The warning has to run *before* the purge in the same sweep, and against a
nearer cutoff.** Run the other way round, a single night could both warn and
delete — a warning in name only. Ordering the two passes is the whole guarantee.

**The warning is stamped whether or not the send succeeded.** Retrying nightly
would turn one undelivered email into seven, which is worse than the miss. This is
the opposite call from step 1's verification code, and for the opposite reason:
nobody is *blocked* on a warning.

**The clock needed columns, not just the trail.** `collectedAt` and
`deletionWarnedAt` duplicate facts `submission_event` already holds — deliberately.
The trail is history; these are the working values a nightly scan reads, and a scan
against a join is one we'd have to justify at every row. Same relationship
`submissions.status` has to its own events.

**`RELEASED_STATUSES` is derived from `isReleased`, not listed.** A literal list is
exactly what went stale when `collected` arrived, and a sweep that quietly stops
matching is a sweep nobody notices has stopped.

**Verified** against four submissions at once: collected-long-ago purged,
collected-recently warned and left alone, never-collected-but-old purged on the
backstop, just-delivered untouched. All four folders' bytes went; all four rows'
records stayed.

## Phase 7 · The status capability — ✅ **shipped 2026-08-01**

Aaron's `853edf9` shipped 7.2, the email + 6-digit code path. **7.1 followed, and
my reason for deferring it didn't survive a test drive.**

I argued a status link would expose more than the per-submission feedback link,
because it lists *every* submission for an address. True in kind — but that
exposure **already existed**: `/status` took an unverified email and returned the
list, so anyone who guessed an address got the same page without a link at all.
Deferring the link left the hole and removed the convenience.

### The design that replaced it: two doors, deliberately asymmetric

| Door | Proof | Behaviour |
| --- | --- | --- |
| **Link in a receipt** | the link *is* the proof — mailed to an address that verified at step 2 and paid at step 4 | straight in, no code |
| **Typed email on the site** | none. Anyone can type anyone's address | a 6-digit code, then in |

Asking someone who followed a link from their own receipt to prove themselves a
third time is friction that buys nothing. Asking someone who typed an address to
prove *anything* is the minimum, and it costs one email.

**One code, one grant.** The same verification now covers the list and the
downloads, rather than proving the same inbox twice on one page. The code is also
issued for *any* submission rather than only a released one — a customer
mid-review could otherwise not see their own submission at all.

**The list is worth gating**, which was the thing my earlier reasoning missed: it
carries a child's first name, a focus and a date. Not catastrophic to leak, but it
is somebody's child, and one email stops it.

Both doors render the same component, so the row a customer sees never depends on
how they arrived.

---

## 5 · Red flags — raised, and answered 2026-08-01

All four are settled. Kept in full because the reasoning is why the plan is shaped
the way it is, and the next person to ask "why this order?" deserves the argument
rather than the conclusion.

### ✅ 1 · Do the coaches read English? — **Mixed. Translation stays optional.**

This was the one that could have inverted the plan. It doesn't: **some coaches read
English, some don't, and translation is per-coach** — which is exactly the case
`coaches.languages` was built for, and exactly what the derivation at step 5 does.

So the plan order stands, and two things in it are now confirmed rather than assumed:

- **Steps 6–7 and 11–12 stay optional**, with whole numbers, and a submission whose
  coach reads English runs 5 → 8 and 10 → 13 untouched.
- **Deriving translation need is worth building**, not just convenient. With a mixed
  roster, "does this one need translating?" is a real question with a different
  answer each time — the case where remembering fails.

**Phase 4 remains the honest cut if time runs short**, but with a caveat that wasn't
there before: cutting it doesn't cost a feature, it costs *a subset of the coaching
roster*. the admin can only assign English-reading coaches until it lands.

### ✅ 2 · Is there production data to preserve? — **No real customers yet.**

**This makes Phase 1 substantially cheaper, and it is the single most useful answer
of the four.** Everything the migration had to be careful about evaporates:

| Was a risk | Now |
| --- | --- |
| existing `in_review` rows mislabelled by the semantic change | no rows to mislabel |
| `kind` rename touching live files | test rows only — rename freely |
| `submission_event` backfill vs cut over | **start empty.** Nothing worth reconstructing |
| the paid-ness `Record` misjudging a real paid submission | compiler-checked *and* nothing real at stake |

Phase 1.4 drops back from **M to S** and 1.2 loses its open question entirely.

> ### ⏳ And it changes the sequencing advice
>
> **Phase 1 is nearly free right now and gets permanently more expensive the moment
> Phase 0 completes.** A sixteen-value enum migration against an empty table is a
> `DROP` and a `CREATE`; against live paid submissions it's a careful, reversible,
> data-preserving exercise with a rollback plan.
>
> They don't compete — **Phase 0 is mostly operations** (Stripe keys, DNS, coach
> photography) and **Phase 1 is code**, so they run in parallel. But the ordering
> that matters is: **land Phase 1's migration before the first real payment.** That
> window is open now and closes exactly once.

### ✅ 3 · Response retention — **Same window. Everything together.**

Confirmed as settled: no set outlives another, which stays coherent because the
clock cannot start until the customer has the files in hand.

Two safeguards were already in the plan and now carry more weight, because they're
the *only* protection against a parent losing what they bought:

- **6.2 — ⑥ states the retention window at delivery.** Not a nicety. It's the term
  of service that makes the deletion fair, and the wording should be explicit:
  *download and keep this; we delete it 30 days after you do.*
- **6.3 — the ⑨ warning at day 23**, which is the last chance to collect again.

⚠️ **Neither is optional now.** If Phase 6 ships the deletion without the copy and
the warning, the first customer to lose a review will be right to be annoyed.

### ✅ 4 · Sixteen statuses — **All sixteen, as settled.**

The cheaper four-status version is recorded here and deliberately not taken. Each
rung is a filter the admin can pull up, and each exists because a submission can stall
there — which is the test that separates a status from decoration.

Combined with answer 2, the cost argument mostly dissolves: the expensive part of a
sixteen-value enum was always the migration, and there is nothing to migrate.

---

## Deferred by decision

The pipeline is complete; these are refinements the team has looked at, agreed the
shape of, and deliberately chosen **not** to build yet. Recorded here so a "later"
doesn't quietly become a "never", and so the reasoning survives the decision.

### Record a file's language at upload — retire the translation proxy · QA 5.9, 2026-08-31

**The gap.** Translation need is derived from the **people's** declared languages,
never the **file's** — because nothing records what language a file is actually
in. That inference is a proxy, and a fine one for a monolingual side: an
English-only customer sends English footage. It breaks for a **bilingual** side,
where either language is possible and we've recorded nothing about the file
itself. Those are the cells the matrix marks *assume-worst*: a customer who reads
both, sending to a monolingual coach, is translated because the footage *might* be
in the language the coach can't read — even on the occasions it isn't.

**The decision taken now.** Assume they don't align, and translate (Aaron's call).
It is the honest reading of what we can know, and it errs toward "the coach can
read it" over "an unreadable file was delivered". The cost is a translation leg a
bilingual customer sometimes didn't need — and translation is the expensive step —
paid to stay safe while the proxy stands. The full rule and the matrix are the
northstar in
[`_SubmissionDocumentation.md`](../../src/domains/submission/_SubmissionDocumentation.md) —
"The translation rule, from first principles".

**The real fix, when it's built.** Ask the uploader — the one person who *knows* —
what language the files are in, at **step 3**, and store it on the file. Then
`needsTranslation` compares the **file's** language against the receiver's, and
every cell of the matrix becomes certain on both legs: the assume-worst rows
collapse to their true answers, and no bilingual customer pays for a translation
they didn't need.

**The shape.**

- A `language` on `submission_file` (or a per-upload prompt that stamps it), from
  the same `LANGUAGES` vocabulary. **Migration** — a field against live shape, not
  an empty table.
- **Step 3** asks it: the customer answers for their own files, the coach for the
  response at upload; a translator's output inherits the leg it serves.
- `needsTranslation(source, target)` stays the same **subset** check — it just
  reads a *known* single language on the source side rather than the owner's whole
  declared set, so `{fileLanguage} ⊄ receiver` becomes a one-element question with
  a definite answer.
- It also gives **direction derivation** something true to work from — the leg
  runs from the file's language to the receiver's — which is what an automated
  translator match would need before translator selection is anything more than a
  human picking from a list. (That was QA 5.9's other flagged-and-deferred item;
  it and this one share the same root, and this fix unlocks it.)

**Why deferred, not dropped.** The assume-worst rule keeps the platform correct in
the meantime — never wrong toward unreadable, only sometimes cautious — so this
buys precision and a saved translation, not correctness. It changes the customer's
upload step and touches both legs, so it is worth scheduling on its own rather than
smuggling into a fix.

---

---

## Related

- [`domains/submission/_SubmissionDocumentation.md` §2](../../src/domains/submission/_SubmissionDocumentation.md) — the northstar path, the status ladder, the point of no return
- [`shared/email/_EmailDocumentation.md`](../../src/shared/email/_EmailDocumentation.md) — the nine messages and which exist
- [`domains/settings/_SettingsDocumentation.md`](../../src/domains/settings/_SettingsDocumentation.md) — the timer taxonomy
- [`_NomenclatureLaw.md`](../../laws/_NomenclatureLaw.md) — the settled vocabulary and how it's spelled
- [OPERATIONS.md](../../OPERATIONS.md) — Phase 0 in detail
