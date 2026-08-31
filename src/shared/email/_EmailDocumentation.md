# email — `src/shared/email/`

The **email seam** — transport plus the brand shell — and the matrix of who gets
told what.

The transport is domain-less: `sendEmail()` and `emailShell()` know how to send
and how a message should look, and nothing about what any particular message
means. Each message itself lives in the domain that owns its event, as
`api/xEmail.ts`. This doc is where the whole set is accounted for, because "which
emails exist and which don't" is a question no single domain can answer.

---

## Where we are now — 2026-08-01 (evening)

**All nine built**, plus two off-spine messages. The set grew from six this
morning when the northstar path added two download confirmations and a deletion
warning; all three landed the same day, along with the four that tell the admin
something.

**The pattern worth keeping:** five of the nine tell the admin something, and the
reason they exist is that a queue which doesn't announce its own arrivals has to
be *watched* instead of used.

**Two sends are not best-effort in the way the others are.** The verification
code (①) blocks the customer, so a failure stops the flow rather than being
logged. The deletion warning (⑨) is the opposite: it is stamped whether or not
it sent, because retrying nightly would turn one missed email into seven. Both
are departures from ADR 004's default, and both are deliberate.

### Superseded — the state this morning

**Four of nine built.** The set grew from six on 2026-08-01, when the northstar
path added two download confirmations and a deletion warning. The transport is
stable and the approval gate has landed, so most of what's missing is templates —
but three of the five gaps need a **trigger that doesn't exist yet**, which is the
real work.

---

> Where each message sits in the submission's life — who drives that stage and
> what else changes there — is the canonical path in
> [`submission/_SubmissionDocumentation.md` §2](../../domains/submission/_SubmissionDocumentation.md).
> The circled numbers below match its table.

## Who gets told what

**Status: partly built.** This is the agreed target (the admin, 2026-07-30, extended
2026-08-01), pinned here so the gaps are visible rather than remembered.
**Four of the nine exist.**

**the admin is the notable pattern.** Five of the nine tell him something, and four of
those five don't exist. Today he learns that a payment landed, that a coach picked
the work up, that a response is waiting, and that a customer collected — by
*looking*. Every one of those is a moment the pipeline moved without him, which is
exactly when a queue stops being trustworthy.

Two of the new messages hang off a **download**, which nothing currently observes.
They can't be written as templates alone; they need the stamp that step 9 and step
14 describe.

Every send is **best-effort** — a failure logs and never throws into a webhook or
a portal action ([ADR 004](../../../docs/decisions/004-best-effort-email.md)). The one
exception in spirit is the verification code: it can't fail silently and leave a
usable product, because the customer is blocked on it.

---

## The nine messages

Numbered to match the path table's ①–⑨, so the two can be read side by side.

| # | Step | Trigger | To | Status |
|---|---|---|---|---|
| ① | 1 | Email verification code | customer | ✅ **built** — `domains/verification/api/verificationEmail.ts` |
| ② | 4 | Payment succeeded, submission accepted | customer **+ the admin** | ✅ **built** — receipt to the customer, arrival notice to the admin |
| ③ | 8 | Handed to the coach | coach | ✅ **built** — `domains/coach/api/coachEmail.ts`, carries the customer details and a per-file download link |
| ④ | 9 | **Coach picked the work up** | the admin | ✅ **built** — fires on the coach's first download |
| ⑤ | 10 | Coach submitted their response | the admin **+ coach** | ✅ **built** — `domains/feedback`, to the admin and the coach |
| ⑥ | 13 | the admin approved the response → released | customer | ✅ **built** — and it **states the retention window** at delivery |
| ⑦ | 14 | **Customer collected their feedback** | the admin | ✅ **built** — fires on the customer's first download |
| ⑧ | 15 | the admin marks the submission resolved | customer | ✅ **built** — on “Mark resolved”, carrying the retention deadline |
| ⑨ | 16 | **Uploads will be deleted in a week** | customer | ✅ **built** — the only *scheduled* message in the set, stamped so it can't send twice |
| ⑩ | 6 | **Handed to the intake translator** | translator | ✅ **built** 2026-08-31 — `domains/operator/api/translatorActions.ts`, the same template as ③ with `role: "translator"` |
| ⑪ | 12 | **Handed to the feedback translator** | translator | ✅ **built** 2026-08-31 — the response leg's counterpart |

Three of these are new on 2026-08-01: ④, ⑦ and ⑨.

**⑩ and ⑪ break the numbering's own rule, deliberately.** The handles were
issued in step order, so a message for step 6 ought to sit between ② (step 4)
and ③ (step 8). It cannot. **The handle is a persisted key** — it is written to
`submission_event.label` and read back by `sent()` in `stageChain.ts` — so
renumbering ③–⑨ to make room would orphan every historical trail row and every
line that measures itself by one. Appending is the only non-destructive move, so
the numbers are issue order from here and the **step column** is what to read
for sequence.

**Both were missing entirely until 2026-08-31**, and the way they were missing is
worth keeping. `sendForTranslationAction` moved the rung and sent nothing. The
rung is named `sent_to_intake_translator`; the stage chain then measured the
hand-off as done by *reaching that rung*. Ladder asserted the send, chain
confirmed it from the ladder, nothing observed an email — so every internal
signal agreed, and only an empty inbox disagreed (Ben, QA 5.9.14). The lesson
generalises past this bug: **a send may only ever be measured by the send.** Both
lines now key off `sent(label)`, which is what ③ always did and is why the coach
hand-off never had this problem.

### What actually happened to a message — 2026-08-02

`sendEmail` returns `{ ok, id }`, and `ok` means one specific thing: **Resend
accepted it**. Not that it arrived. The gap between those two is where a mistyped
address lives, and for ① — the one message a customer is *blocked* on — that gap
was indistinguishable from someone being slow to check their inbox.

`POST /api/webhooks/resend` closes it. Svix-signed, verified by hand rather than
adding a dependency to do one `createHmac`, and it **refuses every delivery when
`RESEND_WEBHOOK_SECRET` is unset** — losing delivery tracking is a degraded
trail, but an open endpoint that writes to it is a forgeable one.

| Outcome | Means |
| --- | --- |
| `sent` | Resend accepted it. All the send path can claim |
| `delivered` | the receiving server took it |
| `bounced` | it will never arrive |
| `complained` | marked as spam |
| `failed` | Resend gave up |

**Outcomes append, they don't update.** Overwriting "we sent it" with "it
bounced" loses that both were true and when — and a delivery three seconds later
reads very differently from one three minutes later.

**Opens are deliberately not tracked.** They work by embedding a pixel, and Apple
Mail Privacy Protection has pre-fetched images by default since iOS 15 — so a
large share of "opened" events fire when nobody looked, while a reader with
images off registers nothing when they did. Wrong in both directions, on the row
that matters most.

#### What a bounce does, and doesn't

**On ①, before payment:** the next thing the customer does tells them. A bounce
arrives *after* they've been moved to "enter your code" and nothing can push it
to them, so the verify and resend paths both check, and either returns them to
step 1 with wording that matches **what kind of bounce it was**:

| Bounce | What they're told |
| --- | --- |
| `hard` | *"That email address doesn't exist. Please check it for a typo and try again."* |
| `soft` | *"That inbox couldn't accept our email. It may be full, so please try a different address."* |
| unrecognised | *"We couldn't deliver your code to that address. Check it for a typo, or try a different email."* |

**Unknown is a real answer, not a fallback to `hard`.** Resend has moved where it
puts the classification before, and guessing wrong would tell someone with a full
mailbox that their address doesn't exist. The third wording is true in every case
and offers both remedies, so a missing classification costs detail rather than
accuracy. Without that they'd type a code that was never delivered and be told
"that code doesn't match" — true about the code, and a lie about what happened.

**It does not delete anything, and that's the point.** A bounce can only occur
before verification, and uploading *requires* verification — so there are never
any files to scrub. The row is simply unverifiable, therefore unpayable, and the
abandonment sweep collects it like any other dead attempt.

**On anything after payment, it does nothing automatic.** A receipt or a feedback
link bouncing is a real problem and it is **the admin's** — it shows in the trail and
in the row, and nothing here acts destructively on a submission somebody paid for.

### Off the spine

Two messages belong to side-paths rather than to a stage, so they carry no number
— there's no rung for them to sit on.

| Trigger | To | Status |
|---|---|---|
| A card was declined | customer | ✅ **built** — `domains/payment/api/paymentEmail.ts`, carries a link back into the flow |
| Status-page access code | customer | ✅ **built** — `domains/feedback/api/feedbackEmail.ts` |

**The decline message is deliberately vague about the reason.** Stripe's own
wording is shown inline on the page, where it's actionable; repeating
"insufficient funds" in an email that may be read over someone's shoulder isn't
our call to make. What it *does* say is the part that matters: nothing was
charged, the files are still here, and finishing takes one click.

### Outside the submission arc

The nine above are the *submission's* messages, which is why they carry the path
table's numbering. Two messages exist that aren't on that path at all — both
operator-facing:

| Trigger | To | Status |
|---|---|---|
| Operator requested a password reset | operator | ✅ **built** — `domains/account/api/passwordResetEmail.ts`, one-hour link |
| An operator is added, or a role is newly assigned to them | operator | ✅ **built** — `domains/operator/api/operatorWelcomeEmail.ts`, names the role and links to `/login` with a "Forgot password" nudge |

They're listed here because this doc's job is knowing which emails exist, not only
which ones a submission causes.

**The password reset is the second message in the product that best-effort sending
serves badly** — the same shape as the verification code: the person is *blocked*
on it, so a silent failure isn't degradation, it's a dead end. Two instances is a
pattern, and it's worth deciding whether "blocking" messages should report their
failure rather than swallow it.

**The operator welcome — 2026-08-29 (Ben, QA 5.13.2 / 5.13.4 / 5.13.5).** Unlike
the reset, it's best-effort in the ordinary way: the account exists whether or not
the mail lands, so a failure logs and never throws into the action that created it.
It fires from **two** places for the same reason — a person only *starts* holding a
role in two ways:

- when an operator is **created**, on the first grant (`createProfiledOperator`
  in `operatorProfileApi.ts`);
- when a role is **newly granted** to an existing operator (`saveRoleAction`), and
  *only* then — the send is guarded on the role not already being held, so a pause,
  an unpause or a settings re-save mails nothing, while a re-grant after a revoke
  reads as not-held and mails again. Assigning coach *and* translator is two saves,
  so two emails.

The role rides as a **parameter, not a filename** (`sendOperatorWelcomeEmail(to,
name, role)` / `buildOperatorWelcomeEmail(name, role)`): admin, coach and translator
get one message with one word changed, so a fourth role changes a string rather than
adds a template. **No password is ever included** — we hold only the bcrypt hash, so
the copy points at "Forgot password" instead of relaying a secret out of band. It
passes its **own footer** through `emailShell`'s fourth argument (below), because a
coach is not "about your coaching submission".

**④ and ⑦ are the same message twice**, pointed at the same recipient — "a
download happened, the pipeline moved". Worth building as one mechanism with two
subjects rather than two templates that drift.

**⑥ carries a deadline now, and it is not optional.** Everything is swept together
at step 17 — including the coach's response, the thing the customer actually bought
— so ⑥'s retention line and ⑨'s warning are the *only* protection against a parent
losing a review they can't recreate. Telling someone at delivery is a term of the
service; telling them seven days before deletion is a surprise. Wording should be
explicit: *download and keep this; we delete it 30 days after you do.*

⚠️ **If the deletion ships without these two, the first customer to lose a review
will be right to be annoyed.** They are part of Phase 6, not a follow-up to it.

**⑨ is unlike every other message here.** The other eight fire from an action
someone took. This one fires because *time passed* — it must be found by a sweep,
sent exactly once, and guarded by its own stamp. See the timer taxonomy in
[`settings/_SettingsDocumentation.md`](../../domains/settings/_SettingsDocumentation.md).

Lifecycle as built:

`draft → awaiting_payment → new → assigned → in_review → awaiting_approval → complete`

The northstar inserts **`sent_to_coach`** between `assigned` and `in_review`, so
that ④ has a state to move *from* — without it, "picked up" is indistinguishable
from "emailed".

Still to add for ⑧: a **`resolvedAt`** timestamp (not a status — see below). ④ and
⑦ each need a download stamp; ⑨ needs a warning stamp.

---

## The approval gate — built 2026-07-30

*Kept because the reasoning still explains the shape of the workflow.*

These were never two templates. Together they inserted **an approval step into
the coach workflow**, which is now in place:

**Before:** the coach uploaded their feedback file and it went straight to the
customer. the admin never saw it.

**Now:** the coach uploads → the submission sits at `awaiting_approval` → the admin
approves → the customer is told. The one piece still missing is *telling* the admin
it's waiting (#4); today he has to spot it in the queue.

What it took:

1. ✅ **A new status** between `in_review` and `complete` — `awaiting_approval`.
2. ✅ **Coach upload stops completing the submission.** It sets
   `awaiting_approval` and correctly does *not* stamp `completedAt` — that starts
   the retention clock, and the files are still needed for review.
3. ✅ **An admin approve action** — `approveAndComplete` sets `complete`, stamps
   `completedAt`, and sends message #5.
4. ✅ **Message #3 on assignment** — `assignCoachAction` sends it.
5. ❌ **Message #4** — nobody tells the admin the response is waiting.

Until (2) exists, `feedbackEmailedAt` and the customer email fire from the wrong
place. Note the ordering trap: `completedAt` is what the retention sweep counts
from ([ADR 012](../../../docs/decisions/012-retention-and-operator-settings.md)), so
whichever action ends up owning "complete" **must** stamp it. That exact omission
was a live bug on 2026-07-30 — the status was set without the timestamp, and
completed submissions were never swept.

---

## Decided 2026-07-30 (the admin + Ben)

**#6 fires when the admin marks the submission resolved** — a portal action, not a
timer and not a customer confirmation. It keeps the judgement with the person who
can actually make it, at the cost of one more thing to remember.

Recommendation when it's built: **`resolvedAt` as a timestamp, not a status.**
The lifecycle is already six states and the queue doesn't need a seventh —
"resolved" is an event on a finished submission, not a distinct kind of work.
`completedAt` / `paidAt` set the precedent.

⚠️ **It collides with retention.** Files are swept 24h after `completedAt`, so by
the time the admin resolves a submission the uploads are usually gone. The resolved
email must not promise access to them, and the portal should say plainly that
it's resolving a submission whose files have been deleted.

**"the admin" resolves to the `admin` user's own email**, read from the `users` row —
one home for the fact, and it survives a change of operator with no redeploy.
`site.email` (`contact@baseball-sensei.com`) stays the *public* contact address,
and `EMAIL_FROM` is who mail is sent *as*. Three jobs, three homes; collapsing
them would mean a change of operator silently changing the public address.

If notifications should ever go to a shared inbox instead of a person, that's the
moment to revisit — not before.

**The approval gate is pinned, not scheduled.** Until it's built, the coach's
upload continues to complete the submission and email the customer directly.

---

## Where a send belongs

The domain that owns the *event* owns the send — not a central mailer:

- `verification/` → the code
- `payment/` → the receipt (and the admin's copy of it)
- `coach/` → assignment
- `feedback/` → coach-submitted, approved-and-released, resolved
- `account/` → the operator password reset
- `operator/` → the operator welcome (create + role assignment), the hand-off notices

`shared/email` stays transport plus the shell: `sendEmail()` and
`emailShell(heading, body, cta?, footerNote?)`, and nothing about what any
particular message means.

**The shell's footer is overridable — 2026-08-29.** `emailShell` grew an optional
fourth argument, `footerNote`. It **defaults** to *"This is an automated message
about your coaching submission."*, which fits the customer messages that are most
of the set. An **operator-facing** message passes its own line instead — the
welcome email does (*"You're receiving this because an administrator added you as
an operator."*), because telling a coach a note is "about your coaching submission"
is a small lie about who they are. Everything else — every customer message, and
the hand-off notices that don't override — takes the default.

**Escape customer-supplied values.** Filenames and player names land in HTML;
`paymentEmail.ts` has the helper and any new template needs the same treatment.
