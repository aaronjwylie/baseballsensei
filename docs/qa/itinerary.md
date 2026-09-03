# QA itinerary — cover to cover

**This is the manual pass: what a person clicks, in what order.** Its sibling
[`qa-plan.md`](qa-plan.md) is the automation strategy — what CI should gate and
what deserves a test. They answer different questions and neither replaces the
other: a machine cannot tell you the hero photograph did not load, and a human
should not be re-checking the status ladder by hand on every merge.

Where a check here has since been automated, delete it from this file and say so
in `qa-plan.md`. Two documents drifting apart is the failure mode.

Every feature, in the order it makes sense to exercise them. Each check has an
id (`2.3`) so we can refer to one precisely while we run it.

**How to use this:** work top to bottom. Phase 0 is genuinely blocking — the
rest either can't be tested or shouldn't be run until it's done. Record results
in the table at the bottom as you go.

**Two markers, and they are read by the build.** An expectation opening with **⚠️** is a row to be
picky about — a decision to ratify, or a failure that hurts. One opening with **✅** is already settled.
`npm run qa:build` turns both into badges on the shared record.

**Instrumentation:** with the QA probe armed, I see every click, navigation,
form submit and error as you go, so you don't need to narrate. You do need to
tell me what you *expected* when something looks wrong — the probe records what
happened, never what should have.

---

## Phase 0 · Prerequisites — do these first

Mostly settled already. Kept visible because each one is a thing that would silently ruin a later
phase if it were not true.

| # | Do | Why it blocks |
| --- | --- | --- |
| 0.1 | **Close the Supabase Data API.** Settings → API → Exposed schemas, remove `public`. **Dashboard only — no one but you can do this.** | ✅ Every table is currently readable with the publishable key, including password hashes and children's names. QA generates *more* real data into a database anyone can read. See OUTSTANDING §0. Migration `0021` revokes the underlying grants on deploy as defence in depth, but the dashboard setting is the fix.|
| 0.2 | **Rotate the publishable key**, and the production DB password. | Both are known-exposed. |
| 0.3 | **Reactivate `ben.j.wylie@gmail.com`.** Run [`phase-0.sql`](phase-0.sql) §1–§2 in the Supabase SQL editor. | ✅ It reads `is_active = false` because the operator edit form used to write that on every save — an absent checkbox read as `=== "on"`. Aaron fixed the cause in `0d6bbf0`; the row it already wrote still needs repairing. You cannot run Phase 5 without an admin login.|
| 0.4 | **Nothing.** Stripe stays in **test mode** for the pass. | ✅ Established 2026-08-26: production runs on test keys (`livemode=False` on a real paid submission), and the whole path already works — those payments reached `new` and `sent_to_coach`, so intent, webhook, fulfilment and ladder all ran. Test mode is *better* for QA: decline and 3-D Secure can be triggered on demand, and nothing is charged. **Phase 0a moves to the end** — see Phase 11.|
| 0.5 | **Confirm `NEXT_PUBLIC_SITE_URL` is `https://www.baseball-sensei.com`** in Vercel, then redeploy. | It builds the links inside customer emails *and* the 3-D Secure return target. It is inlined at build time, so it needs a redeploy, and a mismatch strands a customer **after** they are charged. |
| 0.6 | **Decide the Basic Auth question.** Leave the gate on for QA. | ✅ With it on, only you can reach the site — which is what you want while generating test submissions.|
| 0.7 | **Set `QA_TOKEN`** in Vercel → Production, then redeploy. | ✅ Arms the instrument. It is already generated and sitting in `.env.local`; `grep '^QA_TOKEN=' .env.local \| cut -d= -f2- \| pbcopy` puts it on your clipboard without it passing through a chat log. |
| 0.8 | **Arm your browser**: visit `/api/qa/session?token=<QA_TOKEN>`. | ✅ You should be redirected home. Nothing visible changes — that is correct.|
| 0.9 | **Confirm the version** in the record's own version picker matches the one you were told, and that its label describes the change. | ⚠️ A shared record acquires copies — a pinned link, a stale tab. The host's number is the version; we do not keep a second one, because a page that republishes itself cannot carry an accurate copy of it. |
| 0.10 | **Mark one check, then have the trail read back.** | ⚠️ The record carries its own instrumentation (Q15), but it cannot post from the viewer sandbox — the trail travels only when the page publishes, which is when somebody marks something. Marking is what proves it works. |

### ~~Phase 0a~~ · moved to Phase 11

Going live is a credentials swap, not a code change, and doing it first would
mean every payment check costs a real charge and a refund — while removing the
ability to test a decline or 3-D Secure at all. The steps now live at the end of
this document.

<details>
<summary>Original Phase 0a steps (kept for reference — run them at Phase 11)</summary>

### Stripe production setup

| # | Do | Check |
| --- | --- | --- |
| 0a.1 | Stripe dashboard → **Developers → API keys**, live mode. Copy the secret key (`sk_live_…`) and publishable key (`pk_live_…`). | |
| 0a.2 | Vercel → Environment Variables → **Production**: set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. | The publishable one is `NEXT_PUBLIC_*` and inlined at build — it needs a redeploy to take. |
| 0a.3 | Stripe → **Developers → Webhooks → Add endpoint**: `https://www.baseball-sensei.com/api/webhooks/stripe`. | `/api` is excluded from the Basic Auth gate, so Stripe can reach it while the site is closed. |
| 0a.4 | Subscribe to **`payment_intent.succeeded`** and **`payment_intent.payment_failed`** only. | Two events, both handled. Extra events are noise the handler ignores. |
| 0a.5 | Copy the endpoint's signing secret (`whsec_…`) → Vercel `STRIPE_WEBHOOK_SECRET` (Production). | **Test and live have different signing secrets.** A test-mode secret fails every signature check in production, silently, and payments never mark as paid. |
| 0a.6 | **Redeploy** so the inlined publishable key and the env vars take effect. | |
| 0a.7 | In Stripe, confirm the endpoint shows a successful `200` after your first real payment (2.4). | This is the check that the whole chain works. |

</details>

---

## Phase 1 · Public pages

Three of these are judgement calls made against Audrey's file rather than defects to find — 1.1.6,
1.1.7 and 1.1.10. If one of them looks wrong, that is a decision to argue with, not a bug.

**1.1.15–1.1.24 were added on 2026-08-27**, after `MobileNav` shipped mid-setup (#11, #12). The surface
did not exist when this phase was written, which is why it had no checks — an itinerary shaped like
yesterday's codebase, caught before it was tested rather than after.

### 1.1 Landing (`/`)

| # | Check | Expected |
| --- | --- | --- |
| 1.1.1 | Page loads, hero photograph renders | Header floats over the photo, wordmark legible |
| 1.1.2 | Headings are condensed (Oswald), body is Lexend | If the type looks like one family, the font swap didn't deploy |
| 1.1.3 | Claim ticker scrolls | Six claims, looping seamlessly |
| 1.1.4 | Nav links: How it works / Coaches / Pricing / FAQ | Each scrolls to its section |
| 1.1.5 | Contact nav link | Goes to `/contact` |
| 1.1.6 | Three step cards render with images and badges **1, 2, 3** | ⚠️ Not "1, 1, 1"|
| 1.1.7 | Coach section: photo, round inset, stats | ⚠️ Eyebrow is **blue** here, not lime|
| 1.1.8 | Price matches whatever `/admin/settings` currently shows | ⚠️ Deliberately no number here — this check named $80, the operator changed it to $144, and the check became wrong while the page stayed right. Change it in 5.6 and confirm it follows |
| 1.1.9 | FAQ: first row open, others closed; click to expand | `+` becomes `−`; keyboard (Tab + Enter) works |
| 1.1.10 | Closing strip shows 4 photographs | ⚠️ |
| 1.1.11 | Every "Get coach feedback" / "Start now" button | All go to `/start` |
| 1.1.12 | Footer: logo, 5 links, Check status, terms, copyright | |
| 1.1.13 | **375px** — resize or use a phone | Nothing overflows horizontally; ticker still works |
| 1.1.14 | Reduced motion (OS setting) | Ticker stops, no layout break |
| 1.1.15 | **375px** — the five inline nav links are gone, a **menu button** is there instead | Never both at once. Above `md` the button must vanish |
| 1.1.16 | Tap the menu button | Panel drops below the header bar on a **solid dark ground** — the hero photo must not show through it |
| 1.1.17 | The panel's links | The same five as the footer: How it works · Coaches · Pricing · FAQ · Contact |
| 1.1.18 | Tap one | Panel closes **and** it goes to that section |
| 1.1.19 | Open it, then tap the page outside the panel | Closes |
| 1.1.20 | Open it, press Escape (iPad keyboard, or a desktop window at 375px) | Closes |
| 1.1.21 | Watch the button as you open and close | Icon flips hamburger ↔ ✕, and its label reads "Open menu" / "Close menu" |
| 1.1.22 | **320px** (iPhone SE) — the menu button | ⚠️ Fully on screen, not clipped. This was #12's fix — confirm it took |
| 1.1.23 | Below `sm`, "Get coach feedback" | In the panel, and **not** also in the bar — never in two places |
| 1.1.24 | Open the panel, then widen the window past `md` | ⚠️ Panel anchors to a hard-coded 79px header offset. If the bar's height ever changes, the panel detaches from it — check it doesn't strand mid-air |

### 1.2 Contact (`/contact`)

| # | Check | Expected |
| --- | --- | --- |
| 1.2.1 | Page loads on dark ground | |
| 1.2.2 | Submit empty | Four field errors, nothing sent |
| 1.2.3 | Bad email (`foo@`) | "valid email address" |
| 1.2.4 | Message under 10 chars | "at least a sentence" |
| 1.2.5 | Leave consent unchecked | "Please agree to the privacy policy" |
| 1.2.6 | Privacy policy link | Goes to `/terms` — **which is a placeholder**; note it |
| 1.2.7 | Valid submit | Form is **replaced** by "Message sent" |
| 1.2.8 | Check `contact@baseball-sensei.com` | Mail arrives, subject names the sender |
| 1.2.9 | **Hit reply on that mail** | ⚠️ Goes to the address *you typed in the form*, not to ourselves|
| 1.2.10 | Message body | Your text, intact, and any `<tags>` shown as text not markup |
| 1.2.11 | Submit a second time | Works; no duplicate-send guard needed |

### 1.3 Terms (`/terms`)
| 1.3.1 | Loads, says it is a placeholder | Flag for legal copy |

### 1.4 Not-found / errors
| 1.4.1 | Visit `/nonsense` | A 404 page, not a stack trace |
| 1.4.2 | Visit `/status/garbage-token` | A handled "not found", not a crash |

---

## Phase 2 · The customer flow (`/start`) — the money path

Run this **twice**: once abandoning partway (2.7), once to completion. Test cards — success
`4242 4242 4242 4242` · decline `4000 0000 0000 0002` · 3-D Secure `4000 0025 0000 3155`. Any future
expiry, any CVC.

### 2.1 Step 1 — details

| # | Check | Expected |
| --- | --- | --- |
| 2.1.1 | Step pill reads **"Step 01 — About you"**, progress shows 1 of 4 | |
| 2.1.2 | Submit empty | Field-level errors |
| 2.1.3 | Invalid email | Rejected |
| 2.1.4 | Player age: `0`, `200`, `abc` | Rejected sensibly |
| 2.1.5 | Focus dropdown | Hitting / Pitching / Fielding / Catching / Other |
| 2.1.6 | Language choice | Defaults to English; both selectable |
| 2.1.7 | Notes field | Labelled "Notes for your coach", Audrey's example as placeholder |
| 2.1.8 | Submit valid | Advances to step 2; **code email sent** |
| 2.1.9 | If the code email fails to send | ⚠️ You are **held on step 1** with an error — not advanced|

### 2.2 Step 2 — email verification

| # | Check | Expected |
| --- | --- | --- |
| 2.2.1 | Code email arrives, 6 digits | Check spam too |
| 2.2.2 | Wrong code | Inline error, stays put |
| 2.2.3 | Wrong code **5 times** | Locked out; must reissue |
| 2.2.4 | "Resend" | New code arrives; the **old one stops working** |
| 2.2.5 | Use `bounced@resend.dev` at step 1 (Resend's bounce simulator — a real dead domain is accepted and never bounces, so it can't be used here), reach step 2 and **wait without typing** | You are told the address didn't receive it and sent back to fix it. ⚠️ No button to press — the page checks itself a few seconds in, and the verify/resend actions re-check. Needs the bounce reaching the webhook (9.5.1) |
| 2.2.6 | Go **back** to step 1 and change the email | Verification resets; a new code goes to the new address |
| 2.2.7 | Correct code | Advances to step 3 |

### 2.3 Step 3 — upload

| # | Check | Expected |
| --- | --- | --- |
| 2.3.1 | Pill reads "Step 03 — Show your coach"; body quotes the real file limit | |
| 2.3.2 | Dropzone reads "Click to upload or drag and drop" | |
| 2.3.3 | Upload one small video | Progress, then listed |
| 2.3.4 | **Upload a file over 4.5 MB** | ⚠️ Must succeed — this is the direct-to-Blob path; failure here means `/api/upload/blob` isn't being used in production|
| 2.3.5 | Upload a photo and a PDF | Accepted |
| 2.3.6 | Upload a disallowed type (`.exe`) | Refused with a clear reason |
| 2.3.7 | Exceed the file-count limit | "That's the maximum of N files" |
| 2.3.8 | Exceed the size limit | Refused, names the limit |
| 2.3.9 | Remove a file, add another | Works |
| 2.3.10 | Continue | Advances to step 4 |

### 2.4 Step 4 — payment · **test mode**

Test cards: success `4242 4242 4242 4242` · decline `4000 0000 0000 0002` ·
3-D Secure `4000 0025 0000 3155`. Any future expiry, any CVC.

| # | Check | Expected |
| --- | --- | --- |
| 2.4.1 | Pill reads "Step 04 — Checkout"; amount matches settings | |
| 2.4.2 | Card field renders (Stripe Elements, on our page) | Not a redirect to Stripe |
| 2.4.3 | **Declined card** (`4000 0000 0000 0002`) | ⚠️ Error shown; **you stay on step 4 with files intact**; a "way back in" email arrives|
| 2.4.4 | **3-D Secure card** (`4000 0025 0000 3155`) | ⚠️ Redirects, authenticates, returns to `/start?paid=1` — **not** to a broken URL|
| 2.4.5 | Successful payment | Confirmation state |
| 2.4.6 | Stripe dashboard → the webhook endpoint | `payment_intent.succeeded` delivered, `200` |
| 2.4.7 | Receipt email | Arrives, **lists every uploaded file** |
| 2.4.8 | Admin notification email | An admin is told a payment landed |
| 2.4.9 | Pay, then **refresh** `/start` | Clean step 1 — no resume, no double charge |

### 2.5 Confirmation
| 2.5.1 | "You're all set", file count and player name correct | |
| 2.5.2 | "Send another video" | Returns to a clean step 1 |
| 2.5.3 | "Check your status" | Goes to `/status` |
| 2.5.4 | **Every admin gets the "payment arrived" mail** — check each address in `/admin/operators` with the `admin` role | ⚠️ All of them, not just the first. Historically this failed whenever there was more than one recipient — unproven against current code |
| 2.5.5 | If any ② send fails, the trail says **why** | ⚠️ The trail records `failed` with no reason today; the cause is only in Vercel's logs, which expire. Four past failures are now undiagnosable |

### 2.6 Guards
| 2.6.1 | Try `/start` step 3 without verifying (refresh mid-flow) | Always restarts at step 1 |
| 2.6.2 | "Start over" link | Abandons; server lets go of the submission |

### 2.7 Abandonment
| 2.7.1 | Begin a submission, upload a file, **walk away** | After the unpaid window it is swept (verify in 9.1) |

---

## Phase 3 · Status lookup

| # | Check | Expected |
| --- | --- | --- |
| 3.1 | `/status`, enter the email you used | Access code sent |
| 3.2 | Wrong code | Refused |
| 3.3 | Correct code | Lands on `/status/[token]` |
| 3.4 | Status wording | A calm sentence — not `awaiting_approval` or any raw enum |
| 3.5 | An email with **no** submissions | ⚠️ Same response as one with — no enumeration|
| 3.6 | Before the coach has replied | No download offered |

---

## Phase 4 · Operator authentication

4.1–4.3 are the same message three ways, on purpose: it is what stops the endpoint being used to
discover which addresses have logins. It is also what made a deactivated admin look like a wrong
password for two weeks.

| # | Check | Expected |
| --- | --- | --- |
| 4.1 | `/login` with a wrong password | "Invalid password" |
| 4.2 | With an unknown email | ⚠️ **Identical** message — no enumeration|
| 4.3 | With a **deactivated** account | ⚠️ Identical message again (this is what bit us)|
| 4.4 | Valid admin login | Lands on `/admin` |
| 4.5 | Valid coach login | Lands on `/coach`, and `/admin` redirects away |
| 4.6 | Valid translator login | Lands on `/translator` |
| 4.7 | Someone holding two roles | Reaches both portals |
| 4.7.1 | **The last-admin guard.** Remove admin from every admin but one, then try to remove it from the last | ⚠️ **Refused**, with the reason shown, and the checkbox snaps back ticked. **Never yet run** — testing the safety net requires walking the tightrope it exists for, and a zero-admin state has no in-app recovery, only a DB re-seed. Run it with someone holding database access standing by, and restore the other admins afterwards |
| 4.8 | `/forgot-password` with a real address | Reset email arrives |
| 4.9 | `/forgot-password` with an unknown address | Same visible response, no email |
| 4.10 | Use the reset link | ⚠️ Password changes; **you can log in with the new one**|
| 4.11 | Use the same link **twice** — and **submit a new password**, do not just open it | ⚠️ Refused on **submit**, not on load: "This reset link is invalid, already used, or expired." The page renders the form either way, because it only checks a token is present. Succeeding here would mean the single-use binding is broken |
| 4.11.1 | Judgement call, not a defect: should a spent link say so **on load**? | Today you type a password twice before being told. Safe, since a spent token cannot change anything — but a wasted trip. Decide whether the page should verify on load and offer "request a new link" |
| 4.12 | An expired link | Refused with a clear message |
| 4.13 | `/account` → change password | Requires the current one; wrong current is refused |
| 4.14 | Log out | Session gone; `/admin` bounces to `/login` |
| 4.15 | Visit `/admin` logged out | Redirect, not a 500 |

---

## Phase 5 · Admin panel (`/admin`)

5.13.3 and 5.13.10 are the two that were actually broken this week. Verify them explicitly rather
than assuming the fix held.

| # | Check | Expected |
| --- | --- | --- |
| 5.1 | Queue lists submissions, newest sensible order | |
| 5.2 | Status filters | Each narrows correctly |
| 5.3 | Open one submission | Player, customer, files, progress, trail |
| 5.4 | **Assign a coach** | Status moves to `assigned`; coach appears |
| 5.5 | **Notify the coach** | Coach gets an email; status moves to `sent_to_coach` |
| 5.6 | Archive a submission | Leaves the active queue |
| 5.7 | **Reset a status** to an earlier rung | Recorded in the trail **with your name and a reason** |
| 5.8 | **Purge a folder** | ⚠️ Files gone; the *rows* survive; `/api/files/[id]` answers **410**, not 404|
| 5.9 | **Linguistic alignment — the whole matrix**, as ruled by Ben 2026-08-31. Three outcomes, not two: **skip** when the target reads everything the source does; **translate** when they share nothing; **translate with the hand-over still offered** when they share a language but the source also reads one the target doesn't — the files *might* be in the shared one, and only the admin can say. Either side blank is "cannot tell", which skips silently. **Identical on the way back**, with coach as source and customer as target. It is **not** "translate when the coach isn't English" — that derived nothing for a Japanese parent sending to a Japanese coach. 5.9.1–5.9.5.2 are the nine rows |
| 5.9.1 | Customer `English` · coach `Japanese` | ⚠️ **Translation is offered** — the next action is "Pick a translator", **not** "Hand to the coach" |
| 5.9.2 | Customer `Japanese` · coach `English` | ⚠️ Identical outcome to 5.9.1. The rule is symmetric; neither language is the platform's default |
| 5.9.3 | Customer `English` · coach `English` | Translation rungs stay skipped; "Hand to the coach" is offered |
| 5.9.0 | ⚠️ **The question asks what they understand, not what they want back.** Read step 1's language field | "What language do you understand?" ⚠️ It asked "What language should your feedback be in?", which named a delivery format this field does not control — and made **Both** a promise of two versions nobody was ever going to receive |
| 5.9.0.1 | The hint says so outright | Choosing Both still yields one review. The wording has to carry it, because the label had been implying otherwise |
| 5.9.0.2 | One vocabulary on all three surfaces | Step 1, the coach's card, and the admin panel all say **understands** — not "reads" on one and "should your feedback be in" on another. Both halves of an intersection have to be spelled the same |
| 5.9.2.1 | ⚠️ **The language you pick is the language stored.** Create a submission choosing `Japanese`, then read the row | `["Japanese"]`. ⚠️ **Every submission ever created was `["English"]`** regardless of the choice: the schema transformed the answer into an array, the client sent the transformed value, the server re-parsed its own output, the enum refused an array and `.catch("English")` answered confidently. Nothing failed anywhere |
| 5.9.2.2 | Repeat for `both` | `["English","Japanese"]` |
| 5.9.2.3 | ⚠️ **Step back and forward again.** Choose Japanese, continue, return to step 1 | The choice is still selected. It was the one field stepping back forgot, so a customer fixing a typo silently reset to the default |
| 5.9.2.4 | ⚠️ `npm run simulate` runs at all | It had been failing to *start* on a `server-only` import since the QA pass began, so the one check that walks the ladder was dark. It now runs, and asserts that parsing the language twice gives the same answer |
| 5.9.3.1 | Customer `Japanese` · coach `Japanese` | Skipped. Neither language is the platform's default |
| 5.9.4 | Customer `English` · coach `English, Japanese` | **Skipped.** The coach reads everything the customer does, so whatever the files are in, they can read them |
| 5.9.4.1 | Customer `Japanese` · coach `English, Japanese` | Skipped, same reason from the other side |
| 5.9.5 | Customer `English, Japanese` · coach `Japanese` | ⚠️ **Translate, with "or hand to the coach" still offered beside the picker.** They share Japanese, but the customer also reads English and the files may be in it. ⚠️ This row said **"Skipped"** until 2026-08-31 and the build already disagreed with it; Ben's matrix settles it in the build's favour, plus the escape hatch |
| 5.9.5.1 | Customer `English, Japanese` · coach `English` | Same: translate, hand-over still offered |
| 5.9.5.2 | Customer `English, Japanese` · coach `English, Japanese` | Skipped |
| 5.9.5.3 | ⚠️ **The no-overlap rows offer no escape.** Re-check 5.9.1 and 5.9.2 | Only "Pick a translator" — **no** "or hand to the coach". There is nothing the target could read, so skipping would hand someone files they cannot open |
| 5.9.5.4 | ⚠️ **The whole matrix again on the response leg.** Repeat 5.9.1, 5.9.4 and 5.9.5 against the coach's feedback | Identical outcomes with the parties swapped. Sharing a language is symmetric; *who reads what the other doesn't* is not, and the response gate reverses its arguments to match |
| 5.9.6 | Customer `English` · coach with **nothing recorded** | ⚠️ Skipped and **silent**. Blank is "cannot tell", never "translate" — prompting on an unanswered question nags on every row until someone fills it in |
| 5.9.7 | Customer with **nothing declared** · any coach | Same: skipped, no prompt |
| 5.9.8 | Customer `english ` · coach `English` (case and trailing space) | Skipped — matching is case-insensitive and trimmed |
| 5.9.9 | **Who may take the intake leg.** Customer `English` · coach `Japanese`, sitting at "Pick a translator". Open the dropdown | ⚠️ Only translators who cover **English → Japanese** are offered — the exact-direction ones *and* anyone set to "both directions". A `Japanese to English` translator must not be in the list |
| 5.9.10 | The **same submission** at the response leg, after the coach uploads their feedback | ⚠️ The list **inverts** — only **Japanese → English** and "both directions". The translator excluded at 5.9.9 is precisely the one required here, which is why the filter belongs to the leg and not to the submission |
| 5.9.11 | Post an ineligible translator to the assign action from a stale tab | ⚠️ Refused server-side, with a reason. The dropdown filter is a convenience; the guard is the action — the mirror of the active-translator re-check already there |
| 5.9.12 | A leg whose required direction no active translator covers | ⚠️ The control says which direction is unstaffed rather than offering an empty dropdown beside a dead Save |
| 5.9.13 | The detail panel on a non-aligned submission | Each party is followed immediately by the language they read, and a derived line names the routing decision in words — see the note |
| 5.9.14 | **"Send to the translator" emails the translator.** From `intake_translator_assigned`, click it, then read the trail | ⚠️ An `email` row appears (`sent`, then `delivered`) and the assigned translator's inbox has the hand-off with a download link per file — exactly as the coach hand-off does at ③. The rung is named *emailed to the translator*; reaching it without a send makes the ladder lie |
| 5.9.15 | The same on the **response** leg, from `feedback_translator_assigned` | ⚠️ Same outcome. It is a second call site and fixing one does not fix the other |
| 5.9.16 | **Send with the translator's mail failing** (bad address, or Resend key pulled) | The hand-off still completes and the trail records the failure — best-effort per ADR 004, never a silent success |
| 5.9.17 | **Telling five translators apart.** Open the picker with the current roster | ⚠️ Each option carries enough to identify the person — direction and email, not just a name. Five near-identical "Ben" names with nothing to separate them is how the wrong one gets assigned |
| 5.9.18 | ⚠️ **The send radio names sets, not languages.** Reach a hand-off with both an original and a translation | Reads "The client's originals / The translation / Both" at step 8, and "The coach's response / …" at step 13. ⚠️ It read **"English / Japanese"** until 2026-08-31 — wrong in both directions, since nothing records what language any file is actually in |
| 5.9.19 | The four folder hints say the same | No "the Japanese version" / "the English version". Provenance is knowable; language is not |
| 5.9.20 | **Upload into all four folders.** Try each | All four accept. The two originals were read-only; adding a file is not overwriting one, and a failed upload emailed in has to go somewhere |
| 5.9.21 | ⚠️ After uploading into `intake` or `feedback` as the admin, read the trail | A row names the file and the folder. That record is what the old read-only rule was protecting |
| 5.9.22 | **Upload is one click.** Press Upload in any folder | The file picker opens; choosing files uploads them. No separate "Choose files" step and no "No file selected" |
| 5.9.23 | **Remove one file.** Use Remove beside a file in any folder | That file only — the folder keeps the rest. ⚠️ Distinct from Purge, which keeps the rows and drops the bytes |
| 5.9.24 | After removing, read the trail | A row names the file and the folder. A folder that lost a file with no explanation is worse than one that still has it |
| 5.9.25 | ⚠️ **Send "Both" to the coach, then read the email.** | Two headed groups: "The client's originals" and "The client's files, translated". A flat list of five links does not say which is which, and "Both" was chosen precisely because the distinction matters |
| 5.9.26 | The originals come first | Even when the translation was uploaded first. Ordered by the folder list, not by whatever order the query returned |
| 5.9.27 | Send a **single** folder | Stays a flat "Files to download" with no headings. A heading over a list that could not be anything else only costs a line |
| 5.9.28 | The translator's ⑩ / ⑪ hand-off | Also flat: one folder is sent, so there is nothing to disambiguate |
| 5.9.29 | ⚠️ **The amber flag withdraws itself.** Take a translated submission all the way to `collected`, then read the queue row | No translation warning. ⚠️ It read "Translate the client files first" on a **collected** submission, because the flag came from a language comparison that goes true when a coach is assigned and can never go false |
| 5.9.30 | The flag out-ranks the outstanding line | So a stale one occupies the only place the row says what to do next. Check the row shows the real next action once the hint is gone |
| 5.9.31 | The hint appears where it should | `assigned` through `intake_translating`, and `awaiting_approval` through `feedback_translating`. Silent at `intake_translated` and `sent_to_coach`: that leg is settled and the response leg's turn has not come |
| 5.9.32 | "The customer didn't declare a language" obeys the same gate | Useful at the hand-off decision, noise on a delivered submission |
| 5.9.33 | ⚠️ **"Completed" is never blank on a busy submission.** Open one sitting at `sent_to_intake_translator` | It cites the rung it reached, with the time. ⚠️ It read "Nothing yet." — true of that rung, and false-sounding on a submission already paid, assigned, translated and sent |
| 5.9.34 | It still lists the rung's own steps once any are done | The fallback stands in only when the current rung has nothing completed on it |
| 5.9.35 | ⚠️ **"This submission" names the translators.** Open a translated submission | A row per leg — "Translator, in" and "Translator, back" — each with their direction. ⚠️ The panel named only the coach, so the people doing the work were nowhere on it |
| 5.9.36 | An untranslated submission shows no translator rows | Not an empty row. Most submissions never translate |
| 5.9.37 | ⚠️ **The coach sees only what you sent.** Send "The translation" to a coach on a submission that has both folders | One file on their card, matching the email. ⚠️ The portal listed **every** file on the submission, so the curation was honoured in the email and ignored on the page — two answers to one act |
| 5.9.38 | ⚠️ **The customer sees only what you released.** Approve with "The translation" | The download page and the ⑥ link both show the translation alone. ⚠️ Worse than the coach case: an untranslated original handed to someone who may not read it is what translating exists to prevent |
| 5.9.39 | Send "Both" | Both folders appear, on the card and on the download page |
| 5.9.40 | A submission sent before the set was recorded | Falls back to the originals — the same fallback both send actions use, and the one set that always exists |
| 5.10 | **The response leg, same matrix.** Repeat 5.9.1 and 5.9.3 against the coach's *feedback*, after they upload it | ⚠️ Same two outcomes. It is a second `passive` constant in the same file and fixing one does not fix the other |
| 5.11 | What an operator is *told* when languages are missing | The row says which side is blank rather than only that something is. ⚠️ An **admin** grant is empty by design — read the coach card, not the person |

### 5.12 Settings (`/admin/settings`)
| 5.12.1 | Change the price | **Landing page and step 4 both follow** (allow 5 min for the landing cache) |
| 5.12.2 | Change max file size / count | Step 3 enforces the new values |
| 5.12.3 | Change retention windows | Reflected in the sweep (9.1) |
| 5.12.4 | Enter nonsense (negative, zero, huge) | Rejected |

### 5.13 Operators (`/admin/operators`)
| 5.13.1 | List shows everyone with their kinds | |
| 5.13.2 | **Create a coach** — name, email, password, languages, specialties | Appears in the list |
| 5.13.3 | **That coach can log in** | ⚠️ The exact thing that was broken — verify explicitly |
| 5.13.4 | **Create a translator** | Same, and can log in |
| 5.13.5 | **Create a second admin** | Same, and reaches `/admin` |
| 5.13.6 | Edit the **coach card's** languages and specialties | Persists — and see 5.13.6.5, because "someone's languages" stopped being a thing on 2026-08-30 |
| 5.13.6.1 | The operator page shows **three role cards** — Admin, Coach, Translator — plus a separate **Sign-in** card | Each role's controls are inside its own card; identity is not in any of them |
| 5.13.6.2 | **Admin card** | ⚠️ No availability, no languages, no specialties, and it says why. Holding admin *is* being one — a paused admin is not a state |
| 5.13.6.3 | **Coach card** | Availability, languages, specialties, bio, photo — the only role the public site shows |
| 5.13.6.4 | **Translator card** | Availability, languages, specialties. ⚠️ **No bio and no photo** — a translator is never shown publicly |
| 5.13.6.5 | **The one that matters.** Give one person coach languages `English` and translator languages `Japanese`. Save each card | ⚠️ Both persist, separately. Re-open the page and confirm. Before this rebuild they were one column and could not disagree |
| 5.13.6.6 | Save the coach card only | ⚠️ Admin and translator are **untouched** — each card writes one role, so a stale card cannot delete the others (this was QA 4.7's actual damage) |
| 5.13.6.7 | Untick a role, without saving | Its settings panel disappears — no half-state where a paused toggle outlives its role |
| 5.13.6.8 | Re-tick it, still without saving | The panel returns with its values intact |
| 5.13.6.9 | Upload a **coach photo**, and write a bio | Saves against the coach grant. Leaving the photo blank on a later save keeps the existing one |
| 5.13.6.9.1 | ⚠️ Now look for that bio and photo **on the public site** | **They are not there.** The landing page's coach section is hardcoded copy in `landing/model/copy.ts`, and nothing links to `/api/coach-image/[id]`. The card collects data with no consumer — decide whether the public section becomes data-driven or the fields come out |
| 5.13.6.10 | ⚠️ **Migration check.** Someone who had languages recorded before 2026-08-30 | Their **coach** grant still carries them — the move backfilled coach and translator grants, and left admin grants empty on purpose |
| 5.13.6.11 | The **Sign-in card**: change name, email, password | Saves independently of every role card; they can then log in with the new password |
| 5.13.7 | **Pause** a role | Still holds the role; **not offered for assignment** |
| 5.13.7.1 | After pausing, re-open the card | ⚠️ That role's languages, specialties and bio are **still there** — pausing is not removing |
| 5.13.7.2 | Pause a coach who is **mid-review** on a submission | ⚠️ The assignment **survives** — work already in hand stays theirs to finish. Only a revoke releases it |
| 5.13.8 | **Revoke** a role | Drops off that list; other roles survive |
| 5.13.8.1 | Revoke a coach who is **assigned** to a submission | ⚠️ The submission **returns to the queue** for reassignment. Without this the assignment outlives the role and they could still pull the files |
| 5.13.8.2 | Revoke the coach role from someone who is also a translator | ⚠️ Their **translator** languages and specialties are untouched |
| 5.13.8.3 | Revoke a role, then grant it back | ⚠️ Its settings are **gone** — removing a role discards them, by design. The public bio exists because the coach role does. Confirm this is the behaviour you want before launch |
| 5.13.9 | Revoke every role | ⚠️ Person remains, reaches nothing — **there is no hard delete**; confirm that's acceptable|
| 5.13.10 | Reset another operator's password as admin | ⚠️ Also previously broken — confirm they can then log in |
| 5.13.11 | Deactivate an operator | Cannot log in |

---

## Phase 6 · Coach portal (`/coach`)

| # | Check | Expected |
| --- | --- | --- |
| 6.1 | Sees **only** their assigned submissions | |
| 6.2 | Cannot reach another coach's submission by URL | ⚠️ Refused|
| 6.3 | **Download a file** | Works — and this is what earns `in_review` |
| 6.4 | Status after that first download | `in_review`, in the trail |
| 6.5 | Upload a feedback file | Accepted |
| 6.6 | Upload a large feedback file (>4.5 MB) | Must succeed |
| 6.7 | Send for approval | Status moves to `awaiting_approval`; admin notified |
| 6.8 | Admin approves and completes | Status `complete`; **customer emailed** |

---

| 6.9 | ⚠️ **Remove an uploaded feedback file.** Upload two, remove one | That file only. The coach had no undo at all until 2026-08-31 — a wrong take could only be sent alongside the right one and explained by email |
| 6.10 | Remove the last file, then Send for approval | Refused. An empty send parks a submission awaiting approval of nothing |
| 6.11 | ⚠️ **Remove after sending** (stale tab) | Refused. Past `awaiting_approval` the file is what the admin is reviewing |
| 6.12 | ⚠️ **Remove someone else's, or the customer's.** Post a remove for another coach's file, then for an `intake` file | Both refused. A coach must not be able to destroy the material they were given |
| 6.13 | The panel says what the button does | A line under it: the admin reviews it and releases it to the customer. ⚠️ The translator's card carried this from the start and the coach's did not |
| 6.14 | Upload and Send sit apart | Upload left, Send for approval right. During an upload only the Upload button reads busy, so the send never looks pressed when it hasn't been |

## Phase 7 · Translator portal (`/translator`)

| # | Check | Expected |
| --- | --- | --- |
| 7.1 | Sees assigned translations only | Legs assigned to them, nobody else's. ⚠️ The page was an empty panel until 2026-08-31 — everything in this phase is newly real |
| 7.2 | Download the intake files | Earns `intake_translating`. Observed from the download, never declared — there is no "I've started" button |
| 7.2.1 | ⚠️ **In production, not just dev.** Same download on the live site, then reload the admin queue | Still flips. Prod redirects to Blob and returns instantly, so the stamp runs in `after()` rather than a floating promise — a fire-and-forget here worked in dev and raced the response in prod |
| 7.2.2 | ⚠️ **Someone else's leg.** As a translator assigned to a *different* submission, open a file you can reach | No rung moves. Being *a* translator must not close a hand-off you are not part of — the guard the coach's side always had and this one did not |
| 7.2.3 | Download the same file twice | The second changes nothing. The rung has already moved, so there is no rung to move |
| 7.3 | Upload the translation | Lands in the `intake_translation` folder. ⚠️ The status does **not** move on upload — uploading and handing back are two acts, as they are for the coach |
| 7.3.1 | ⚠️ **The "Choose files" button responds to the mouse.** Hover it | Colour change and a pointer cursor, and **no "No file selected"** beside it — the panel lists uploads directly above, so that readout contradicted the page. Same control on the coach's page |
| 7.3.1a | Reach it by **keyboard** — tab to it and press Enter or Space | The picker opens and the button shows a focus ring. The real input is visually hidden, not `display:none`, so it stays in the tab order |
| 7.3.1b | Neither button wraps to two lines | Narrow the window. ⚠️ "Hand back" broke across two lines and doubled the button's height when the file input was greedy for width |
| 7.3.2 | **Remove an uploaded translation.** Upload two, remove one (the coach's mirror is 6.9) | It goes from the list and from storage. No confirm step — the file is still on their machine, so a mistaken click costs one re-upload |
| 7.3.3 | Remove the last file, then try to hand back | Refused — an empty hand-back leaves the admin to find the empty folder when they try to pass it on |
| 7.3.4 | ⚠️ **Remove after handing back** (stale tab, or as another translator) | Refused. Past hand-back the file is what the admin is acting on; pulling it out would leave a leg marked delivered with an empty folder |
| 7.3.5 | ⚠️ **Remove someone else's file.** Post a remove for a file on a leg that isn't yours | Refused. And a remove aimed at an `intake` or `feedback` file is refused whoever asks — a translator must not be able to destroy the material they were given |
| 7.4 | Hand back | `intake_translated`; the admin can now hand it to the coach |
| 7.5 | Repeat for the **feedback** direction | `feedback_translating` → `feedback_translated` |
| 7.6 | ⚠️ **Both legs, one translator.** Assign the same person both legs of one submission | **Two cards**, not one — they are separate jobs in opposite directions. Only the leg matching the current rung is under "To translate"; the other waits its turn |
| 7.7 | Each card names its direction | The direction sits **above** the player's name. With both legs held, the name alone cannot tell them apart |
| 7.8 | Hand back with **no file uploaded** | Refused. An empty hand-back leaves the admin to discover the empty folder when they try to pass it on |
| 7.9 | Hand back **twice** (two tabs, submit both) | The second is refused with a reason, not silently re-run. The rung is re-checked server-side, not just hidden in the UI |
| 7.10 | ⚠️ **Another translator's leg.** As translator A, post a hand-back for a leg assigned to translator B | Refused. Role is not ownership — being *a* translator must not close *any* leg |
| 7.11 | ⚠️ **The other folder.** Holding only the intake leg, upload to `feedback_translation` | Refused by the upload routes. Ownership is per leg, not per submission |
| 7.12 | A translator with nothing assigned | The calm centred panel, not a page of empty "(0)" headings |
| 7.13 | A leg whose files the retention sweep has cleared | "Files deleted" rather than an empty list or a broken link |
| 7.14 | Handed-back legs stay visible | Under "Handed back", with the file count they delivered |
| 7.15 | Upload a **large** file (over ~5 MB) as a translator | Succeeds. Prod goes straight to Blob; a route-proxied upload would hit the ~4.5 MB serverless body cap |

---

## Phase 8 · Delivery and collection

| # | Check | Expected |
| --- | --- | --- |
| 8.1 | Customer gets the "feedback ready" email | Contains a working link |
| 8.2 | Follow the link, request the access code | Code arrives |
| 8.3 | Download the feedback | Works |
| 8.4 | **That download stamps `collected`** | ⚠️ Retention clock starts here|
| 8.5 | Admin sees the collection | Trail records it |
| 8.6 | Download a second time | Still works; `collected` not re-stamped |

---

| 8.7 | ⚠️ **The customer's download moves `complete` → `collected`.** Open the link from ⑥ in a browser **signed out of the portal** | The rung moves and the admin gets ⑦. ⚠️ **Signed in as an operator it deliberately does not** — staff checking a file is not the customer collecting it, and letting it count would delete the feedback 30 days after *staff* looked. This is the likeliest reason a QA download "does nothing" |
| 8.8 | The Download button doesn't flash a tab | Same tab, no window opening and closing. The route answers with `Content-Disposition: attachment`, so nothing was ever going to be shown in it |
| 8.9 | ⚠️ Download still works after that change | It is a plain `<a>`, not `ButtonLink`. `next/link` intercepts internal hrefs and was skipping this one only because `target` was set |

| 8.9.1 | ⚠️ **Two files, one row shape.** Deliver a submission with a short filename and a long one, then open the customer's download page | Both rows identical: name, size, Download on the right. ⚠️ The list was `flex-wrap`, so a long name pushed its button onto a second line and two files in one list looked like two designs |
| 8.9.2 | A very long filename | Truncates with an ellipsis. The size and the button never move; the name is the only thing that gives way |
| 8.9.3 | ⚠️ **Both customer download pages, not one.** Check the signed link from the ⑥ email *and* the status lookup | Identical rows on both. ⚠️ Each had built this row for itself, so the first fix landed on one page and the same report came back about the other. They render one shared component now |
| 8.9.4 | No tab flash on either page | Clicking Download starts a download in place. `target="_blank"` opened a window with nothing in it — the route answers `Content-Disposition: attachment` |
| 8.9.5 | ⚠️ **Drag the window wider on the ⑥ page** | The text column never gets *narrower*. It did, twice: the site container steps its padding at 640px and 1024px for a 1400px layout, and against a `max-w-xl` cap those steps ate the column, 536 to 512 to 456 |
| 8.9.6 | Resize slowly across the whole range | Heading and vertical rhythm scale continuously, with no snap at a breakpoint |
| 8.9.7 | ⚠️ **One code, not two.** Look yourself up on `/status`, enter the code, and reach the card stack | The downloads are **on the page**. ⚠️ A second "email me a code" panel sat below the cards asking for proof already given — and codes are single-use, so it was a fresh trip to the inbox for files the server had already returned |
| 8.9.8 | Same on the `/status/[token]` link from ⑥ | No code prompt at all. The signed link *is* the proof; asking again proves nothing new |
| 8.9.9 | ⚠️ **A "Feedback ready" card leads to its files.** Click Download ↓ on the card | Jumps to the panel below the stack. Nothing on the card said the files were already on the page, so customers went back to their email for the link instead of scrolling |
| 8.9.10 | A card with no feedback shows no link | And a page with no downloads shows none on any card |
| 8.9.11 | ⚠️ **Both code emails look the same.** Trigger the step-2 verification code and the `/status` access code, and put them side by side | Identical grey rounded panel, display face, same size and tracking. ⚠️ They differed in five ways: box, typeface, size, tracking and colour |
| 8.9.12 | The panel follows the shell's palette | Its greys are the shell's `PAPER_ALT` and `LINE`, not literals, so a palette change carries the code box with it |
| 8.9.13 | ⚠️ **A collection writes its trail row, not just its email.** Collect as a customer, then read the trail | Both a `collected` rung **and** a ⑦ row. ⚠️ e2e sent and delivered ⑦ while writing no row — the record that proves a send happened was the one that vanished |
| 8.9.14 | Every ①–⑪ send leaves a row | All eleven call sites `await` the write now. Ten had been winning a race the eleventh lost inside an `after()` callback, which tears down the moment its promise resolves |
| 8.9.15 | ⚠️ **Ready before history.** Open `/status` with a released review waiting | The downloads are the first thing on the page; history sits under its own heading below. ⚠️ They were the other way round, so a parent whose review had just landed scrolled past their own past to reach it |
| 8.9.16 | Nothing ready | No downloads block at all, and the list is headed "Your submissions" rather than "Your history" |
| 8.9.17 | ⚠️ **The ⑥ link stays one submission.** Open it and look for past reviews | It shows that review only, and offers a link to `/status` for the rest. ⚠️ Widening it would widen the token — this is the link people forward, and one forward would hand over the family's whole history |
| 8.9.18 | All three customer pages resize the same way | `/status`, `/status/[token]` and the ⑥ link share one shell. Dragging wider never narrows the column |
| 8.9.19 | ⚠️ **No code form once you are in.** Look yourself up on `/status` and reach the list | "Email me a code" is gone, replaced by "Use a different email". ⚠️ It rendered unconditionally, offering to mail a code to someone already reading the page it unlocked — and codes are single-use, so it would have been a *second* one |
| 8.9.20 | The escape still works | "Use a different email" returns to the form and clears the old code |
| 8.9.21 | ⚠️ **Each card identifies its own submission.** Look up an email with several | Player and age, focus, the customer's own notes, sent date and feedback-ready date. ⚠️ It was a name, a focus and a date, so two reviews of the same child were indistinguishable |
| 8.9.22 | ⚠️ **And nothing of ours.** Inspect the payload behind `/status` | No coach, no internal notes, no Stripe id, no storage locator. The projection widened to the customer's own facts only, and the bar for adding a field is unchanged |
| 8.9.23 | ⚠️ **A card per finished review.** Look up an email with several ready | One green card each, headed "Ready to download (n)". ⚠️ All of them sat inside a single green panel separated only by a player name, so seven reviews arrived as one block |
| 8.9.24 | Each ready card carries the same detail as its history card | Player, age, focus, their own notes, both dates. They render one shared component, so the two lists cannot describe one submission two ways |
| 8.10 | ⚠️ **Rungs 5 and 12 say "Chosen", not "Sent".** Assign a translator and stop before sending | The rail reads `5 · Chosen`, and only `6 · Sent` once the email goes. ⚠️ Both read "Sent" until 2026-08-31, so the rail asserted a send at the exact rung where nothing had been sent |
| 8.11 | The reset-status dropdown agrees | Same words, same numbers. It reads the one label map |
| 8.12 | ⚠️ **Screen-reader step count.** Inspect the rail's `aria-label` | "Step n of 20". It said "of 16" from the day translation added four rungs, and a screen reader was the only place that showed |

## Phase 9 · System jobs

**9.5 was one check covering two facts** and was split on 2026-08-27, after a pass found delivery
working and bounce silent. A single check would have gone green on the delivery half.

| # | Check | Expected |
| --- | --- | --- |
| 9.1 | Hit `/api/cron/sweep` with the `CRON_SECRET` | Warns first, then purges per the windows |
| 9.2 | Without the secret | Refused — and with `CRON_SECRET` unset the sweep **refuses to run at all** |
| 9.3 | A swept submission's file | `/api/files/[id]` → **410 Gone** |
| 9.4 | Deletion-warning email | Sent once, and stamped even if the send failed |
| 9.5 | Resend webhook — **delivery** | `delivered` appears in the trail within a few seconds of a send |
| 9.5.1 | Resend webhook — **bounce** | `bounced` appears in the trail within a minute of a send to `bounced@resend.dev` (Resend's simulator; a dead domain is accepted and never bounces, which is why earlier dead-domain tests saw nothing). `email.bounced` is already subscribed on the endpoint — verified via the Resend API. 2.2.5 depends on this |
| 9.6 | Resend webhook with a bad signature | Rejected |
| 9.7 | Replay a webhook older than 5 minutes | Rejected |

---

## Phase 10 · Cross-cutting

| # | Check | Expected |
| --- | --- | --- |
| 10.1 | Every page at **375px** | No horizontal scroll |
| 10.2 | Keyboard-only through the whole customer flow | Everything reachable, focus visible |
| 10.3 | Form labels | Every input has one |
| 10.4 | Images | Meaningful ones have alt text; decorative ones are empty |
| 10.5 | Browser back button mid-flow | Doesn't strand you |
| 10.6 | Two tabs, same flow | Doesn't corrupt either |
| 10.7 | Slow connection (throttle) | Loading states appear |
| 10.8 | Offline mid-upload | Fails honestly, offers retry |

---

## Phase 11 · Go live on Stripe — after everything above passes

Only now, and only once. Every step above has been proven in test mode, so this
phase is checking **configuration**, not behaviour.

| # | Do | Check |
| --- | --- | --- |
| 11.1 | Stripe dashboard → toggle **Test mode off** → **Developers → API keys** | Copy `sk_live_…` and `pk_live_…` |
| 11.2 | Vercel → Production: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | |
| 11.3 | Stripe → **Webhooks → Add endpoint** → `https://www.baseball-sensei.com/api/webhooks/stripe` | |
| 11.4 | Subscribe to **`payment_intent.succeeded`** and **`payment_intent.payment_failed`** only | |
| 11.5 | Copy **that endpoint's** signing secret → Vercel `STRIPE_WEBHOOK_SECRET` | ⚠️ Test and live have **different** signing secrets. A test `whsec_` in production fails every signature check **silently**, and payments never mark as paid. |
| 11.6 | **Redeploy** | The publishable key is inlined at build time |
| 11.7 | One real payment with your own card, then **refund it in Stripe** | The submission reaches `new`, the receipt arrives, and Stripe shows the webhook `200` |
| 11.8 | Confirm `livemode=true` on that payment intent | The check that proves it, rather than assumes it |

---

## Results

| Phase | Pass | Fail | Notes |
| --- | --- | --- | --- |
| 0 Prereqs | | | |
| 1 Public | | | |
| 2 Customer flow | | | |
| 3 Status | | | |
| 4 Auth | | | |
| 5 Admin | | | |
| 6 Coach | | | |
| 7 Translator | | | |
| 8 Delivery | | | |
| 9 System | | | |
| 10 Cross-cutting | | | |
