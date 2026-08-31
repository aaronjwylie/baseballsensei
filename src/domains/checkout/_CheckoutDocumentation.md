# checkout — `src/domains/checkout/`

The **checkout slice** — the four-step path a customer walks from "I want
feedback" to "you've been charged".

---

## 1 · The northstar

It owns the **sequence**, not the steps.

| # | Step | Panel lives in | Because |
|---|---|---|---|
| 1 | Player details | `domains/submission/ui/PlayerInfoForm` | it collects a Submission |
| 2 | Verify email | `domains/verification/ui/VerifyPanel` | it proves an address |
| 3 | Upload files | `domains/upload/ui/UploadPanel` | it moves bytes |
| 4 | Payment | `domains/payment/ui/PaymentPanel` | it charges a card |

This slice puts them in order and holds the verbs that move between them.

**It covers steps 1–4 of a longer path.** Everything after payment — assignment,
hand-off, the coach's response, approval, retention — is in
[`submission/_SubmissionDocumentation.md` §2](../submission/_SubmissionDocumentation.md),
which is the canonical lifecycle. That is why it depends on four domains
and **nothing depends on it** — it's the composition root for the customer flow,
the way `app/` is for a page.

### The invariants

- **One route, four steps.** The steps don't get their own URLs. ADR 005 chose
  Elements so payment feels like part of the product rather than an errand; a
  full page navigation between steps reintroduces exactly the seam that bought,
  and the client secret would have to travel through a URL to survive it.
- **There is no resume.** Every page load starts at step 1. `resolveFlowState()`
  reads no cookie at all; the flow cookie is a *capability* the server uses to
  answer "which submission may this request touch", never a memory of where
  someone was. Only a completed payment earns retention, so a half-finished
  submission is a scratch pad.
- **Every action re-derives the submission from the cookie.** None of them takes
  a submission id from the browser, so there is nothing to tamper with.
- **Order is a product decision, made in `model/steps.ts`.** Verification is
  second because everything after it depends on being able to reach the customer;
  payment is last because nobody should pay for a submission whose upload then
  fails ([ADR 009](../../../docs/decisions/009-upload-before-payment.md)).

---

## 2 · Where we are now — 2026-08-29

- ✅ **A cleared charge is confirmed even when the flow cookie is gone.**
  `confirmPaymentForFlow` now reads the paid submission from the **intent's own
  `metadata.submissionId`**, not the cookie. When the cookie is present it still
  must match (a forged intent id can't fulfil someone else's submission); when
  it's absent — a www/non-www hop or a window that lapsed during the 3-D Secure
  detour drops the host-only cookie — it falls back to the intent's reference and
  fulfils the submission the charge already names, idempotent with the webhook
  (ADR 003). This supersedes the old "we can't show it to *this* browser" note
  below: a paid customer is now shown success rather than a failure screen.
  `confirmPaymentAction` no longer resets the flow on failure — a genuine failure
  is the only way through, so it shows the error rather than restarting a paid
  customer.
- ✅ **The decline path has a second caller from the browser** (QA 2.4.3).
  `reportDeclineAction` lets the browser report its own decline: success already
  had two callers (webhook + inline confirm, ADR 003), but failure had only the
  webhook, so one disabled endpoint silently removed the card-declined recovery
  email. The action re-derives the submission from the flow cookie and re-reads
  the intent from Stripe (never the browser's claim), and `handleFailedPayment`
  is idempotent with the webhook. Best-effort and quiet — the customer is already
  looking at Stripe's decline message.

### 2026-08-01

- ✅ **"Gone" is a flag, not a sentence.** Every action answers
  `{ ok, error, gone? }`, and the flow reads the flag: a scrubbed submission
  resets to step 1 with an explanation rather than rendering an error beside a
  form that will never work again. Without it a customer could sit on step 3
  uploading into something the server swept ten minutes ago.
  Every action can return it, because every action re-derives the submission from
  the flow cookie and any of them can find it missing.
  The flag has grown two companions the flow also reads: `keepDetails` (a bounced
  code — reset to step 1 but keep the typed details to fix just the address) and
  `locked` (out of verification guesses — retire the code input).
- 🔶 **~~A lapsed window at the payment step says something true.~~** *(superseded
  2026-08-29 — see above.)* Then: if the card did go through, the webhook fulfilled
  the submission independently (ADR 003) and a receipt arrived, but we couldn't
  show it to *this* browser, and the copy said exactly that. Now the return trip
  confirms a cleared charge from the intent's own reference, so this browser is
  shown success too.
- ✅ **The flow window is 30 minutes, sliding, and it's the only clock** — the
  verification code expires on the same one.


### Before 2026-08-01

- ✅ **All four steps built** and walked end to end in a real browser: step 1 → a
  code → two uploads → Stripe Elements showing `Pay CA$80.00`.
- ✅ **Resume is gone.** Reloading mid-flow starts at step 1 and the unfinished
  submission is discarded, files and all — matching the invariant above. It used
  to restore the step and the file list; that was removed on 2026-07-31 once
  "only a completed payment earns retention" became the rule.
- ✅ **Server Actions, not API routes.** The browser needs a typed answer, not an
  HTTP contract, and every verb reads the flow cookie anyway. Only the things
  that genuinely need HTTP stayed as routes: raw upload bodies, the Blob token
  handshake, Stripe's webhook, and the redirect return.
- ✅ **No effect on mount.** The 3-D Secure return trip is confirmed server-side
  in `/api/payment/return`, which then forwards to `/start`. An earlier version
  did it in a `useEffect` and set state on mount; that's slower, and React's own
  lint rule rejects it.
- 🔶 **`done` is a resume state, not a step.** It has no indicator position, but
  a paid submission has to be somewhere the flow can be *loaded into* after a
  redirect — hence `FlowStep = CheckoutStep | "done"`.
- 🔶 **The flow cookie deliberately survives payment.** It's what lets the
  confirmation name the player and count the files after a cold page load.
  "Send another video" is what lets go of it.
- 🔶 **No abandoned-cart email.** A customer who stops at step 3 hears nothing;
  their files are swept after 24h. Worth revisiting once there's volume.

---

## 3 · Where we came from

**Before 2026-07-30** the flow was two steps — player info, then payment — held
in `domains/payment/ui/SubmitFlow.tsx`, with upload on a separate `/upload` page
reached after checkout.

- **Payment moved last** ([ADR 009](../../../docs/decisions/009-upload-before-payment.md)),
  which is the change everything else follows from.
- **The composition moved out of `payment/`.** A flow spanning four domains
  living inside one of them was already a stretch at two steps; at four it would
  have made `payment` the de-facto owner of the customer journey. A slice whose
  whole job is ordering other slices earned its own folder.
- **`PlayerInfoForm` moved to `submission/ui/`.** It collects a Submission; it
  was only in `payment/` because the flow was.
- **The form stopped submitting itself.** It now takes an `onSubmit`, because the
  parent owns what "continue" means — which is what lets one form serve both the
  first visit and the customer coming back from step 2 to fix a typo.
