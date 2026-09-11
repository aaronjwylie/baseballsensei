# OPERATIONS.md — Setup & Runbook

> ## ⚠️ Changed 2026-08-01 → 02 — read this before following anything below
>
> The whole seventeen-stage pipeline shipped in one day
> ([`docs/design/rollout.md`](docs/design/rollout.md)). Several things in this
> runbook are now out of date:
>
> **A production deploy now applies its own migrations.** `npm run build` runs
> `scripts/migrate-on-deploy.mjs` first, which applies anything pending and
> **fails the build if it can't** — so a deploy can never go out ahead of its
> schema again. It runs only when `VERCEL_ENV=production`; previews are skipped
> on purpose, because they share this database and a branch may carry a migration
> nobody has agreed to yet.
>
> *Added 2026-08-02, after a push to `main` took `/admin` down by deploying code
> whose migration hadn't been applied. Nothing has to be run by hand on deploy
> any more; `npm run db:migrate` remains for local work.*
>
> **Delivery tracking is live** (2026-08-02). A Svix-signed webhook at
> `/api/webhooks/resend` records what became of every email — `delivered`,
> `bounced`, `complained`, `failed` — into the submission's trail. Two pieces of
> config, both already done:
>
> - **Resend → Webhooks**: endpoint `https://www.baseball-sensei.com/api/webhooks/resend`,
>   the four events above. Created via Resend's API; it can be listed, edited or
>   deleted the same way.
> - **Vercel**: `RESEND_WEBHOOK_SECRET`, Production scope.
>
> **An unset secret makes the route answer 503 and record nothing** — it refuses
> unsigned deliveries rather than trusting them. If outcomes stop appearing, check
> that variable first.
>
> `/api` is deliberately outside the Basic Auth matcher, so the gate never blocks
> a webhook. That's why Stripe's will work too.
>
> **Migrations run to `0012`.** `0008` grows the status enum to sixteen and adds
> `submission_event`; `0009` adds the two file-set columns; `0010` adds the
> retention anchors and replaces `retain_resolved_hours` with three settings;
> `0011` widens the trail to record sends as well as status moves.
> `0012` adds the delivery outcome and the message id.
> `0008`, `0010`, `0011` and `0012` are **hand-corrected** — `drizzle-kit generate`
> emits a cast that fails on existing rows, and can't tell a rename from a
> drop-plus-add (or a NOT NULL being relaxed) without a TTY. Apply them; don't
> regenerate them.
>
> **Retention settings changed shape.** `retainResolvedHours` is gone. In its
> place: `retainCollectedDays` (30), `retainDeliveredDays` (90) and
> `warnBeforeDeletionDays` (7), all at `/admin/settings`. The clock starts when
> the **customer downloads**, not when we send — see
> [ADR 014](docs/decisions/014-retention-starts-on-collection.md).
>
> **The nightly sweep does two passes.** It warns first, then purges, and it now
> deletes **all four folders** including the coach's response. Vercel Hobby still
> permits only one cron run a day; an hourly schedule fails the deploy, and has.
>
> **Operator notifications go to every `admin` in the `operator` table.** There is no
> env var for this — add an admin user to add a recipient. Five of the nine emails
> go to the admin, so a production install with no admin row is a queue that announces
> nothing.
>
> **New operational task:** record each coach's **languages** in the portal.
> Translation need is derived from them; a coach with none recorded produces "no
> languages recorded" rather than a prompt, so the derivation does nothing until
> someone fills them in.

Everything outside the codebase: local development, provisioning the client's
accounts, deploying to Vercel, and the operator's day-to-day workflow.

If a step here contradicts [CLAUDE.md](CLAUDE.md), this file wins for
*operational* detail (what to click, which URL, which secret) and CLAUDE.md wins
for *architectural* intent.

**The one rule that has bitten this project before:** every webhook URL is
derived from the site URL. If the domain changes, **re-point the Stripe webhook**
or payments succeed with no submission row appearing — a silent failure.

---

## Production status (2026-07-30)

**Live at `baseball-sensei.vercel.app`** (deploys from `main`).

| Piece | State |
| --- | --- |
| Hosting | Vercel — auto-deploys `main` |
| Database | **Supabase** Postgres — schema migrated; admin `yuta@example.com` seeded; ~8 demo submissions + 2 demo coaches seeded |
| Storage | **Vercel Blob** (`BLOB_READ_WRITE_TOKEN` set) |
| Auth | `AUTH_SECRET` set; login working |
| Email | **Resend**, domain `baseball-sensei.com` verified + sending (§8); receiving via Google Workspace `contact@` |
| **Stripe** | **Not set up yet** — keys + webhook pending (§5–§6). Until then the funnel can't take payments or record submissions. |

Every env-var change needs a **redeploy** to take effect — this has bitten us
repeatedly (AUTH_SECRET, EMAIL_FROM).

---

## Table of contents

1. [Ownership model](#1-ownership-model)
2. [Local development](#2-local-development)
3. [Create the production accounts](#3-create-the-production-accounts)
4. [Deploy to Vercel](#4-deploy-to-vercel)
5. [Environment variables](#5-environment-variables)
6. [The Stripe webhook](#6-the-stripe-webhook)
7. [Domain & DNS](#7-domain--dns)
8. [Verify the email domain](#8-verify-the-email-domain)
9. [End-to-end test (test mode)](#9-end-to-end-test-test-mode)
10. [Flip to live](#10-flip-to-live)
11. [Decommission the dev setup](#11-decommission-the-dev-setup)
12. [The operator workflow](#12-the-operator-workflow)
13. [Endpoint reference](#13-endpoint-reference)
14. [Troubleshooting](#14-troubleshooting)
15. [Pending changes](#15-pending-changes)
16. [The release pipeline — setting it up](#16-the-release-pipeline--setting-it-up)

---

## 1. Ownership model

The client owns **every** account. Payments and customer data go directly to
them; we never hold either. Set accounts up in the client's name from the start.

### Who does what (2026-07-30)

| Area | Owner |
| --- | --- |
| Frontend implementation, and some admin/portal work | **Ben** |
| Backend, and **access to every account below** | **Aaron** |
| The accounts themselves, and the money | **the admin** (the client) |

The practical consequence: **anything in this runbook that needs a dashboard
login or a production credential is Aaron's**, because he holds them. Ben can
write the code and the migration, but cannot apply it. When a task is blocked on
"who has the URL", the answer is Aaron.

| Service | Purpose | Rough cost at MVP volume |
| --- | --- | --- |
| Vercel | Hosts the app | Free tier |
| Supabase | Postgres (system of record) | Free tier |
| Vercel Blob | Video + feedback file storage | Storage + transfer, a few $/mo |
| Stripe | Payments | Per-transaction only |
| Resend | Transactional email | Free tier (3k/mo) |
| Domain registrar | The domain | ~$20/yr |

Target is under ~$80 CAD/month all-in.

### Running local dev against production

Sometimes useful; **rarely the right default**. Local dev normally runs on
dockerized Postgres and local disk, which is faster, free, and cannot damage
anything. Reach for this only when you specifically need production data or the
production upload path.

**Requires a Vercel login.** Ben doesn't have one; Aaron does. Two ways round it:

- **Aaron grants Ben project access** (Vercel → Project → Settings → Members).
  One-time, and removes the round trip every time an env var changes. Preferred.
- **Aaron pulls and sends the file** — `vercel env pull .env.production.local
  --environment=production`, then shares it *securely* (a password manager, not
  Slack or email). It contains live credentials.

Then, locally:

```bash
npm i -g vercel            # or use npx
vercel login && vercel link
cp .env.local .env.local.backup                       # keep the working setup
vercel env pull .env.local --environment=production   # NOTE: overwrites
```

`--environment=production` matters — the default pulls the *development*
environment, which is usually empty and will leave you with a half-configured app
that fails in confusing ways.

**Read this before you do it:**

| Risk | Why |
| --- | --- |
| ~~🔴 **The app will fail until the migrations are applied**~~ | **No longer true (2026-08-05).** Production carries the full six-table schema with live data. |
| 🔴 **Check `STRIPE_SECRET_KEY` starts with `sk_test_`** | If production has been switched to live keys, local testing charges real cards. |
| **Every test run writes real rows** | The queue the admin works from is the same database. Seed data and probes go into production. |
| **`npm run flow` and `npm run db:seed` become destructive** | The flow probe creates and sweeps submissions; the seed inserts samples. **Do not run either** while pointed at production. |
| **Uploads land in the production Blob store** | Under a folder keyed by a local submission id, so nothing collides — but the production sweep won't clean them up, because it works from production rows. They become orphans. |
| **`AUTH_SECRET` is shared** | A session minted locally is valid in production, and vice versa. |

To go back: `mv .env.local.backup .env.local`.

**If all you need is the production upload path** — the one thing local testing
genuinely cannot reach — set only `BLOB_READ_WRITE_TOKEN` in your existing
`.env.local` and change nothing else. The storage seam switches to Blob,
`supportsDirectUpload` becomes true, and the browser takes the real direct-upload
route against your local database. None of the risks above apply.

### Backend handoff — needs Aaron's account access

The app is **already deployed** at `baseball-sensei.vercel.app`, and Resend is
already verified and sending. What remains needs a dashboard login or a
production credential, so none of it can be done from a repo checkout alone.

- [x] ~~**Apply migrations `0001` and `0002` to Supabase**~~ — done 2026-07-30.
      Verified from outside: `/start` renders (needs the `settings` table) and
      step 1 submits (needs `draft` in the status enum).
- [x] ~~**Set `CRON_SECRET` in Vercel**~~ — done. `/api/cron/sweep` answers 401
      rather than 503, which is the tell that the value reached the running
      deployment. It needed a redeploy, not just a save.
- [ ] ⚠️ **Confirm `NEXT_PUBLIC_SITE_URL` = `https://www.baseball-sensei.com`.**
      It builds the links inside customer emails and the redirect target for
      `/api/payment/return`. **The flow cookie is host-only** (no `Domain`
      attribute), so if this names the apex while customers browse `www`, a
      3-D Secure customer comes back *after being charged* to a host that
      doesn't send their cookie and sees "session expired". Check the apex
      redirects to `www` too, so there's one canonical host. `NEXT_PUBLIC_*` is
      inlined at build time — changing it needs a redeploy.
- [ ] 🔴 **Create the Blob store and set `BLOB_READ_WRITE_TOKEN`**, then
      redeploy. **This is currently broken and blocks the funnel** — confirmed
      2026-07-30: production serves `uploadMode: "proxy"`, which is the app
      saying no Blob store is configured.

      With no token the storage seam falls back to local disk, and on Vercel
      *no upload can succeed*: a file over ~4.5 MB is rejected by the platform
      before it reaches our code, and a smaller one hits a filesystem that is
      read-only outside `/tmp`. Vercel → Storage → Create Blob store, connect it
      to the project, redeploy.

      To check from outside: `curl -su USER:PASS <site>/start | grep -o
      'uploadMode[^,}]*'` — it must say `blob`, not `proxy`.
- [ ] **Live-mode Stripe keys + webhook**, when going live. Test and live are
      separate endpoints with separate signing secrets.

Already done, for the record: **Resend domain verified**, `RESEND_API_KEY` and
`EMAIL_FROM` set (§8). Note that email is now load-bearing for the product — the
verification code travels through it.

---

## 2. Local development

No cloud accounts are needed to develop — Postgres runs in Docker and files are
saved to local disk. You only need **Stripe test keys** to exercise payment.

```bash
docker compose up -d db            # Postgres 16 on localhost:5434
cp .env.example .env.local         # fill Stripe test keys + AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate                 # apply the schema
npm run db:seed                    # first admin (+ samples, since SEED_SAMPLES=1 in dev)
npm run dev                        # http://localhost:3000
```

Two probes exercise the server side without a browser:

```bash
npm run flow                       # the 4-step customer flow + the retention sweep
npm run payment                    # a real Stripe test-mode payment, end to end
```

Sign in at `/login` as **`yuta@example.com` / `changeme123`** → `/admin`.

- `DATABASE_URL` in `.env.example` already points at the docker db.
- `STORAGE_DIR` defaults to `./.storage` (gitignored). In dev, uploads are proxied
  through `/api/upload`; **production uses a different path** (direct to Blob), so
  that one cannot be exercised locally.
- **Without `RESEND_API_KEY` you cannot get past step 2 in a browser** — the code
  is emailed. `npm run flow` covers that path without email.
- Forward Stripe webhooks locally with
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

### Squashing the migration history — baseline before you deploy

Collapsing many migrations into one leaves every existing database holding the
schema but no record of the file describing it. **Drizzle decides what to apply
by timestamp alone** — `pg-core/dialect.js` runs anything whose `when` is greater
than the newest row in `drizzle.__drizzle_migrations`, and never compares hashes
to decide what to skip. A squash written today is newer than everything applied,
so `drizzle-kit migrate` reads it as pending and runs `CREATE TYPE …` against
types that already exist.

The result is a **failed production build** — which is the designed-safe outcome
(`migrate-on-deploy.mjs` fails rather than deploying, so the previous deploy keeps
serving), but the deploy stays blocked until someone diagnoses it.

So after squashing, and **before deploying**, baseline every database that already
has the schema — production first, then any local one:

```bash
npm run db:baseline                # dry run: reports, changes nothing
npm run db:baseline -- --apply     # rewrites the ledger

# production, from a checkout:
POSTGRES_URL_NON_POOLING="<supabase direct url>" npm run db:baseline
```

It computes the hash from the migration file rather than taking it on trust,
**refuses if the schema doesn't already match** the squash — every table, every
column, and every enum, all parsed out of the SQL. Columns matter as much as
tables: a database that stopped a few migrations short still has all six tables,
and it's the columns those migrations added that are missing. Anything absent
means the migration has real work to do and should be *run*, not marked done.

It then backs the old rows up to `drizzle.__drizzle_migrations_backup_<when>`
inside the same transaction and verifies before committing. Re-running it is a
no-op.

To undo, restore from that backup table — the exact statements are printed on
success.

**A fresh database needs none of this**: with nothing applied, the squash runs
normally and the script refuses on purpose.

---

## 3. Create the production accounts

- [ ] **Supabase** — a project (this is the Postgres database). Note the
      connection strings under Project → Settings → Database.
- [ ] **Vercel Blob** — a Blob store in the Vercel project (Storage → Blob).
- [ ] **Stripe** — account with business/bank details completed so it can accept
      live charges. Activation can take a day or two — start early.
- [ ] **Resend** — account plus a **verified sending domain** (DNS can take
      hours — do this first, not on launch day).

---

## 4. Deploy to Vercel

- [ ] **Import the repo** into the client's Vercel account (Add New → Project).
      Commit author emails must match a GitHub account, or Vercel blocks the
      build.
- [ ] **Add the Supabase integration** (Vercel → Storage, or the Supabase
      Marketplace connector). It writes `POSTGRES_URL` (pooled) and
      `POSTGRES_URL_NON_POOLING` (direct) into the project. Our code reads
      `DATABASE_URL || POSTGRES_URL`, so no aliasing is needed.
      - **Development environment: leave unchecked** — local dev uses Docker.
      - **Custom prefix: leave blank** so the names are `POSTGRES_URL` etc.
- [ ] **Add the Blob store** → it sets `BLOB_READ_WRITE_TOKEN`. With a token
      present, the app uses Blob; without it, local disk.
- [ ] **Set the remaining env vars** (next section), for **Production**.
- [ ] **Run the migrations against prod** — from a checkout, pointing at the
      *direct* (non-pooling) URL:
      ```bash
      POSTGRES_URL_NON_POOLING="<supabase direct url>" npm run db:migrate
      ```
- [ ] **Seed the first admin** (no samples in prod):
      ```bash
      POSTGRES_URL_NON_POOLING="<direct url>" \
      SEED_ADMIN_EMAIL="yuta@theirdomain.com" SEED_ADMIN_PASSWORD="<strong>" \
      npm run db:seed
      ```
- [ ] **Redeploy** so the env vars take effect.

---

## 5. Environment variables

Set in **Vercel → Settings → Environment Variables**, for **Production** (and
Preview with test-mode keys if you want branch previews).

| Variable | Value / source | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://www.baseball-sensei.com` — no trailing slash, and **must match the host customers browse** (see §1) | Yes |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe `pk_live_…` — browser-visible by design | Yes |
| `STRIPE_SECRET_KEY` | Stripe live `sk_live_…` | Yes |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe webhook in step 6 (`whsec_…`) | Yes |
| `STRIPE_PRICE_ID` | Optional — else priced inline from `src/shared/config/site.ts` | No |
| `AUTH_SECRET` | Session secret — `openssl rand -base64 32` | Yes |
| `POSTGRES_URL` | Supabase pooled URL (set by the integration) | Yes* |
| `DATABASE_URL` | Only if not using the Supabase integration | Yes* |
| `BLOB_READ_WRITE_TOKEN` | Set by the Blob store | Yes |
| `CRON_SECRET` | Retention-sweep guard — `openssl rand -hex 32`. **Unset = the sweep refuses to run** | Yes |
| `RESEND_API_KEY` | Resend key. **Unset = emails skipped — and the customer flow then cannot be completed, because the verification code travels by email** | **Yes** |
| `EMAIL_FROM` | Verified sender, e.g. `Baseball Sensei <hello@theirdomain.com>` | No |

\* Provide one of `POSTGRES_URL` / `DATABASE_URL`. **Do not** set
`SEED_SAMPLES` in production.

**`RESEND_API_KEY` moved from optional to required** when email verification became
step 2 of the flow. Everywhere else a missing key degrades honestly (sends are
skipped and logged); here it is a hard stop — nobody can get past step 2.

**Upload limits and retention windows are NOT env vars.** They live in the
database and the admin edits them at `/admin/settings`.

Env vars are read in exactly one place — `src/shared/config/env.ts` (server) and
`publicEnv.ts` (browser). Required values throw at point of use naming the
variable.

---

## 6. The Stripe webhook

Do this **after** the domain is final.

- [ ] Stripe → Developers → Webhooks → **Add endpoint**
      `https://<site>/api/webhooks/stripe`
- [ ] Event: **`payment_intent.succeeded`** (and `payment_intent.payment_failed`
      for visibility)
- [ ] Copy the signing secret → `STRIPE_WEBHOOK_SECRET`, then redeploy

> Test mode and live mode have **separate** endpoints and **separate** signing
> secrets. A test secret in production fails every signature check — payments
> succeed and no submission row appears.

---

## 7. Domain & DNS

- [ ] Add the custom domain in **Vercel → Settings → Domains**
- [ ] Point the registrar's DNS at the records Vercel provides
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the final domain **exactly**, then redeploy
- [ ] Re-point the Stripe webhook (step 6) at the final domain

---

## 8. Email — Resend (✅ done)

**`baseball-sensei.com` is verified in Resend and sending is live** (2026-07-30).
A real "feedback ready" email was delivered to a Gmail inbox.

Current setup:

| Piece | Value |
| --- | --- |
| Verified domain | `baseball-sensei.com` (Resend, region **us-east-1**) |
| DNS records | DKIM `TXT` `resend._domainkey`; SPF `MX` + `TXT` on the **`send.`** subdomain — added in **GoDaddy** (auto-configured) |
| Send from | `EMAIL_FROM = "Baseball Sensei <contact@baseball-sensei.com>"` (set in Vercel → redeploy) |
| API key | `RESEND_API_KEY` (set in Vercel) |
| **Receiving** | **Google Workspace** on `contact@baseball-sensei.com` (root MX) — replies to transactional email land in the admin's inbox |

**Why Google + Resend coexist:** Resend's records live on the `send.` subdomain
and `resend._domainkey`; Google's MX/SPF live on the **root** and
`google._domainkey`. Different hosts → no conflict. Sending (Resend) and receiving
(Google) are independent.

**How the app sends email** (for adding new ones — e.g. a signup verification
mail): everything goes through `shared/email` — `sendEmail({ to, subject, html })`
(best-effort; the `from` is `EMAIL_FROM`, never per-send) + `emailShell(heading,
body, cta?)` for the brand wrapper. Each message is one `domains/<slice>/api/
xEmail.ts` file. Full pattern + a copy-paste example: **[CLAUDE.md §7 → Resend](CLAUDE.md#7-third-party-tool-integrations)**.

**To move it to a different domain/client:** repeat in that Resend account (add
domain → add the DNS records → verify → set `EMAIL_FROM` on the domain →
redeploy). Sends skip-and-log if `RESEND_API_KEY` is unset, and land only in the
account owner's inbox until a domain is verified.

> **This stopped being optional on 2026-07-30.** The customer flow's step 2 emails
> a 6-digit verification code, so email is now load-bearing for the *product*, not
> just for confirmations: with `RESEND_API_KEY` unset or the domain unverified, a
> real customer cannot get past step 2 and cannot buy anything. Everywhere else a
> missing key degrades honestly (skip and log); here it is a hard stop.


---

## 9. End-to-end test (test mode)

Run the whole thing on **Stripe test keys** before going live.

- [ ] From `/start`, fill in the details → **"Continue to email verification"**
- [ ] The 6-digit code arrives by email; enter it → step 3
- [ ] Attach a file; the card shows a **progress bar**, then a tick. Press
      **"Upload another file"** and attach a second
- [ ] Try a disallowed type (e.g. `.zip`) → refused with a clear message
- [ ] Try a file over the size limit → refused naming the limit
- [ ] **Reload the page mid-flow** → it resumes on the right step with the files
      still listed
- [ ] Continue to payment; pay with test card `4242 4242 4242 4242`
- [ ] The card field is **on our page** (no redirect); the confirmation appears
- [ ] The **receipt email** arrives listing every file by name and size
- [ ] A submission appears in `/admin` with all its files listed
- [ ] In `/admin`, assign a coach → the row moves to **Assigned**
- [ ] Sign in as that coach at `/login` → `/coach` → **download each file** →
      upload a feedback file → the row goes **Complete**
- [ ] "Feedback ready" email arrives; its link downloads the feedback file
- [ ] On `/status`, the customer's email shows the submission and a working
      **Watch feedback** button
- [ ] Repeat the upload **on a real phone** — mobile upload is the highest-risk
      part, and the production upload path (direct to Blob) is the one piece that
      cannot be exercised locally
- [ ] Test a **3-D Secure** card (`4000 0027 6000 3184`) — it redirects out and
      back through `/api/payment/return`
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/sweep`
      returns a JSON report; without the header it returns 401

---

## 10. Flip to live

- [ ] Swap `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to live keys
- [ ] **Recreate the Stripe webhook in live mode** and update `STRIPE_WEBHOOK_SECRET`
- [ ] Redeploy
- [ ] One **real low-stakes purchase**, end to end, then refund it in Stripe
- [ ] Confirm the money (and the refund) land in the client's Stripe balance

---

## 11. Decommission the dev setup

- [ ] Delete/pause the **dev Vercel project** and its `*.vercel.app` URL
- [ ] Disable/delete the **dev Stripe webhook** (test mode)
- [ ] Revoke any **dev-only keys/tokens** no longer in use
- [ ] **Change the admin email back to the client** if you swapped it during the
      handoff (a swapped-and-forgotten admin login locks the client out)
- [ ] Re-run the step 9 test against production

---

## 12. The operator workflow

Everything runs from the **portal** — no spreadsheet. Operators sign in at
`/login`.

**Statuses:** `draft → awaiting_payment → new → assigned → in_review → complete`.
The customer flow sets the first three; the portal drives the rest. Only paid
submissions (`new` and later) appear in the queue — a `draft` or an abandoned
`awaiting_payment` is someone who didn't finish, and the nightly sweep clears it.

### Admin (the admin) — `/admin`

1. The **Submissions** queue lists every submission, newest first. A `new` row
   means a paid submission is in, with its files, and needs a coach.
2. **Download** any of the customer's files from the queue if you want to look
   first. A file struck through has been deleted by the retention sweep.
3. **Assign a coach** from the row's Coach dropdown → the row becomes `assigned`.
4. **Coaches** (`/admin/coaches`) — add a coach (name, email, temporary password,
   specialties, languages). That creates their login and profile.
5. **Settings** (`/admin/settings`) — the largest file, how many files per
   submission, and how long uploads are kept after a review completes or after an
   unpaid submission is abandoned. Changes take effect immediately; retention
   changes apply at the next nightly sweep.

### Coach — `/coach`

1. **To review** lists the submissions assigned to that coach, each with every
   file the customer sent.
2. **Download** each file to review locally.
3. **Send feedback** — upload the feedback file. That marks the submission
   `complete` and **emails the customer** their download link automatically. It
   also starts the retention clock on the customer's uploads — the feedback file
   itself is never deleted.

### Customer (no login)

- Checks `/status` with their email; downloads feedback once it's ready.

---

## 13. Endpoint reference

| Route | Trigger | What it does |
| --- | --- | --- |
| `POST /api/upload/blob` | `/start` step 3, **prod** | Issues a scoped, short-lived Blob token so the browser can upload direct |
| `POST /api/upload/complete` | `/start` step 3, **prod** | Records a file the browser uploaded direct; re-checks it belongs to this submission |
| `POST /api/upload` | `/start` step 3, **dev only** | Takes the bytes through us onto local disk |
| `POST /api/webhooks/stripe` | Stripe, on `payment_intent.succeeded` | Marks the submission paid (`new`) + sends the receipt |
| `GET /api/payment/return` | Stripe, after 3-D Secure | Confirms server-side, forwards to `/start` |
| `GET /api/files/[id]` | operator | Streams one uploaded file (401 without a session; **410** once swept) |
| `POST /api/feedback/upload` | coach | Stores feedback, → `complete`, feedback-ready email (owner-only) |
| `GET /api/feedback/[id]` | customer | Streams the feedback file once `complete` |
| `POST /api/status` | `/status` | Email-keyed lookup of the customer's submissions |
| `GET /api/cron/sweep` | Vercel Cron, nightly 04:00 UTC | Deletes uploads past their retention window. **`CRON_SECRET` required** |

Steps 1, 2 and 4 of the customer flow use **Server Actions**, not routes — only
the things that genuinely need HTTP stayed as endpoints.

The Stripe webhook verifies its signature and is idempotent: a submission already
in a paid status is left untouched, so a retry sends no second receipt.

**Why uploads bypass our own server in production:** a Vercel serverless request
body is capped near 4.5 MB, and a phone video is far larger. The browser uploads
straight to Blob and only tells us where it landed.

---

## 14. Troubleshooting

**Payment succeeds but no submission appears.**
Stripe → Webhooks → the endpoint's deliveries. A 400 is a wrong signing secret
(test secret in prod is the usual cause); a 500 is a DB write — check the Vercel
function logs and that `POSTGRES_URL`/`DATABASE_URL` is set.

**Upload or download fails in prod but works locally.**
`BLOB_READ_WRITE_TOKEN` missing → the app falls back to local disk, which is
ephemeral on Vercel. Set the token. Very large files may hit the platform body
limit — see Pending changes.

**Customer got no email.**
Emails are best-effort. Check the Vercel logs for `[email]` lines, that
`RESEND_API_KEY` is set, and that the domain is verified.

**Everything broke right after a domain change.**
The Stripe webhook URL. See the warning at the top.

---

## 15. Pending changes

| Change | Status |
| --- | --- |
| 🔴 **Rotate the production database password** | **Before handover/close-out.** It was pasted into a chat transcript on 2026-08-05 to run the ledger baseline, so treat it as exposed. Supabase → Project Settings → Database → Reset database password; the Vercel integration refreshes its own vars. **The underlying cause is worth fixing too** — Ben has no Supabase or Vercel login ([§1](#1-ownership-model)), so credentials reach him by hand. Grant project access instead of passing a secret a second time |
| ~~🔴 **Baseline production before deploying the squashed migration history**~~ | ✅ **Done 2026-08-05.** Production was at `0016` with all 70 columns present; the ledger now holds the squash alone and the original seventeen rows are preserved in `drizzle.__drizzle_migrations_backup_1785909077580` |
| ~~🔴 **Apply migrations `0001` + `0002` to Supabase**~~ | ✅ **Stale — cleared 2026-08-05.** Production carries all six tables with live data (27 submissions, 44 trail events), including `submission_event` and `settings`, which only exist from migrations `0011`/`0012`. The schema is well past `0002`. Verified by REST probe, not by reading the ledger — see the note below |
| 🔴 **Set `CRON_SECRET` in Vercel** | **Aaron** — the retention sweep returns 503 without it |
| **Stripe keys + webhook** (§5–§6) | **The last launch blocker for money** — no payments until done |
| ~~**Verify the Resend domain + set `EMAIL_FROM`**~~ | ✅ Done — domain verified, sending live (§8). Now load-bearing: the verification code is emailed |
| ~~**Coach edit**~~ | ✅ Done — `/admin/coaches/[id]`. (Coach *deactivate toggle* exists; hiding inactive coaches from the assign list is a small follow-up) |
| ~~**Customer signup + email verification**, **upload-and-pay**~~ | ✅ **Landed** 2026-07-30 — the four-step flow on `/start` |
| ~~**Upload before payment**~~ ([ADR 009](docs/decisions/009-upload-before-payment.md)) | ✅ **Built** — with email verification, multi-file upload, and a retention sweep |
| ~~**Large-file uploads**~~ | ✅ **Built** — the browser uploads direct to Blob ([ADR 011](docs/decisions/011-client-direct-uploads.md)). It was not a "revisit for prod": at ~4.5 MB per request body, video upload could never have worked in production |
| **Test a real card + 3-D Secure in a browser** | Everything around it is proven; a card needs a human |
| **Real coach content + photography** for the landing page | Blocks launch — the current copy is wireframe placeholder |
| **The remaining 3 emails + the admin's approval step** ([`shared/email/_EmailDocumentation.md`](src/shared/email/_EmailDocumentation.md)) | Agreed, not built — needs a new status and an admin approve action |
| **Point the site at `baseball-sensei.com`** + update `NEXT_PUBLIC_SITE_URL` | Optional — on the `.vercel.app` URL today |
| **Forgot-password** (email reset) | Deferred — needs a token flow (change-password already shipped) |

---

## 16. The release pipeline — setting it up

The *why* and the design are [`documentation/_ReleaseDocumentation.md`](documentation/_ReleaseDocumentation.md);
this is what to click, in order. **Phase 0 is done** (version, changelog, floors, `check:release`,
the version stamp, `v1.0.0-rc.1`). Everything below needs a dashboard login, so it is Aaron's unless
Ben is granted access first — which is the better fix ([§1](#1-ownership-model)).

**The one rule that survives every step: no rung ever holds another rung's credentials.** A
production URL or token goes into a non-production environment under no name the app reads — the
`PROD_*` convention in `.env.example` — or not at all.

### Phase 1 · qa — previews get their own data · *~half a day*

- [ ] **Supabase → New project** `baseball-sensei-qa` (same org). Copy its pooled and direct URLs.
- [ ] From a checkout, migrate and seed it:
      ```bash
      POSTGRES_URL_NON_POOLING="<qa direct url>" npm run db:migrate
      DATABASE_URL="<qa direct url>" SEED_SAMPLES=1 npm run db:seed && DATABASE_URL="<qa direct url>" npm run db:ladder
      ```
- [ ] **Vercel → Storage → Create Blob store** `baseball-sensei-qa`. Do **not** connect it to the
      Production environment.
- [ ] **Vercel → `baseball-sensei` → Settings → Environment Variables → Preview only:**
      `POSTGRES_URL` + `POSTGRES_URL_NON_POOLING` (qa), `BLOB_READ_WRITE_TOKEN` (qa store),
      Stripe **test** `sk_test_` / `pk_test_`, `STRIPE_WEBHOOK_SECRET` (any `whsec_` — previews get
      no webhook), `AUTH_SECRET` (**a new one** — a session minted on qa must not open prod),
      `CRON_SECRET`, `QA_TOKEN`, `RESEND_API_KEY` + `EMAIL_FROM`, `BASIC_AUTH_*`, and **`RUNG=qa`** —
      the key that lets a preview build migrate; without it previews still skip, as they always have.
      **Leave `NEXT_PUBLIC_SITE_URL` unset** — the code falls back to the preview's own host.
- [ ] Redeploy any open PR and confirm on its preview: the footer reads `v1.0.0 · <sha> · qa`,
      `/status` works, one upload lands in the qa Blob store. When the qa database drifts (two PRs
      with conflicting migrations): `QA_DATABASE_URL="<qa direct url>" npm run reset:qa -- --yes`.
- [ ] Done when a PR carrying a migration previews correctly against rows that are not in production.

### Phase 2 · staging — a second Vercel project · *~one day, plus DNS*

- [ ] **Delete the `baseballsensai` project** (misspelled duplicate; fails every push).
- [ ] **Vercel → Add New → Project** from the same repo: `baseball-sensei-staging`. Production
      branch **`main`**. Move Phase 1's Preview variables *to this project* (Preview scope) and remove
      them from the prod project; on the prod project set **Ignored Build Step** to skip anything that
      is not `VERCEL_ENV=production`, so each PR builds once, here, against qa.
- [ ] **Supabase → New project** `baseball-sensei-staging`; **Vercel → Blob store**
      `baseball-sensei-staging`. Set the staging project's **Production** variables: staging DB + Blob,
      Stripe test keys, a **new** `AUTH_SECRET`, `CRON_SECRET`, `QA_TOKEN`, Resend, Basic Auth,
      **`RUNG=staging`**, and `NEXT_PUBLIC_SITE_URL=https://staging.baseball-sensei.com` **explicitly**
      (3-D Secure must return to the host the flow cookie was set on). On the prod project set
      **`RUNG=prod`** (Production scope) so its footer stays clean.
- [ ] **GoDaddy → DNS:** CNAME `staging` → `cname.vercel-dns.com`. **Vercel → staging project →
      Domains:** add `staging.baseball-sensei.com`.
- [ ] **Stripe → Developers → Webhooks (test mode):** add
      `https://staging.baseball-sensei.com/api/webhooks/stripe` for `payment_intent.succeeded` +
      `payment_intent.payment_failed`; put its `whsec_` in the staging project. Redeploy.
- [ ] Run the mirror once, from a checkout, with both DIRECT urls under the names the app never reads:
      ```bash
      PROD_DATABASE_URL="<prod direct>" STAGING_DATABASE_URL="<staging direct>" \
      SEED_ADMIN_EMAIL="<staging admin>" SEED_ADMIN_PASSWORD="<strong>" npm run mirror:staging -- --yes
      ```
      Then open `/admin` on staging: production-shaped rows, `staging+…` addresses, files showing as
      swept, and the scrub's own proof line at the end of the output reading `0 | 0 | 0 | 1`.
- [ ] Done when a merge to `main` deploys to staging, a test card and a 3-D Secure card clear there
      against staging's own webhook, and production is untouched throughout.

### Phase 3 · prod changes only by promotion · *~half a day, then go-live*

- [ ] **GitHub:** create `production` at the commit currently live
      (`git branch production <sha> && git push origin production`).
- [ ] **Vercel → `baseball-sensei` → Settings → Git → Production Branch: `production`.**
- [ ] **GitHub → Settings → Rules:** `main` requires a PR with `static` + `db` green; `production`
      restricts pushes to the two account holders and allows their force-push (rollback);
      `v*` tags cannot be deleted or moved.
- [ ] Rehearse on the staging project: point its production branch at `staging-release`
      temporarily, then `npm run promote -- v1.0.0-rc.1 --branch staging-release`, cut an `rc.2`,
      promote it, promote `rc.1` again (a rollback). Record the outcome in `_ReleaseDocumentation.md`
      §1d, and point staging back at `main`.
- [ ] **Go-live is the first real promotion.** Walk the release itinerary on staging, do every item
      under `Operate` in `CHANGELOG.md` `[1.0.0]`, then:
      ```bash
      npm run release -- 1.0.0     # cuts the changelog section, commits, tags v1.0.0
      npm run promote -- v1.0.0    # fast-forwards production to the tag; Vercel deploys
      ```
      Confirm the footer on `www` reads `v1.0.0`, make one real low-stakes purchase, refund it.
      Clear `BASIC_AUTH_*` on **production only**.
- [ ] Done when a push to `main` no longer changes `www`.

### After that

Phase 4 (the rollback floor enforced at build) and Phase 5 (document sweep) are code, not clicks —
see the Documentation §4. The nightly sweep, the QA probe and the E2E all keep working unchanged;
they just start running on the rung they were meant for.

---

_Companion to [CLAUDE.md](CLAUDE.md) (architecture and intent) and
[README.md](README.md) (developer quick start)._
