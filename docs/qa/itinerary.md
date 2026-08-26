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

**Instrumentation:** with the QA probe armed, I see every click, navigation,
form submit and error as you go, so you don't need to narrate. You do need to
tell me what you *expected* when something looks wrong — the probe records what
happened, never what should have.

---

## Phase 0 · Prerequisites — do these first

| # | Do | Why it blocks |
| --- | --- | --- |
| 0.1 | **Close the Supabase Data API.** Settings → API → Exposed schemas, remove `public`. Then enable RLS on every table. | Every table is currently readable with the publishable key, including password hashes and children's names. QA generates *more* real data into a database anyone can read. See OUTSTANDING §0. |
| 0.2 | **Rotate the publishable key**, and the production DB password. | Both are known-exposed. |
| 0.3 | **Reactivate `ben.j.wylie@gmail.com`** — set `is_active = true`, and confirm it holds an `admin` grant. | You cannot run Phase 5 without an admin login. |
| 0.4 | **Stripe: live keys + webhook.** See Phase 0a below. | Phases 2.4 onward are the money path and cannot be tested without it. |
| 0.5 | **Confirm `NEXT_PUBLIC_SITE_URL` is `https://www.baseball-sensei.com`** in Vercel, then redeploy. | It builds the links inside customer emails *and* the 3-D Secure return target. It is inlined at build time, so it needs a redeploy, and a mismatch strands a customer **after** they are charged. |
| 0.6 | **Decide the Basic Auth question.** Leave the gate on for QA. | With it on, only you can reach the site — which is what you want while generating test submissions. |

### Phase 0a · Stripe production setup

| # | Do | Check |
| --- | --- | --- |
| 0a.1 | Stripe dashboard → **Developers → API keys**, live mode. Copy the secret key (`sk_live_…`) and publishable key (`pk_live_…`). | |
| 0a.2 | Vercel → Environment Variables → **Production**: set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. | The publishable one is `NEXT_PUBLIC_*` and inlined at build — it needs a redeploy to take. |
| 0a.3 | Stripe → **Developers → Webhooks → Add endpoint**: `https://www.baseball-sensei.com/api/webhooks/stripe`. | `/api` is excluded from the Basic Auth gate, so Stripe can reach it while the site is closed. |
| 0a.4 | Subscribe to **`payment_intent.succeeded`** and **`payment_intent.payment_failed`** only. | Two events, both handled. Extra events are noise the handler ignores. |
| 0a.5 | Copy the endpoint's signing secret (`whsec_…`) → Vercel `STRIPE_WEBHOOK_SECRET` (Production). | **Test and live have different signing secrets.** A test-mode secret fails every signature check in production, silently, and payments never mark as paid. |
| 0a.6 | **Redeploy** so the inlined publishable key and the env vars take effect. | |
| 0a.7 | In Stripe, confirm the endpoint shows a successful `200` after your first real payment (2.4). | This is the check that the whole chain works. |

> **A live-mode payment is a real charge on a real card.** Do 2.4 with your own
> card and refund it in Stripe afterwards, or run the payment phase in test mode
> first and repeat only 2.4 live.

---

## Phase 1 · Public pages

### 1.1 Landing (`/`)

| # | Check | Expected |
| --- | --- | --- |
| 1.1.1 | Page loads, hero photograph renders | Header floats over the photo, wordmark legible |
| 1.1.2 | Headings are condensed (Oswald), body is Lexend | If the type looks like one family, the font swap didn't deploy |
| 1.1.3 | Claim ticker scrolls | Six claims, looping seamlessly |
| 1.1.4 | Nav links: How it works / Coaches / Pricing / FAQ | Each scrolls to its section |
| 1.1.5 | Contact nav link | Goes to `/contact` |
| 1.1.6 | Three step cards render with images and badges **1, 2, 3** | Not "1, 1, 1" |
| 1.1.7 | Coach section: photo, round inset, stats | Eyebrow is **blue** here, not lime |
| 1.1.8 | Price shows **$80** | Read from settings — change it in 5.6 and confirm it follows |
| 1.1.9 | FAQ: first row open, others closed; click to expand | `+` becomes `−`; keyboard (Tab + Enter) works |
| 1.1.10 | Closing strip shows 4 photographs | |
| 1.1.11 | Every "Get coach feedback" / "Start now" button | All go to `/start` |
| 1.1.12 | Footer: logo, 5 links, Check status, terms, copyright | |
| 1.1.13 | **375px** — resize or use a phone | Nothing overflows horizontally; ticker still works |
| 1.1.14 | Reduced motion (OS setting) | Ticker stops, no layout break |

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
| 1.2.9 | **Hit reply on that mail** | Goes to the address *you typed in the form*, not to ourselves |
| 1.2.10 | Message body | Your text, intact, and any `<tags>` shown as text not markup |
| 1.2.11 | Submit a second time | Works; no duplicate-send guard needed |

### 1.3 Terms (`/terms`)
| 1.3.1 | Loads, says it is a placeholder | Flag for legal copy |

### 1.4 Not-found / errors
| 1.4.1 | Visit `/nonsense` | A 404 page, not a stack trace |
| 1.4.2 | Visit `/status/garbage-token` | A handled "not found", not a crash |

---

## Phase 2 · The customer flow (`/start`) — the money path

Run this **twice**: once abandoning partway (2.7), once to completion.

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
| 2.1.9 | If the code email fails to send | You are **held on step 1** with an error — not advanced |

### 2.2 Step 2 — email verification

| # | Check | Expected |
| --- | --- | --- |
| 2.2.1 | Code email arrives, 6 digits | Check spam too |
| 2.2.2 | Wrong code | Inline error, stays put |
| 2.2.3 | Wrong code **5 times** | Locked out; must reissue |
| 2.2.4 | "Resend" | New code arrives; the **old one stops working** |
| 2.2.5 | "Check delivery" | Reports what Resend knows |
| 2.2.6 | Go **back** to step 1 and change the email | Verification resets; a new code goes to the new address |
| 2.2.7 | Correct code | Advances to step 3 |

### 2.3 Step 3 — upload

| # | Check | Expected |
| --- | --- | --- |
| 2.3.1 | Pill reads "Step 03 — Show your coach"; body quotes the real file limit | |
| 2.3.2 | Dropzone reads "Click to upload or drag and drop" | |
| 2.3.3 | Upload one small video | Progress, then listed |
| 2.3.4 | **Upload a file over 4.5 MB** | Must succeed — this is the direct-to-Blob path; failure here means `/api/upload/blob` isn't being used in production |
| 2.3.5 | Upload a photo and a PDF | Accepted |
| 2.3.6 | Upload a disallowed type (`.exe`) | Refused with a clear reason |
| 2.3.7 | Exceed the file-count limit | "That's the maximum of N files" |
| 2.3.8 | Exceed the size limit | Refused, names the limit |
| 2.3.9 | Remove a file, add another | Works |
| 2.3.10 | Continue | Advances to step 4 |

### 2.4 Step 4 — payment ⚠️ real money in live mode

| # | Check | Expected |
| --- | --- | --- |
| 2.4.1 | Pill reads "Step 04 — Checkout"; amount matches settings | |
| 2.4.2 | Card field renders (Stripe Elements, on our page) | Not a redirect to Stripe |
| 2.4.3 | **Declined card** (`4000 0000 0000 0002` in test) | Error shown; **you stay on step 4 with files intact**; a "way back in" email arrives |
| 2.4.4 | **3-D Secure card** (`4000 0025 0000 3155` in test) | Redirects, authenticates, returns to `/start?paid=1` — **not** to a broken URL |
| 2.4.5 | Successful payment | Confirmation state |
| 2.4.6 | Stripe dashboard → the webhook endpoint | `payment_intent.succeeded` delivered, `200` |
| 2.4.7 | Receipt email | Arrives, **lists every uploaded file** |
| 2.4.8 | Admin notification email | An admin is told a payment landed |
| 2.4.9 | Pay, then **refresh** `/start` | Clean step 1 — no resume, no double charge |

### 2.5 Confirmation
| 2.5.1 | "You're all set", file count and player name correct | |
| 2.5.2 | "Send another video" | Returns to a clean step 1 |
| 2.5.3 | "Check your status" | Goes to `/status` |

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
| 3.5 | An email with **no** submissions | Same response as one with — no enumeration |
| 3.6 | Before the coach has replied | No download offered |

---

## Phase 4 · Operator authentication

| # | Check | Expected |
| --- | --- | --- |
| 4.1 | `/login` with a wrong password | "Invalid password" |
| 4.2 | With an unknown email | **Identical** message — no enumeration |
| 4.3 | With a **deactivated** account | Identical message again (this is what bit us) |
| 4.4 | Valid admin login | Lands on `/admin` |
| 4.5 | Valid coach login | Lands on `/coach`, and `/admin` redirects away |
| 4.6 | Valid translator login | Lands on `/translator` |
| 4.7 | Someone holding two roles | Reaches both portals |
| 4.8 | `/forgot-password` with a real address | Reset email arrives |
| 4.9 | `/forgot-password` with an unknown address | Same visible response, no email |
| 4.10 | Use the reset link | Password changes; **you can log in with the new one** |
| 4.11 | Use the same link **twice** | Refused — single use |
| 4.12 | An expired link | Refused with a clear message |
| 4.13 | `/account` → change password | Requires the current one; wrong current is refused |
| 4.14 | Log out | Session gone; `/admin` bounces to `/login` |
| 4.15 | Visit `/admin` logged out | Redirect, not a 500 |

---

## Phase 5 · Admin panel (`/admin`)

| # | Check | Expected |
| --- | --- | --- |
| 5.1 | Queue lists submissions, newest sensible order | |
| 5.2 | Status filters | Each narrows correctly |
| 5.3 | Open one submission | Player, customer, files, progress, trail |
| 5.4 | **Assign a coach** | Status moves to `assigned`; coach appears |
| 5.5 | **Notify the coach** | Coach gets an email; status moves to `sent_to_coach` |
| 5.6 | Archive a submission | Leaves the active queue |
| 5.7 | **Reset a status** to an earlier rung | Recorded in the trail **with your name and a reason** |
| 5.8 | **Purge a folder** | Files gone; the *rows* survive; `/api/files/[id]` answers **410**, not 404 |
| 5.9 | Assign a **translator** (Japanese-only coach) | Translation rungs appear |
| 5.10 | A coach who shares the customer's language | Translation steps are **skipped** entirely |
| 5.11 | A coach with **no languages recorded** | Says so plainly rather than prompting |

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
| 5.13.6 | Edit someone's languages/specialties | Persists |
| 5.13.7 | **Pause** a role | Still holds the role; **not offered for assignment** |
| 5.13.8 | **Revoke** a role | Drops off that list; other roles survive |
| 5.13.9 | Revoke every role | Person remains, reaches nothing — **there is no hard delete**; confirm that's acceptable |
| 5.13.10 | Reset another operator's password as admin | ⚠️ Also previously broken — confirm they can then log in |
| 5.13.11 | Deactivate an operator | Cannot log in |

---

## Phase 6 · Coach portal (`/coach`)

| # | Check | Expected |
| --- | --- | --- |
| 6.1 | Sees **only** their assigned submissions | |
| 6.2 | Cannot reach another coach's submission by URL | Refused |
| 6.3 | **Download a file** | Works — and this is what earns `in_review` |
| 6.4 | Status after that first download | `in_review`, in the trail |
| 6.5 | Upload a feedback file | Accepted |
| 6.6 | Upload a large feedback file (>4.5 MB) | Must succeed |
| 6.7 | Send for approval | Status moves to `awaiting_approval`; admin notified |
| 6.8 | Admin approves and completes | Status `complete`; **customer emailed** |

---

## Phase 7 · Translator portal (`/translator`)

| # | Check | Expected |
| --- | --- | --- |
| 7.1 | Sees assigned translations only | |
| 7.2 | Download the intake files | Earns `intake_translating` |
| 7.3 | Upload the translation | Lands in the `intake_translation` folder |
| 7.4 | Hand back | Status advances; the coach can now see it |
| 7.5 | Repeat for the **feedback** direction | `feedback_translating` → `feedback_translated` |

---

## Phase 8 · Delivery and collection

| # | Check | Expected |
| --- | --- | --- |
| 8.1 | Customer gets the "feedback ready" email | Contains a working link |
| 8.2 | Follow the link, request the access code | Code arrives |
| 8.3 | Download the feedback | Works |
| 8.4 | **That download stamps `collected`** | Retention clock starts here |
| 8.5 | Admin sees the collection | Trail records it |
| 8.6 | Download a second time | Still works; `collected` not re-stamped |

---

## Phase 9 · System jobs

| # | Check | Expected |
| --- | --- | --- |
| 9.1 | Hit `/api/cron/sweep` with the `CRON_SECRET` | Warns first, then purges per the windows |
| 9.2 | Without the secret | Refused — and with `CRON_SECRET` unset the sweep **refuses to run at all** |
| 9.3 | A swept submission's file | `/api/files/[id]` → **410 Gone** |
| 9.4 | Deletion-warning email | Sent once, and stamped even if the send failed |
| 9.5 | Resend webhook | Delivery/bounce events appear in the trail |
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
