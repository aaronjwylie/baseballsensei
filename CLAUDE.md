@AGENTS.md

# CLAUDE.md — Baseball Coaching Platform (v1)

**Project Handoff — Version 4 Proposal**
**Repository:** https://github.com/aaronjwylie/baseballcoach
**Status:** Built through ~Sprint 4 and deployed. Realigning to this spec — see [§0](#0-where-this-project-actually-is).

This document is the single source of truth for Claude Code building this project. Read it fully before touching any code. When it conflicts with intuition, this file wins. When it conflicts with an SDK's docs, the SDK's docs win — but flag the discrepancy.

**Operational detail lives in [OPERATIONS.md](OPERATIONS.md)** — account setup, database and storage provisioning, webhook configuration, DNS, and the operator's daily workflow. This file owns *intent*; that file owns *what to click*.

---

## Table of Contents

0. [Where this project actually is](#0-where-this-project-actually-is)
1. [Project Northstar](#1-project-northstar)
2. [Non-Goals & Anti-Scope](#2-non-goals--anti-scope)
3. [Architecture](#3-architecture)
4. [Tech Stack — Locked Decisions](#4-tech-stack--locked-decisions)
5. [Repository Structure (FSD)](#5-repository-structure-fsd)
6. [Environment Variables](#6-environment-variables)
7. [Third-Party Tool Integrations](#7-third-party-tool-integrations)
8. [Data Model (Postgres)](#8-data-model-postgres)
9. [Webhook Contracts](#9-webhook-contracts)
10. [Build Status](#10-build-status)
11. [Coding Standards](#11-coding-standards)
12. [Common Pitfalls](#12-common-pitfalls)
13. [Definition of Done](#13-definition-of-done)
14. [When to Stop and Ask](#14-when-to-stop-and-ask)
15. [Glossary](#15-glossary)

---

## 0. Where this project actually is

This document was written as a pre-build handoff. **The build ran ahead of it.**
A working, deployed, end-to-end paid flow already exists, and in several places
it diverges from what's specified below. This section is the reconciliation, so
that nothing downstream inherits a false premise.

### The 2026-07-29 direction change — operator portal + Postgres

The biggest move since kickoff, recorded in [ADR
007](docs/decisions/007-portal-and-postgres-retire-airtable.md) (and storage in
[ADR 006](docs/decisions/006-object-storage-over-mux.md)). The whole document
below now reflects it; this note is the one-paragraph orientation.

The operator side becomes a **custom portal** instead of Airtable:

- **the admin and the coaches log in.** Admin (the admin): all submissions, coach
  management, assignment. Coach: their assigned submissions — download the files,
  upload feedback, mark complete. **Customers still don't log in** — paid links +
  the `/status` email lookup, unchanged.
- **Vercel Postgres** is the database (via **Drizzle**); **Auth.js** guards the
  two operator roles. **Airtable, Make.com, and Mux are gone.**
- **Object storage** (Vercel Blob in prod; local disk in dev) holds both the
  customer video and the coach's feedback file.

Retires [ADR 001](docs/decisions/001-airtable-as-db.md) and
[ADR 002](docs/decisions/002-passthrough-holds-record-id.md). Still in force: the
FSD structure, the naming sweep, Zod, and Stripe Elements
([ADR 005](docs/decisions/005-stripe-elements-over-checkout.md)) — the pivot
changes the storage and operator layers, not those. The customer-facing flow
(pay → upload → status → feedback email) is unchanged.

**Status:** **deployed to production** at `baseball-sensei.vercel.app` (merged to
`main`). Supabase Postgres, Vercel Blob, jose auth, and Resend email are all wired
and working; Stripe keys + webhook are the last piece before the funnel can take
real payments ([OPERATIONS.md](OPERATIONS.md)).

### What's built — the platform pivot is done

The customer funnel (landing, player-info + Stripe Elements, upload, status)
**and** the operator portal (admin + coach) run end to end on **Postgres + object
storage + jose auth**, live in production — Airtable and Mux are gone. Verified:
login + roles, the admin submissions queue with **status filters**, **editable
coaches** + assignment, the coach's video download + **feedback delivery**, the
customer's status lookup + feedback download, and **operator change-password**
(`/account`). `next build` and `eslint` are clean. Production runs on Supabase
(schema migrated, admin seeded), Vercel Blob, and **Resend email** (verified
`baseball-sensei.com` — a real "feedback ready" email delivered to a Gmail inbox).

### Decisions that outlived the pivot

These predate the platform pivot but still hold — each has an ADR:

- **One idempotent fulfillment, two callers** (webhook + the browser confirming) —
  handles the race between the customer returning from payment and the webhook
  landing ([ADR 003](docs/decisions/003-shared-idempotent-fulfillment.md)). It
  inverted with the flow — `ensureSubmission` became `markSubmissionPaid` — but
  the contract is unchanged.
- **Payment is verified against Stripe, never our own row** — a stale or forged row
  can't mint an upload.
- **Transactional email is best-effort, never throws** into a webhook or a portal
  action ([ADR 004](docs/decisions/004-best-effort-email.md)).
- **Stripe Elements, not hosted Checkout** ([ADR 005](docs/decisions/005-stripe-elements-over-checkout.md)) —
  payment stays on our page.

Retired by the pivot: the Mux `passthrough` trick ([ADR 002](docs/decisions/002-passthrough-holds-record-id.md))
— a submission's own uuid is the link now — and Airtable-as-database
([ADR 001](docs/decisions/001-airtable-as-db.md)).

### One name per concept — the spine

Still the invariant, now on Postgres: the storage column names live once — in the
owning domain's `model/<x>Table.ts` since 2026-08-05
([ADR 015](docs/decisions/015-schema-by-domain.md)), surfaced through
[`domains/submission/api/submissionRow.ts`](src/domains/submission/api/submissionRow.ts).
The domain model
([`domains/submission/model/submission.ts`](src/domains/submission/model/submission.ts))
is spelled the same in the form, the API, and the UI. **No other file turns a DB
row into a domain object** — if you're mapping columns anywhere else, you're in
the wrong file.

### Still open

- **The landing page is now Audrey's approved wireframe** (2026-07-30). Its coach
  section and photography are still placeholder and cannot go live as written.
- ~~Upload before payment~~ — **built** 2026-07-30
  ([ADR 009](docs/decisions/009-upload-before-payment.md)).
- **The Vercel production deploy**, a verified Resend domain, and a live-mode
  Stripe webhook ([OPERATIONS.md](OPERATIONS.md)).
- Nice-to-haves: coach edit/deactivate, resumable large-file uploads, React Email,
  shadcn/ui.

---

## 1. Project Northstar

### What we're building

An online baseball coaching platform where parents submit a **pack of files** — clips of their kid batting or pitching, plus any stills or documents that help — and receive expert feedback from coaches based in Japan. One submission is one review of that pack, not one video. Two audiences meet on it: **customers** get a smooth, professional funnel — land, verify their email, upload, pay, and receive feedback — and **operators** (the admin and his coaches) run the coaching workflow from a custom portal they log into. Payments run on Stripe, uploads and feedback files on object storage, transactional mail on Resend; everything else — submissions, coaches, assignment, feedback delivery — is our own application on our own database.

**Payment comes last.** Nobody pays for a submission whose upload then fails ([ADR 009](docs/decisions/009-upload-before-payment.md)), and nothing is retained until it clears — before that a submission is a scratch pad the customer can scrub by refreshing or walking away.

### The single most important sentence in this document

**Build exactly as much platform as the coaching workflow needs — and not one feature more.**

Every architectural decision follows from that. The customer funnel and the operator portal are both first-class and both custom, because both are where the product lives. But the portal exists to *run this business* — a queue, coach assignment, feedback hand-off — not to become a general SaaS. When a feature would serve scale we don't have yet, it's on the upgrade path, not in v1.

### The northstar goal

Give the admin a functional, paying-customer-ready product he and his coaches operate end-to-end themselves, built lean and kept small. The MVP validates the concept with ~10 early users before any further investment, and has a clear upgrade path as demand grows.

### What success looks like

- A customer can visit the landing page, pay via Stripe, upload a video, and receive coach feedback by email — all without friction
- the admin operates the workflow from his **admin portal** — managing coaches, assigning submissions, and tracking the queue at a glance
- Coaches **log into their own portal** to download assigned videos and upload their feedback response
- A submission moves from paid → uploaded → assigned → reviewed → delivered without developer intervention
- Operating costs are under ~$80 CAD/month at MVP volume
- The platform runs comfortably at this scale, and grows into more only when demand earns it

### The lean validation philosophy

The client is personally funding this as a side project to validate demand before committing to larger investment. Every decision — scope, tools, architecture — should be evaluated against this. Resist the instinct to build for scale you don't have. The operator portal is the *minimum* needed to run the coaching workflow, not a platform build-out; keep it that way.

---

## 2. Non-Goals & Anti-Scope

The following are **intentionally not built**. If a request would require adding any of these, stop and flag it as out of scope before writing code. Do not silently expand scope.

- **Customer accounts, signup flows, or customer login screens.** Customer identity stays email-based — the status lookup identifies returning customers by an unverified email. Operator logins (the admin + coaches) are in scope and are a different thing; customers never get an account.
  - **The 6-digit email verification in the flow is not an account** and was checked against this line before it was built: no password, no profile, nothing to sign into, one submission, expires in hours. It proves reachability so we can deliver what was bought. See [ADR 010](docs/decisions/010-verification-gates-upload.md) — including how to tell if that line ever gets crossed.
- **Customer dashboards** beyond the email lookup for submission status.
- **Operator features beyond running the coaching workflow.** The portal covers submissions, coaches, assignment, feedback hand-off, and the handful of upload/retention limits the admin tunes — not analytics suites, billing consoles, or anything that serves scale we don't have. The line is "does the admin need it to process a submission today?"
- **Subscription billing.** Per-submission payment only.
- **Automated PDF report generation.** Coaches deliver PDFs manually if at all.
- **Custom video annotation tools** (drawing on frames, slow-motion analysis, side-by-side comparison).
- **Multilingual UI.** English at launch. Translation module is a separate future engagement.
- **Stripe Connect for coach payouts.** the admin pays coaches manually outside the platform.
- **Native mobile apps.** iOS and Android are Phase 2.
- **Advanced analytics** beyond the submission queue and simple counts the portal shows.
- **Real-time coaching, chat, or live sessions.**
- **Japanese-specific payment methods** (Konbini, bank transfer). Stripe credit cards only.

If the admin or Audrey asks for any of these mid-build, respond: "That's outside the scope of v1. It's on the upgrade path — happy to scope it as a change order."

---

## 3. Architecture

One Next.js app on Vercel holds everything: the public customer funnel, the
operator portal, and the API routes that glue them to Stripe, storage, and
Postgres. There is no external database and no external automation platform —
the app is the system of record and the glue.

### System diagram

```
                        Next.js app on Vercel
┌──────────────────────────────────────────────────────────────────┐
│  CUSTOMER  (public, no login)     │  OPERATOR PORTAL  (auth)       │
│  Landing → /start, 4 steps:       │  Admin (the admin): queue,          │
│    1 details  2 verify email      │  coach mgmt, assignment,       │
│    3 upload   4 pay               │  settings (limits/retention)   │
│  → Confirm → Status lookup        │  Coach: download files,        │
│                                   │  upload feedback, complete     │
└───────────────┬───────────────────────────────────┬──────────────┘
                │     Server Actions + API routes    │
                ▼                                     ▼
   ┌──────────────────────────┐          ┌───────────────────────────┐
   │ Stripe (payments, LAST)  │          │ Object storage            │
   │  webhook → PaymentIntent │          │  Blob (prod) / disk (dev) │
   └───────────┬──────────────┘          │  uploads + feedback files │
               │                         └────────────┬──────────────┘
               │        browser ──uploads direct──────┘
               ▼                                      ▼
        ┌────────────────────────────────────────────────────┐
        │   Postgres  (system of record, via Drizzle)         │
        │   users · coaches · submissions ·                   │
        │   submission_files · settings                       │
        └───────────────────────────┬────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
            ┌──────────────┐                 ┌──────────────────┐
            │   Resend     │ customer mail:  │ Vercel Cron      │
            │  (email)     │ code · receipt  │ nightly retention│
            │              │ · feedback ready│ sweep            │
            └──────────────┘                 └──────────────────┘
```

### Key architectural principles

1. **Both surfaces are custom; the outside dependencies are few.** The customer funnel and the operator portal are ours. Stripe, object storage, and Resend are the only outside services — payments, files, and mail, the things not worth building.
2. **Postgres is the system of record.** One database, accessed through Drizzle. No second store, no external "database as a service" standing in for it.
3. **The app is the glue.** Webhook receipt, status transitions, email triggers, and assignment all live in Next.js API routes and server actions — no external automation platform.
4. **Every custom-built feature should justify its existence.** If a $20/month tool can do it and it isn't part of the product experience, use the tool.

### Hosting note (important)

**Deploy the Next.js app to Vercel.** The v4 proposal mentions GoDaddy for hosting — this refers to domain registration only. GoDaddy's standard hosting cannot run Next.js server-side code (API routes, webhooks, server components). The correct architecture is:

- **Vercel:** Hosts the Next.js app (free tier is sufficient for MVP volume)
- **GoDaddy:** Registers the domain
- **DNS:** Configured in GoDaddy, points to Vercel

If the admin or Audrey pushes back on this, escalate to Ben before changing the architecture.

---

## 4. Tech Stack — Locked Decisions

| Layer      | Choice                     | Notes                                                            |
| ---------- | -------------------------- | ---------------------------------------------------------------- |
| Framework  | Next.js 14+ (App Router)   | TypeScript, server components by default                         |
| Language   | TypeScript (strict mode)   | No `any`, no `// @ts-ignore` without comment                     |
| Styling    | Tailwind CSS + shadcn/ui   | Copy-in components, no UI library lock-in                        |
| Forms      | React Hook Form + Zod      | Schema-first validation, shared client + server                  |
| Payments   | Stripe Elements (embedded) | Not Stripe Checkout — embedded for brand control                 |
| Storage    | Vercel Blob                | Video + feedback files; **replaced Mux** — [ADR 006](docs/decisions/006-object-storage-over-mux.md) |
| Database   | **Vercel Postgres**        | **Replaced Airtable** — [§0 pivot](#0-where-this-project-actually-is) / [ADR 007](docs/decisions/007-portal-and-postgres-retire-airtable.md) |
| ORM        | **Drizzle** (preferred)    | For Postgres; decide vs Prisma at build                          |
| Auth       | **jose** session cookies   | First-party (not Auth.js) — [ADR 008](docs/decisions/008-jose-sessions-over-authjs.md); operator portal only, no customer auth |
| Email      | Resend + React Email       | Templates as React components                                    |
| Automation | **None**                   | **Make.com dropped** — logic lives in the app / portal           |
| Hosting    | Vercel                     | Free tier for staging, Pro for prod once needed                  |
| Domain     | GoDaddy                    | the admin's registrar of choice, DNS points to Vercel                 |
| Repo       | Single Next.js repo        | Not a monorepo                                                   |

### Do NOT introduce

- A **second** database or datastore — one Postgres, via Drizzle, is the record.
- A **different ORM** (Prisma, etc.) — Drizzle is the one.
- A **different auth library** (Clerk, Supabase Auth) — Auth.js covers the two operator roles, and there is no customer-facing auth at all.
- A state management library (Redux, Zustand) — React state is sufficient.
- A UI library beyond shadcn/ui (MUI, Chakra) — Tailwind + shadcn only.
- A custom email delivery setup (Nodemailer, SES) — use Resend.
- CSS-in-JS libraries — Tailwind only.

If one of these feels needed, the scope is probably wrong. Stop and flag it.

---

## 5. Repository Structure (FSD)

**The layout is specified in [`docs/design/structure.md`](docs/design/structure.md); the reasoning behind it is in [PRINCIPLES.md](PRINCIPLES.md).** This section used to hold a full tree; it was superseded on 2026-07-28 and reduced to a pointer, because two descriptions of one layout is exactly the drift Step 0 existed to kill.

The 30-second version:

```
src/
├── app/        Next.js routes + API handlers — thin
├── domains/    submission · checkout · verification · payment · upload ·
│               feedback · operator · settings · landing
└── shared/     the domain-less floor
```

**Domain-first, not layer-first.** A concept's data and its behavior live in *one* folder —
what a Submission *is* and what you *do* with it, together. The earlier plan here split them
across `features/` and `integrations/`; that was retired after reading the WRLD sandbox,
which had run the same experiment at larger scale and retired its own `entities/`-vs-`features/`
split.

The two invariants worth memorizing:

- **Every storage column name lives in one place** — the owning domain's `model/<x>Table.ts`, surfaced through `domains/submission/api/`. Split out of one shared file by [ADR 015](docs/decisions/015-schema-by-domain.md); `src/db/schema.ts` is a manifest for drizzle-kit and declares nothing.
- **Every `process.env` read lives in one file** — `shared/config/env.ts`.

Each domain carries a `_XxxDocumentation.md` — its northstar, its honest current state, and
the dated trail of decisions that shaped it. **Read the slice's doc before changing the
slice.** They are kept true in the same commit as the code.

---

## 6. Environment Variables

All env vars go in `.env.local` for dev and Vercel project settings for prod.
`.env.example` is the live source of truth for the full list; this block is the
shape.

```bash
# === Public (browser-safe) — read via shared/config/publicEnv.ts ===
NEXT_PUBLIC_SITE_URL="http://localhost:3000"        # no trailing slash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# === Server-only — read via shared/config/env.ts ===
DATABASE_URL="postgres://app:app@localhost:5432/baseball"  # dockerized in dev, Vercel Postgres in prod
AUTH_SECRET="..."                                    # Auth.js session/JWT secret

STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID="price_..."                          # optional — else priced inline from site.ts

# Object storage: local disk in dev, Vercel Blob in prod
STORAGE_DIR="./.storage"                             # dev only — local-disk root
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."           # prod only

CRON_SECRET="..."                                    # guards /api/cron/sweep; unset = the sweep REFUSES to run

RESEND_API_KEY="re_..."                              # unset = emails skipped, logged — but the
                                                     # flow can't complete without the code email
EMAIL_FROM="Baseball Sensei <hello@yourdomain.com>"
```

### `shared/config/` — the ONLY place `process.env` is read

Two files, split by **audience** so a client component never imports a module
full of secrets (see [structure.md §5](docs/design/structure.md)):

- `shared/config/env.ts` — server-only secrets (`DATABASE_URL`, `AUTH_SECRET`,
  Stripe secret, Blob token, Resend key, `CRON_SECRET`). Required values throw at
  point of use with a message naming the variable.

**Operator-tunable limits are not env vars.** Upload size, file count, and the two
retention windows live in the `settings` table and are edited at
`/admin/settings` — env is the developer's configuration, those are the admin's
([ADR 012](docs/decisions/012-retention-and-operator-settings.md)).
- `shared/config/publicEnv.ts` — the handful of `NEXT_PUBLIC_*` values the
  browser needs.

Nothing outside that folder reads `process.env`.

```typescript
// shared/config/env.ts (shape)
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  // ...
});

export const env = envSchema.parse(process.env);
```

---

## 7. Third-Party Tool Integrations

This section is the conceptual guide to each outside service and the two internal
seams (Postgres, storage). Follow the SDK docs for exact API calls.

### Stripe — payments

- Server: `stripe` SDK for creating PaymentIntents and verifying webhooks.
- Client: `@stripe/react-stripe-js` + `@stripe/stripe-js` for the embedded
  `<PaymentElement>` — payment stays on our domain, our branding ([ADR 005](docs/decisions/005-stripe-elements-over-checkout.md)).

**Payment is the last of four steps** ([ADR 009](docs/decisions/009-upload-before-payment.md)),
so by the time it runs the submission exists, the email is verified, and the files
are in.

Flow: `/start` step 4 calls the `createIntentAction` Server Action, which creates
a PaymentIntent carrying **only `metadata.submissionId`** and returns its
`clientSecret`. `<PaymentElement>` collects the card. On success the browser
confirms inline; a method needing a redirect (3-D Secure, wallets) comes back
through `GET /api/payment/return`, which confirms server-side. Either way Stripe
also fires `payment_intent.succeeded` to `POST /api/webhooks/stripe`. All paths
converge on `markSubmissionPaid()`, which is idempotent — whichever arrives first
flips the status to `new` and sends the receipt; the rest no-op.

### Object storage — uploads + feedback files

One `shared/storage` seam, two drivers behind a single interface: **local disk**
in dev (files under `STORAGE_DIR`), **Vercel Blob** in prod ([ADR 006](docs/decisions/006-object-storage-over-mux.md)).
The customer's uploads and the coach's feedback file both go through it, into a
folder per submission.

The seam also answers **`supportsDirectUpload`**, which is how the flow knows
whether the browser can upload straight to storage or must go through us
([ADR 011](docs/decisions/011-client-direct-uploads.md)).

- Upload: in production the browser uploads **straight to Blob** with a scoped,
  short-lived token from `/api/upload/blob`, then calls `/api/upload/complete` to
  record it; in dev the bytes go through `/api/upload` onto local disk. Each file
  gets a row in `submission_file`.
- Download: the coach's link resolves through `/api/files/[id]`, which checks the
  session and serves (or redirects to) the file — links stay stable and private
  across a driver swap.

No transcoding, no streaming — the coach downloads and scrubs locally.

### Postgres — system of record

- Accessed through **Drizzle**. The connection is `shared/db`; **each table is
  declared in the domain that owns it** ([ADR 015](docs/decisions/015-schema-by-domain.md)),
  with `src/db/schema.ts` a declaration-free manifest so drizzle-kit has one
  entry point. Every submission / coach / user fact is a column in exactly one
  of those files — one home per fact.
- Read and written by the domains, never by route files directly (see §3b).
- Email is lowercased on write and on lookup, so the status lookup matches
  regardless of case.

### Auth — operator identity (jose sessions)

First-party credentials auth, **not Auth.js** ([ADR 008](docs/decisions/008-jose-sessions-over-authjs.md)):

- Two roles: `admin` (the admin) and `coach`. **Customers never authenticate.**
- A `jose`-signed HS256 JWT in an httpOnly cookie (`shared/auth`). The DAL in
  `domains/operator` does the secure `requireSession` / `requireRole` checks close
  to the data; `proxy.ts` (Next 16's renamed Middleware) does an optimistic
  pre-filter, never the sole defence.
- Passwords are bcrypt-hashed and never leave `operatorApi.ts`. The first admin is
  **seeded** (`npm run db:seed`); the admin adds coaches from the portal — no
  self-signup.

### Resend — transactional email

Sending goes through **`shared/email`**, never the Resend SDK directly:

- `sendEmail({ to, subject, html })` — the transport. **Best-effort**: a non-2xx
  logs and never throws ([ADR 004](docs/decisions/004-best-effort-email.md)); if
  `RESEND_API_KEY` is unset it skips-and-logs. The **from** address is
  `EMAIL_FROM`, set once in env — never passed per-send.
- `emailShell(heading, bodyHtml, cta?)` — wraps body HTML in the brand shell
  (header, type, an optional `{ label, url }` button, footer).

Each message lives in the domain that owns it, as `api/xEmail.ts`.

**Nine messages, numbered ①–⑨ to match the path table**, plus two off-spine. The
full matrix is [`shared/email/_EmailDocumentation.md`](src/shared/email/_EmailDocumentation.md);
each message lives in the domain that owns its event.

**Five of the nine tell the admin something** — a payment landed, a coach picked work
up, a response is waiting, a customer collected. That's deliberate: a queue that
doesn't announce its own arrivals has to be *watched* instead of used. They go to
every `admin` in the `operator` table, read at send time, because the people who
should hear are exactly the people who can act — and an env var would let those
two drift the moment an operator changes.

**Two sends depart from ADR 004's best-effort default, in opposite directions:**

- **① the verification code fails the flow** when it can't be sent. Everywhere
  else a failed email is honest degradation — the work happened, someone wasn't
  told. Here the customer is *blocked* on the message, so swallowing it strands
  them on step 2 waiting for a code that was never sent.
- **⑨ the deletion warning is stamped even when the send fails.** Retrying
  nightly would turn one missed email into seven, which is worse than the miss.
  Nobody is blocked on a warning.

`sendEmail` returns a boolean and still never throws. "Best-effort" was always
about not failing a webhook; it never meant delivery should be *unknowable*.

**Escape customer-supplied values.** Filenames and player names land in HTML;
`paymentEmail.ts` has the helper and any new template needs the same treatment.

```typescript
// domains/<slice>/api/somethingEmail.ts
import { emailShell, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";

export function sendSomething(to: string, link: string) {
  return sendEmail({
    to,
    subject: `${site.name} — something happened`,
    html: emailShell(
      "Something happened",
      `<p>Tap below to see it.</p>`,
      { label: "Open", url: link },
    ),
  });
}
```

Call it best-effort — don't let a mail hiccup fail the surrounding mutation.

**Config (live in production):** `baseball-sensei.com` is **verified in Resend**
(DKIM + SPF on the `send.` subdomain, region us-east-1), sending enabled,
`RESEND_API_KEY` set in Vercel, and
`EMAIL_FROM = "Baseball Sensei <contact@baseball-sensei.com>"`. **Receiving** is
Google Workspace (root MX) — independent of Resend, so both coexist, and a
customer reply lands in the admin's `contact@` inbox. Dashboard/DNS detail:
[OPERATIONS.md §8](OPERATIONS.md).

### Vercel

**Role:** Hosting for the Next.js app.

**Integration approach:**

- Connect the GitHub repo to Vercel via the Vercel dashboard
- Set env vars in Vercel project settings (separate values for Production and Preview)
- Push to `main` → deploys to production
- Push to any branch → deploys a preview URL for client review

**Custom domain:** Configure in Vercel dashboard, point GoDaddy DNS to Vercel's provided A/CNAME records.

---

## 8. Data Model (Postgres)

The system of record is one Postgres database, **six tables**, accessed through
Drizzle. **Column names live in exactly one place** — the owning domain's
`model/<x>Table.ts` (surfaced to the domain via `domains/submission/api/`) — and
a migration is the only way they change. One home per fact.

The tables below are grouped for reading; on disk each sits with its domain
(`submission` · `submission_file` · `submission_event` in `domains/submission/model/`,
`coach` in `domains/coach/`, `operator` in `domains/operator/`, `settings` in
`domains/settings/`). **This section is where the cross-cutting rationale lives** —
why `collectedAt` duplicates the trail, why kinds are nouns and statuses
participles — because those sentences describe a tension *between* two
declarations and so belong to neither file ([ADR 015](docs/decisions/015-schema-by-domain.md)).

### `submission`

The spine. One row per request; every other domain orbits it. Created at **step 1
of the flow**, before verification, files, or payment — see
[ADR 009](docs/decisions/009-upload-before-payment.md).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key | our own id — the linkage key everywhere |
| `customerEmail` | text | always lowercased on write and lookup |
| `playerName` | text | |
| `playerAge` | integer | |
| `focus` | enum | `Hitting` · `Pitching` · `Fielding` · `Catching` · `Other` |
| `customerNotes` | text | the customer's words, never overwritten |
| `languages` | text[] | what the customer reads, declared at step 1. Intersected with the coach's to decide whether translation is needed |
| `internalNotes` | text | system messages + operator notes |
| `status` | enum | **twenty rungs** — see the ladder below |
| `emailVerifiedAt` | timestamptz, null | set when the 6-digit code is accepted; **the upload gate** |
| `verificationCodeHash` | text, null | bcrypt hash — the code itself is never stored |
| `verificationExpiresAt` | timestamptz, null | the flow window from issue |
| `verificationAttempts` | integer, default 0 | 5 before the code must be reissued |
| `stripePaymentId` | text, unique | PaymentIntent id — the webhook's idempotency key |
| `stripeAmount` | integer (cents) | |
| `paidAt` | timestamptz, null | |
| `assignedCoachId` | uuid, FK → `coaches.id`, null | set by the admin on assignment |
| `coachFileSet` | enum, null | **which language set the coach was sent** (step 8) |
| `customerFileSet` | enum, null | **which language set the customer was sent** (step 13) |
| `feedbackUrl` | text, null | legacy single-file locator; the response is now rows in `submission_file` |
| `feedbackEmailedAt` | timestamptz, null | idempotency guard on the feedback email |
| `collectedAt` | timestamptz, null | **the retention clock's anchor** — the customer's first download |
| `deletionWarnedAt` | timestamptz, null | guard on the one *scheduled* email; stamped even if the send failed |
| `filesPurgedAt` | timestamptz, null | when the sweep removed the files |
| `submittedAt` | timestamptz, default `now()` | |
| `completedAt` | timestamptz, null | delivery — the backstop clock counts from here |
| `archivedAt` | timestamptz, null | out of the active queue; orthogonal to status |
| `updatedAt` | timestamptz | **what the abandonment sweep measures from** — the last sign of life |

`customerNotes` and `internalNotes` stay separate so an operator can forward a
customer's words to a coach without hand-cleaning `[system]` lines out of them.

**`collectedAt` and `deletionWarnedAt` duplicate facts `submission_event` also
holds, deliberately.** The trail is history; these are the working values the
nightly sweep scans on, and a scan against a join is one we'd have to justify at
every row. Same relationship `status` has to its own events.

### `submission_file`

One row per file, **both directions**. The `kind` column is the four folders.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key | the id in `/api/files/[id]` |
| `submissionId` | uuid, FK → `submissions.id`, cascade | indexed |
| `kind` | enum | `intake` · `intake_translation` · `response` · `response_translation` |
| `filename` | text | the customer's own name for it — display only, never a path |
| `contentType` | text | |
| `sizeBytes` | integer | |
| `fileUrl` | text, **null** | storage locator. **Goes null when swept — the row survives** |
| `uploadedAt` | timestamptz, default `now()` | |

**Kinds are nouns, statuses are participles** (`_NomenclatureLaw.md` §2): the kind
is `intake_translation` (*what this file is*), the status is `intake_translated`
(*what has happened*). One stem, two axes, neither reading as the other.

Reads scope by **side**, not by a single kind — "the customer's files" means the
originals *and* their translation, because a translation sits beside its original
rather than replacing it.

The record outliving the bytes is deliberate: the portal can still say what was
sent. `/api/files/[id]` answers **410 Gone**, not 404.

### `submission_event`

The trail. One row per status transition.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key | |
| `submissionId` | uuid, FK → `submissions.id`, cascade | indexed |
| `status` | enum | the rung it moved to |
| `at` | timestamptz, default `now()` | |
| `actorId` | uuid, FK → `users.id`, null | **null is meaningful** — the customer and the cron have no session |
| `note` | text, null | why, for the operator overrides that owe an explanation |
| `kind` | enum | `status` · `email` — the trail records sends too, not only moves |
| `label` | text, null | which message, on an email event: the ①–⑨ handle |
| `outcome` | enum, null | `sent` · `delivered` · `bounced` · `complained` · `failed` |
| `messageId` | text, null, indexed | Resend's id — the delivery webhook's only handle on a submission |

**Outcomes append, they never update.** Overwriting "we sent it" with "it
bounced" loses that both were true and when — and a delivery three seconds later
reads very differently from one three minutes later.

**Chosen over one nullable `*At` column per rung**, and it answers strictly more: a
column remembers one moment, and a submission can reach the same rung twice once
an operator can reset a status. Written inside the same transaction as the update
that caused it, so the trail cannot disagree with `submissions.status`.

**The actor is read from the session, not passed in.** A parameter gets forgotten
eventually, and the forgotten case writes an anonymous event indistinguishable
from a legitimate one.

### `setting`

One row, always (`id` is fixed). The operator's knobs, edited at
`/admin/settings` — **not env vars**, because they belong to the admin rather than to
a deploy ([ADR 012](docs/decisions/012-retention-and-operator-settings.md)).

| Column | Type | Default |
| --- | --- | --- |
| `priceCents` | integer | 8000 |
| `maxFileSizeMb` | integer | 50 |
| `maxFilesPerSubmission` | integer | 5 |
| `retainCollectedDays` | integer | 30 |
| `retainDeliveredDays` | integer | 90 |
| `warnBeforeDeletionDays` | integer | 7 |
| `retainUnpaidHours` | integer | 24 |
| `updatedAt` | timestamptz | |

### `status` lifecycle — the ladder (enum, in order)

Twenty rungs. The enum's own order matches the ladder's, so `ORDER BY status`
means "how far along" without a lookup.

```
draft → awaiting_payment → new → assigned →
  intake_translator_assigned → sent_to_intake_translator →
  intake_translating → intake_translated →           (optional)
sent_to_coach → in_review → awaiting_approval →
  feedback_translator_assigned → sent_to_feedback_translator →
  feedback_translating → feedback_translated →       (optional)
complete → collected → resolved → purge_imminent → purged
```

**It is a path with branches, not a progress bar.** A coach who shares a
language with the customer takes `assigned → sent_to_coach` and
`awaiting_approval → complete` directly;
**eight** rungs are only touched when a submission needs translating. Anything
rendering this as a linear track will be wrong for most submissions.

Three rungs carry the weight:

- **`new`** — paid. The boundary: before it a scratch pad, after it a record.
- **`in_review`** — **the coach actually has the files**, earned by their first
  download, not by an email being sent. `intake_translating` and
  `feedback_translating` are the translator's equivalent and are earned the same
  way (2026-08-06, ADR 018 Q3). A translator's hand-off now spends the same
  three rungs a coach's does — chosen, sent, collected — because a hand-off is
  the only place a submission stalls on a person, and the roles were being
  measured differently for no reason anyone could name.
- **`collected`** — **the customer has downloaded it**, which starts the
  retention clock.

### A question about the ladder is a predicate, never a comparison

`status === "complete"` was how thirteen call sites asked *may the customer see
this?* — true until `collected` existed, and then false **the instant a customer
downloads**, revoking their own access by using it. No type error, no failing
test.

So every question about the ladder is an exhaustive
`Record<SubmissionStatus, boolean>` in `domains/submission`, which makes adding a
rung without answering a **compile error**:

| Predicate | Asks |
| --- | --- |
| `isPaid` | has money changed hands? |
| `hasResponse` | has the coach delivered? |
| `isReleased` | may the customer see it? |
| `isWithCoach` | is it on a coach's desk? |

It was a list once, and `awaiting_approval` slipped through it.

**The canonical end-to-end path — inception to completion, with who drives each
stage, what changes, which email fires, and what is retained — lives in
[`domains/submission/_SubmissionDocumentation.md` §2](src/domains/submission/_SubmissionDocumentation.md).** It's the one place the whole arc is written down; refine it there
before changing any stage. **The route from what's deployed to that path is
[`docs/design/rollout.md`](docs/design/rollout.md)** — phases, dependencies, and
what must be settled before each one starts.

**Where the ladder is *going* is [`docs/design/northstar/`](docs/design/northstar/)** —
eighteen steps and fifty-six substeps, and for each one the trail rows written on
success and on failure plus the exact words every party is shown. Authored, not
generated: it carries rows that don't exist yet, which is the point. Most of it
is marked **not built**. `northstar.py` is the source; the page and the two CSVs
are outputs of `build.py`, which verifies them against it.

There is no "paid but no file yet" state any more: files arrive before payment,
so `awaiting_upload` was retired with the flow that needed it. The status lookup
collapses eleven middle rungs into one calm sentence — a parent has no use for
`response_translating` — and that collapse lives in one function, not in the page.

### `coach`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key | |
| `operatorId` | uuid, FK → `operator.id` | the coach's login |
| `name` | text | |
| `specialties` | enum[] | matches the `focus` options |
| `languages` | text[] | e.g. English, Japanese |
| `isActive` | boolean | the admin toggles from the portal |

### `operator`

Operator identity — **operators only, never customers.**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid, primary key | |
| `email` | text, unique | login |
| `passwordHash` | text | credentials auth |
| `role` | enum | `admin` · `coach` |
| `createdAt` | timestamptz | |

The first `admin` (the admin) is **seeded**; coaches are created from the admin portal,
each paired with a `coach` row.

---

## 9. Webhook Contracts

Two inbound webhooks: **Stripe** and **Resend**. Mux is gone — the upload route stores the file
directly, so there's no async video webhook. The feedback-ready notification is a
coach action in the portal, not a webhook.

### Stripe webhook

**Endpoint:** `POST /api/webhooks/stripe`

**Events:**

- `payment_intent.succeeded` → mark the submission paid (`new`) + send the
  receipt, which lists every uploaded file
- `payment_intent.payment_failed` → the submission stays in `awaiting_payment`
  with its files intact, **the customer is emailed a way back in**, and the row
  is touched — which is what extends the abandonment window, since the sweep
  measures from `updatedAt`. A decline is someone trying, not someone leaving

**Signature verification:** `stripe.webhooks.constructEventAsync()` over the raw
body with `STRIPE_WEBHOOK_SECRET`. Verify before doing anything.

**Idempotency:** `markSubmissionPaid()` is idempotent — a submission already in a
paid status is returned untouched — so a Stripe retry, or the browser confirming
first, is a no-op. The receipt is gated on `justPaid`.

The intent names its submission in `metadata.submissionId`, written when the
intent was created. The id is looked up, never trusted to describe anything.

**Response:** return `200` quickly; a handler error returns `500` so Stripe
retries — safe, because the work is idempotent.

### Resend webhook

**Endpoint:** `POST /api/webhooks/resend`

**Events:** `email.delivered` · `email.bounced` · `email.complained` ·
`email.failed` → appended to the submission's trail.

**Signature:** Svix. HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` with the
base64 half of `RESEND_WEBHOOK_SECRET`, verified by hand rather than adding the
`svix` package — a dependency that exists to do one `createHmac` is one to keep
patched forever. **Timestamps older than five minutes are rejected**, or a
captured delivery could be replayed indefinitely to keep writing to a trail.

**Unset secret refuses everything (503).** Losing delivery tracking is a degraded
trail; an open endpoint that writes to it is a forgeable one.

**Why this exists:** `sendEmail` can only ever claim *Resend accepted it*. The gap
between that and *the customer has it* is where a mistyped address lives — and for
① , the one message a customer is blocked on, it looked identical to someone being
slow to check their inbox. **Opens are deliberately not tracked**: Apple Mail
Privacy Protection pre-fetches images by default, so "opened" is wrong in both
directions.

### Raw body handling (critical)

App Router route handlers must read the **raw, unparsed body** for signature
verification — `await req.text()`, then pass the string to the verifier. Parsing
first (`req.json()`) breaks it.

```typescript
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const event = await stripe().webhooks.constructEventAsync(
    rawBody,
    signature,
    env.stripeWebhookSecret,
  );
  // ... handle event
}
```

### The file uploads (not webhooks)

Uploads no longer gate on payment — payment comes after them
([ADR 009](docs/decisions/009-upload-before-payment.md)). They gate on the flow
cookie plus a verified email ([ADR 010](docs/decisions/010-verification-gates-upload.md)).

**In production the browser uploads straight to Vercel Blob**, because a
serverless request body is capped near 4.5 MB and a phone video is not
([ADR 011](docs/decisions/011-client-direct-uploads.md)):

| Route | Job |
| --- | --- |
| `POST /api/upload/blob` | issue a scoped, short-lived Blob client token (prod) |
| `POST /api/upload/complete` | record a file the browser uploaded directly (prod) |
| `POST /api/upload` | take the bytes through us onto local disk (**dev only**) |
| `POST /api/feedback/upload` | the coach's response — operator-gated |
| `GET /api/files/[id]` | download one file — operator-only; **410** once swept. **Also where the coach's first collection is observed** (step 9) |
| `GET /api/feedback/[id]` | the coach's response — public once released. **Also where the customer's first collection is observed** (step 14) |
| `GET /api/payment/return` | where Stripe sends a 3-D Secure customer back |
| `GET /api/cron/sweep` | the nightly sweep — warns first, then purges; `CRON_SECRET` required |

See the endpoint table in [OPERATIONS.md](OPERATIONS.md).

---

## 10. Build Status

The original 8-sprint plan is retired — the platform pivot reshaped it, and git
holds the history. The build is **live in production** at `www.baseball-sensei.com`,
behind an HTTP Basic Auth gate while it's being finished.

**The whole seventeen-stage pipeline is built** (2026-08-01). Phases 1–6 of
[`docs/design/rollout.md`](docs/design/rollout.md) shipped in a day; the path
doc's table carries no `(not built)` markers for the first time.

**Built, deployed, and verified:**

- ✅ **Customer flow, four steps on `/start`** — details → 6-digit verification →
  multi-file upload → payment → confirmation. Walked in a browser 2026-07-30.
  A scrubbed submission now resets the flow to step 1 rather than stranding
  someone on a dead form; the code's TTL *is* the flow window; the code send is
  confirmed before anyone advances; a declined card emails a way back and extends
  the abandonment window.
- ✅ **Landing page** — Audrey's approved design.
- ✅ **Foundation** — Postgres (Supabase in prod, Docker in dev), Drizzle
  migrations through `0010`, seed.
- ✅ **Auth** — jose sessions, `admin`/`coach` roles, `proxy.ts`, `/login`,
  change-password, operator forgot-password, plus the short-lived customer *flow*
  cookie (not an account).
- ✅ **The ladder + the trail** — twenty statuses and `submission_event`, with
  four exhaustive predicates guarding every question about them.
- ✅ **The four folders** — `intake` · `intake_translation` · `response` ·
  `response_translation`, with translation need **derived** from the assigned
  coach's languages and a curation radio on each of the two hand-offs.
- ✅ **Both collection stamps** — the coach's first download earns `in_review`,
  the customer's starts the retention clock. Each gated on *who* is asking.
- ✅ **Operator control** — purge any folder now, reset a status to an earlier
  rung; both recorded against the submission with the actor's name.
- ✅ **Retention** — 30 days from collection or 90 from delivery, whichever is
  later, with a one-week warning. **Everything is swept together**, which is only
  safe because the clock can't start until the customer has the files.
- ✅ **All nine emails**, plus the decline notice and the status access code.

**Remaining — all of it operations, none of it code:**

- **Stripe** — production keys + the `payment_intent.succeeded` webhook, so real
  payments mark submissions paid ([OPERATIONS.md](OPERATIONS.md) §5–§6). The last
  thing before the funnel can take money.
- ⚠️ **The whole site is behind HTTP Basic Auth** (`BASIC_AUTH_USER` /
  `BASIC_AUTH_PASSWORD`). Nothing is publicly reachable until those are cleared
  and redeployed.
- ⚠️ **Confirm `NEXT_PUBLIC_SITE_URL` is `https://www.baseball-sensei.com`** in
  Vercel. It builds the links inside customer emails *and* the redirect target
  for `/api/payment/return`; the flow cookie is host-only, so a mismatch strands
  a 3-D Secure customer **after being charged**. It's inlined at build time, so
  changing it needs a redeploy.
- **Real coach content and photography** — the current copy is wireframe
  placeholder and cannot go live as written.
- **Record each coach's languages** in the portal. Translation need is the
  intersection of those and the customer's, so a coach with none recorded
  produces "no languages recorded for this coach" rather than a prompt —
  correct, but it means the rule does nothing until someone fills them in. The
  customer's half is collected at step 1 and defaults to English.
- A **human test of the card field and 3-D Secure**.
- Deferred: an in-app `/feedback/[id]` viewer, coach deactivation UI, resumable
  uploads across a reload, React Email, shadcn/ui.

> **Handoff runbook:** the step-by-step go-live — accounts, env vars, migrations,
> the Stripe webhook, DNS, and the end-to-end test — is in [OPERATIONS.md](OPERATIONS.md).


---

## 11. Coding Standards

### General

- **TypeScript strict mode.** No `any`. No `as unknown as X`. `// @ts-ignore` requires an inline comment explaining why.
- **Server components by default.** Only add `"use client"` when needed (state, effects, browser APIs, form handlers).
- **Async/await over promise chains.** Always.
- **Early returns over nested conditionals.**
- **No magic numbers or strings.** Extract to constants in `src/shared/lib/constants.ts` or feature-scoped `constants.ts`.

### Components

- **Single responsibility.** A component does one thing.
- **Composition over configuration.** `<Card><CardHeader>...</CardHeader></Card>` over `<Card header={...} />`.
- **Props are typed explicitly.** No inferred props from default values.
- **Co-locate.** Component + types + tests in one folder when it warrants a folder.

### Forms

- **React Hook Form + Zod, always.** No manual form state management.
- **Schemas in `features/<feature>/schemas.ts`.** Shared between client validation and server API validation.
- **Server re-validates.** Never trust client validation alone. Every API route validates the incoming payload with the same Zod schema.

### API routes

- **One route, one job.** Keep them small.
- **Validate input with Zod at the top.** Return `400` with structured errors if invalid.
- **Catch all errors.** Return `500` with a generic message. Log the actual error server-side.
- **Correct HTTP status codes.** 200 (success), 400 (bad request), 401 (unauthorized), 404 (not found), 500 (server error).
- **Webhooks verify signatures.** Non-negotiable.

### Naming

**Specified in [`laws/_NomenclatureLaw.md`](laws/_NomenclatureLaw.md)** — the one home for how things
are spelled, superseding `structure.md` §6 on 2026-08-01. Adopted from the WRLD sandbox and
rebuilt around this product's own nouns.

The short version: `PascalCase` types and components, `camelCase` modules and folders, no
hyphens in folder names, `xApi` for API clients, `_<Slice>Documentation.md` for slice docs.
`src/app/` follows Next.js instead, because the router reserves those filenames.

**One stem per concept** — a domain folder and everything in it use one word, never two forms
of the same idea. It applies across axes too: the same concept spelled one way in the schema
and another in the status enum is the same violation one level up. The settled vocabulary is
**intake / response** — what the customer sent, what the coach wrote — and where a stem serves
two axes, the grammar carries the difference: a file kind is a **noun**
(`intake_translation`), a status is a **participle** (`intake_translated`).

**The law behind the law:** *nomenclature should carry meaning, not require it.* A term that
needs a gloss every time it appears is a term that's wrong in the code.

### Comments

- **Self-documenting code preferred.** If a comment explains _what_, refactor.
- **Comments explain _why_.** Non-obvious reasoning, trade-offs, links to external docs.
- **TODOs include date and owner.** `// TODO(2026-05-30, Ben): refactor when X happens`

---

## 12. Common Pitfalls

Read this section before coding. These have bitten *this* project.

### Webhooks

- **Stripe retries failed webhooks.** Idempotency is critical — `markSubmissionPaid`
  no-ops on an already-paid submission; keep it so. A handler error returns 500 (safe).
- **Verify signatures over the raw body.** `await req.text()`, then verify. Never
  `req.json()` first.

### Postgres + Drizzle

- **Column names live once** — in the owning domain's `model/<x>Table.ts`, mapped
  by `submissionRow.ts`. Don't spell a column anywhere else.
- **A `*Table.ts` / `*Enum.ts` never imports a barrel** — not `@/db/schema`, not
  `@/shared/db`, not a slice's `index.ts`. It imports other declaration files
  directly, across domains. Reach for a barrel there and you close a cycle
  through it: a table arrives `undefined` inside Drizzle, with a stack trace
  naming neither file ([ADR 015](docs/decisions/015-schema-by-domain.md)).
- **A schema change is a migration** — `npm run db:generate` then `db:migrate`.
  Never edit a table by hand.
- **A production deploy applies its own migrations**, via
  `scripts/migrate-on-deploy.mjs` in the `build` script, and **fails the build**
  if it can't. That's deliberate: a build that can't migrate must not produce a
  deploy, because fresh code against an old schema is an outage on every request
  — which is exactly how it went wrong on 2026-08-02. Previews are skipped, since
  they share the production database and a branch may carry a migration nobody
  has agreed to.
- **Several migrations are hand-corrected.** `drizzle-kit generate` can't tell a
  rename from a drop-plus-add without a TTY, and emits casts that fail on
  existing rows. Apply them; don't regenerate them.
- **The pooler needs `prepare: false`** (Supabase transaction pooler); migrations
  use the direct/non-pooling URL. Both are already wired.
- **Timestamps are `Date` in the row, ISO strings in the domain** — the mapper
  converts; don't pass a string into a Drizzle timestamp column.

### The client/server boundary

- **A client component must not import a domain barrel that re-exports DB code.**
  Importing `@/domains/submission` from a `"use client"` file pulls the Postgres
  client into the browser bundle and the build fails. Client components import the
  slice's **model** directly (schemas/types), never its barrel.
- **`shared/config/env.ts` is server-only**; browser values go through
  `publicEnv.ts`. Never import `env.ts` from a client component.

### Storage + auth

- **Files go through the `shared/storage` seam**, never a driver directly. The
  locator is stored on the file row; downloads resolve via `/api/files/[id]`
  (operator) and `/api/feedback/[id]` (public, complete-only).
- **In production the browser uploads straight to Blob.** Do not route a customer
  file through a Next.js route handler on Vercel — the request body is capped near
  4.5 MB ([ADR 011](docs/decisions/011-client-direct-uploads.md)).
- **Operator limits are in the database, not env.** File size, file count, and the
  two retention windows are edited at `/admin/settings`.
- **Auth checks live close to the data** — `requireSession` / `requireRole` in the
  page or route, not only in `proxy.ts` (which is optimistic). Re-check role *and*
  ownership in any route that mutates.

### Stripe

- **Test and live use separate keys _and_ separate webhook endpoints/secrets.** A
  test-mode webhook secret fails every signature check in production.
- **PaymentIntent metadata caps each value at 500 chars.** Don't stuff blobs in.

### Email

- **Resend needs a verified domain** before it sends to anyone but the account
  owner — set it up early, DNS takes hours. Sends are best-effort: a failure logs,
  never throws into a webhook or action.

### Next.js 16

- **Middleware is `proxy.ts` now**, and `params` / `searchParams` / `cookies()`
  are **async** — `await` them.
- **Server components can't use browser APIs**; mark `"use client"` when needed.
- **Route handlers are `route.ts` with named exports** (`export async function GET/POST`).
- **This build strips the space *after* a `{expression}` or a closing inline tag
  in JSX text.** `Removes {name} from` renders "Removes benbenfrom"; `</span> has`
  renders "…comhas". The space *before* an expression is kept; only the trailing
  one is lost, and CSS/kerning has nothing to do with it — it's gone from the DOM
  (confirmed 2026-08-30, QA 5.13.11 + the /status page). Backtick template
  literals keep every space, so write interpolated copy as `{`… ${x} …`}`, or put
  an explicit `{" "}` where the space must survive. This does **not** happen in
  stock React — it's specific to this modified Next.js (see AGENTS.md).

---

## 13. Definition of Done

A feature is "done" when:

1. Code compiles with no TypeScript errors and no ESLint warnings
1a. **`npm run check:names` passes.** It is the first step of `npm run build`, so a
   failure blocks the deploy. It catches a table export used as a word — in copy, a
   URL, a storage path, or prose — which `tsc` and `eslint` structurally cannot, since
   a wrong string is a well-typed string. Sixty-six such strings shipped on 2026-08-05
   with every other check green (`_NomenclatureLaw.md` §2b).
1b. **`npm run simulate` passes.** It walks all twenty rungs through the real
   domain functions, and it is the only check that catches a guard which stopped
   matching when the ladder grew — a comparison against one literal status stays
   valid TypeScript forever. It has already found three such bugs, two of which
   made the translation path impossible to complete.
2. Feature works end-to-end in dev (manual test)
3. Error states are handled (network failure, validation failure, edge cases)
4. Loading states show clear user feedback
5. Mobile-friendly (tested at 375px)
6. Accessibility basics: form labels, alt text, keyboard navigable
7. Any new env vars are in `.env.example`
8. Any new manual setup steps are in OPERATIONS.md
9. Any database schema change ships as a Drizzle migration and is reflected in section 8
10. Commit message is clear; PR description summarizes what changed and what was tested

---

## 14. When to Stop and Ask

Stop and flag for human review if:

- A request would require adding something from section 2 (Non-Goals)
- The Postgres schema (a table, column, or enum) needs to change
- Stripe pricing model needs to change (per-submission vs subscription)
- A new third-party service would be introduced
- An external dependency's docs contradict this file
- The scope of a sprint feels underspecified or ambiguous
- You need credentials or DNS access

Do not silently expand scope. Do not silently swap tools. Both create risks the team can't audit later.

For anything ambiguous: **the accepted proposal (v4) is the source of truth for scope**. This CLAUDE.md is the source of truth for implementation. Ben is the source of truth for judgment calls.

---

## 15. Glossary

- **Customer** — The end user, typically a parent submitting their child's video
- **Player** — The child whose video is being reviewed (customer's child)
- **Coach** — The expert in Japan providing feedback
- **Client** — the admin, who operates the platform day-to-day
- **Submission** — One paid request from a customer for coaching feedback, carrying a **pack of files** (video, images, documents) reviewed together — not one video
- **Workflow** — End-to-end process from payment to feedback delivery
- **Database** — The Postgres instance holding the `operator`, `coach`, and `submission` tables
- **The Team** — Ben (frontend), Aaron (backend advisory), Audrey (design + client relations)

---

## Related Documents

- **[OPERATIONS.md](OPERATIONS.md)** — Account setup, database + storage provisioning, admin seeding, webhook configuration, Resend domain, Vercel, DNS, go-live checklist, and the operator workflow _(being swept to match the pivot as each piece is built)_
- **[PRINCIPLES.md](PRINCIPLES.md)** — the constitution: *why* we build this way. One per project, outranks the laws
- **[laws/](laws/)** — seven laws, copied verbatim between projects: structure · nomenclature · security · verification · qa · commerce · design
- **[documentation/](documentation/)** — this project's instance of each law. **Start at [documentation/README.md](documentation/README.md)** for the map
- **[docs/design/rollout.md](docs/design/rollout.md)** — the route from what's deployed to the northstar pipeline, with phases, dependencies, and red flags
- **[docs/design/northstar/](docs/design/northstar/)** — the pipeline as it should be: every step, substep, trail row and message. Edit `northstar.py`, then run `build.py`
- **`src/domains/*/_XxxDocumentation.md`** — per-slice: northstar, honest current state, and the dated decision trail. Read the slice's doc before changing the slice
- **[docs/decisions/](docs/decisions/)** — ADRs recording where and why the implementation departs from this document
- **[README.md](README.md)** — Quick start for a new developer joining
- **Proposal v4** — Scope, budget, timeline as agreed with the client. Defer to this if a stakeholder claims something is "in scope"

_(`docs/go-live.md` was folded into OPERATIONS.md — two runbooks describing two different Airtable schemas is exactly the drift this realignment exists to kill.)_

---

**End of CLAUDE.md.**

_Last updated: May 2026 · Version 1.0 · Baseball Coaching Platform v1_
