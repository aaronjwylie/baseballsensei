# Baseball Sensei — QA Plan (DRAFT for review)

**Status:** proposal, not yet adopted. For Aaron + Ben to react to before any of it is built.
**Partly built since:** Phase 1's CI gate now exists at `.github/workflows/ci.yml`.
**See also:** [`itinerary.md`](itinerary.md) — the manual cover-to-cover pass, which
is what a person runs. This file is what the machines run.
**Author:** drafted 2026-08-05.
**Decision owner:** Ben (per CLAUDE.md §14).

---

## 1. Why this exists, and what it's optimising for

We're about to put the funnel in front of the first ~10 real users, and the codebase
is now large enough (16-state status ladder, translation pipeline, operator kinds +
assignment join, the `submission_events` trail) that a change in one slice can break
another with nothing to catch it. At the same time, this is a lean side-project
(CLAUDE.md §1): the QA process has to **earn its keep**, not become a second product.

So the goal is **lean-first, but built to grow**: stand up the cheapest high-leverage
protection now for launch, structured so it becomes a durable regression net as you and
Ben keep merging — without rework.

Two horizons, both served:

- **Launch safety (now):** the first users get through *pay → upload → verify → feedback*
  and the operator workflow without a broken build, a silent bad deploy, or a schema skew.
- **Durable net (ongoing):** every PR is checked before merge, so a regression in the
  ladder or the retention rules is caught by a machine, not a customer.

### The failures this plan is designed to have caught

These are not hypothetical — each has already happened on this project:

| Incident | What broke | Which phase would have caught it |
| --- | --- | --- |
| Migration drift (twice) | Prod/local DB behind the code's schema; runtime throws | Phase 1 (drift guard + migrate-on-fresh-DB) |
| Silent deploy failure | Vercel build errored; prod served stale code for ~1h | Phase 1 (CI red before merge) + Phase 2 (deploy-status check) |
| SSG hit an un-migrated prod DB at build | `getSettings()` on the static landing page failed the build | Phase 1 (build against a fresh migrated DB) |
| `isReleased` vs `status === "complete"` | Access revoked the moment the customer collected | Phase 3 (unit test on the projection) |
| Feedback file ids leaked via `/status` | Email-guessing exposed a stranger's review | Phase 3 (unit test: `toPublicSubmission` leaks nothing) |
| Stripe card / 3-D Secure, Blob token handshake | Browser-only; probe scripts can't reach them | Phase 4 (E2E) + Phase 2 (manual smoke) |

---

## 2. Guiding principles

1. **Test the invariants that have already bitten us first.** Coverage follows scars, not lines.
2. **Fast checks gate PRs; slow/human checks gate deploys.** Don't make a person wait on a browser run to merge a doc fix.
3. **Reuse what exists.** The `check-*` scripts, `test-flow`, `simulate`, and the seed scripts are already QA assets — wire them up rather than replace them.
4. **A test that needs a real secret runs where the secret lives** (CI secret or manual), never blocks the offline path.
5. **No flaky E2E in the merge gate.** One golden path, deterministic, or it doesn't gate.

---

## 3. What exists today (inventory)

**Deploy-time gates** — wired into `build`, so Vercel runs them every deploy:
`check-names` · `check-doctrine` · `check-structure` (architectural invariants) ·
`migrate-on-deploy` · TypeScript + `next build`.

**Executable probe scripts** (`tsx` against a DB, run by hand):
`test-flow` (funnel end-to-end *minus* the browser bits) · `test-payment` ·
`simulate` · `stripe-webhook` · `seed` / `seed-ladder` (fixtures) · `baseline-migrations`.

**Static:** ESLint.

**Not present:** any test framework (no vitest/jest/playwright), any `*.test.ts`, any CI
(`.github/workflows` is empty), a standalone `typecheck` script, browser E2E.

---

## 4. The gaps

1. **No pre-merge gate.** Everything runs at Vercel build time (too late) or locally (only
   when remembered). A red main is discovered *after* merge.
2. **Pure logic is only tested transitively.** The ladder transitions, `isPaid`/`isReleased`,
   retention math, and the intake/response file-kind split are exercised by probe scripts but
   never *asserted* in isolation — a regression fails silently downstream.
3. **The browser-only funnel is untested.** Stripe card + 3-D Secure, the Blob direct-upload
   token handshake, the flow cookie, and the verify-code UI are exactly where money and files
   move, and `test-flow` says outright it can't reach them.
4. **The deploy/migration hazards have no automated guard.** (`migrate-on-deploy.mjs` now
   auto-applies migrations on deploy, which helps — but nothing *proves* they apply cleanly
   on a fresh DB, and nothing catches schema-vs-migration drift before merge.)

---

## 5. The plan — four phases

Ordered lean-first: each phase is independently useful and shippable, and later phases build
on earlier ones without rework. Effort estimates are rough and assume no surprises.

### Phase 1 — CI on every PR  ·  *highest leverage, no new test code*  ·  ~0.5–1 day

**Goal:** turn the gates we already have into a pre-merge net, and close the deploy/migration
hazards with automated checks.

**Deliverable:** `.github/workflows/ci.yml` running on push + PR, jobs in parallel:

- **`static`** — `eslint` + a new `typecheck` script (`tsc --noEmit`; today type errors only
  surface inside `next build`) + `check:names` + `check:doctrine` + `check:structure`.
- **`schema`** — spin up a Postgres **service container**, run `db:migrate` from scratch
  (proves the whole migration chain applies cleanly on an empty DB — the SSG-at-build and
  drift incidents), then assert `drizzle-kit generate` produces **no new migration**
  (schema-vs-migrations drift guard).
- **`probes`** — against that migrated DB: `db:seed`, then `test-flow` and `simulate` with
  `RESEND_API_KEY` **unset** (emails skip-and-log) and storage in **proxy/local-disk** mode
  (no Blob token needed).

**Explicitly deferred to a CI secret when we reach Phase 4:** `test-payment` / `stripe-webhook`
(need Stripe test keys).

**Definition of done:** a PR that breaks lint, types, an architectural invariant, the migration
chain, or a funnel probe goes **red before merge**; a clean PR goes green in a few minutes.

**Needs from you:** nothing. Runs on GitHub-hosted runners with a throwaway Postgres.

---

### Phase 2 — Pre-deploy checklist  ·  *nearly free, highest trust-per-effort*  ·  ~2 hours

**Goal:** the human half of "Both" — the browser/payment/email/deploy checks a machine can't
cheaply cover, as a short ritual one person runs before promoting to production.

**Deliverable:** `docs/qa/pre-deploy.md`, a checklist covering:

- CI is green on the exact commit being deployed.
- **Vercel deploy shows `Ready`, not `Error`** (the silent-stale-deploy incident), and the live
  deployment is the commit you think it is.
- **Migration state sanity** — confirm prod schema matches the code (a one-liner probe), even
  though `migrate-on-deploy` should have handled it.
- **Browser smoke** on the deployed site: real Stripe **test card** (incl. one **3-D Secure**
  card for the redirect path), upload a real video **from a phone**, confirm the **code email**
  actually arrives, and **download the feedback** as the customer.
- Operator smoke: log in, see the queue, assign, hand off, approve.

**Definition of done:** a written, dated, followable list; the first real deploy uses it.

**Needs from you:** a Stripe **test-mode** publishable/secret key set in the Preview/staging
environment (so the smoke doesn't touch live money), and confirmation of who owns running it.

---

### Phase 3 — `vitest` unit suite over the scarred logic  ·  *small, fast, no browser*  ·  ~1–2 days

**Goal:** lock the pure invariants that have already broken, so they can't silently regress.

**Deliverable:** `vitest` + config, wired into the Phase 1 `static` job. Tests target **pure
functions only** (no DB, no network), e.g.:

- **Status ladder** — legal transitions; that every one of the 16 states maps to a customer-
  facing label; that `isPaid` / `isReleased` answer correctly across the whole ladder
  (the `status === "complete"` bug).
- **Retention math** — collected/delivered/warn windows compute the right due dates at the
  boundaries.
- **File-kind split** — `INTAKE_KINDS` / `RESPONSE_KINDS` partition the kinds with no overlap
  and no gaps (adding a 5th kind must fail a test, not a query).
- **`toPublicSubmission`** — a security test: the projection never carries feedback file ids or
  internal fields, at any status.
- **Feedback capability** — `signFeedbackToken`/`verifyFeedbackToken` round-trip; a wrong-purpose
  or expired token is rejected; the view-code hash check accepts only the right code.

**Definition of done:** `vitest` runs in CI in seconds; each row of the §1 "scarred logic" table
has a failing-if-reverted test.

**Needs from you:** nothing (I'll confirm exact function signatures against current `main` when
building — several moved when `schema.ts` was split into per-table model files).

---

### Phase 4 — Playwright golden-path E2E  ·  *most coverage, most upkeep, most dependencies*  ·  ~2–3 days

**Goal:** one deterministic, automated run through the real funnel in a real browser, covering
the money/files/cookie path nothing else reaches.

**Deliverable:** Playwright driving, against `next start` + a service Postgres:

> land → step 1 details → **verify email** → **upload** a small file → **pay** (Stripe test card)
> → confirmation → **status lookup / feedback download** → and a second run for the **operator**
> side (assign → hand off → approve → the customer collects).

Runs nightly and on-demand (a `workflow_dispatch`), **not** as the per-PR merge gate — E2E is
slower and inherently more flaky, so it protects `main` continuously without blocking every doc
change.

**Definition of done:** the golden path is green nightly; a break in checkout, upload, or the
handoff is caught within a day without a human clicking through.

**Two dependencies that need a decision now (see §7):** the verification-code test seam, and
Stripe test keys in CI.

**Known coverage gap (accepted, lean):** E2E runs in **proxy/local-disk** upload mode, so the
**prod Blob direct-upload** path is *not* exercised automatically — it stays covered by the
Phase 2 manual smoke. Closing that would need a test Blob store; deferred until after validation.

---

## 6. Cross-cutting: environments, data, secrets

| Concern | CI | Local dev | Pre-deploy smoke |
| --- | --- | --- | --- |
| **Postgres** | ephemeral service container, migrated + seeded per run | Docker | prod Supabase (read-only checks) |
| **Storage** | proxy / local disk (no Blob token) | proxy / local disk | prod Vercel Blob |
| **Email** | `RESEND_API_KEY` unset → skip-and-log | usually unset | real Resend (must see the email) |
| **Stripe** | test keys (Phase 4 only), test cards | test keys | **test** keys in staging, never live |
| **Auth gate** | basic-auth disabled for the run | n/a | basic-auth creds provided to the tester |

**Test data:** `db:seed` + `seed-ladder` are the fixtures; every CI run starts from a clean DB so
tests never depend on leftover state. No test writes to a shared/persistent DB.

---

## 7. Open decisions (need your input before Phase 4)

1. **The verification-code test seam.** E2E must read the 6-digit code, but it's bcrypt-hashed in
   the DB and only exists in the email — unrecoverable by design. Options:
   - **(a) A guarded `TEST_MODE` hook** that exposes the just-issued code via a test-only endpoint,
     hard-off in production. *Simplest; small, well-contained seam. Recommended.*
   - **(b) A test mailbox** (e.g., a Resend test inbox / Mailosaur) the E2E reads from. *No app
     change, but adds a paid dependency and network flakiness.*
   - **(c) Read the plaintext from a dev-only log line.** *Hacky; brittle.*
   → **Recommendation: (a).** Please confirm you're comfortable with a test-only, production-disabled hook.

2. **Stripe test keys in CI.** Phase 4 needs Stripe **test-mode** keys as GitHub secrets, plus the
   standard `4242…` and a 3-D Secure test card. Just needs you to add them when we reach Phase 4.

3. **Who owns the pre-deploy ritual** (Phase 2) — you, Ben, or whoever ships that day?

---

## 8. Sequencing & milestones

```
Phase 1 (CI)  ──►  Phase 2 (checklist)  ──►  Phase 3 (vitest)  ──►  Phase 4 (E2E)
   ~1d               ~2h                        ~1–2d                 ~2–3d
   protects main     safe first deploy          locks invariants      catches the funnel
```

- **Milestone A — "main is guarded":** Phases 1 + 2. Enough to launch behind with confidence.
- **Milestone B — "regressions can't hide":** + Phase 3.
- **Milestone C — "the funnel is watched":** + Phase 4.

Each phase is a separate PR, reviewable on its own.

---

## 9. Explicitly out of scope (staying lean)

- Full testing pyramid / high line-coverage targets — we test scars, not lines.
- Load/performance testing, visual-regression testing, cross-browser matrices.
- E2E of the prod Blob path, translation-vendor integrations, and email *deliverability* (inbox
  placement) — covered by manual smoke or deferred until real usage justifies them.
- Testing third parties themselves (Stripe, Resend, Supabase) — we test our seams, not their SLAs.

---

## 10. What I need from you to start

Nothing blocks **Phase 1** — say go and I'll open it as a PR (CI workflow + `typecheck` script),
diff-first. The §7 decisions only bind before Phase 4. React inline / in the PR, and adjust any
of the scope above.
