# Phase 4 — Playwright golden-path E2E (SCOPE, for review)

**Status:** scoping, not yet built. For Aaron + Ben to react to before any code.
**Depends on:** Phases 1 + 3 (the CI gate and the vitest suites), all merged.

---

## 1. What it is, and what it deliberately isn't

One deterministic run through the **real funnel in a real browser** — the money /
files / cookie path that neither the unit suite nor the DB probes can reach
(Stripe Elements, the flow cookie, the upload handshake, the verify-code UI).

**Not** a broad E2E matrix. One customer golden path and one operator golden
path, green nightly. It runs **on a schedule + on demand (`workflow_dispatch`),
not on every PR** — a browser run is slower and inherently flakier than the
gate, so it watches `main` continuously without blocking a doc change.

### The two paths

**Customer** (`/start`):
> land → step 1 details → **verify email** → **upload** a small file → **pay**
> (Stripe test card) → confirmation → look up on `/status`

**Operator** (the portal):
> log in → find the paid submission in the queue → **assign** a coach → **send to
> coach** → (as the coach) **upload feedback** → **approve** → it reads `complete`

Together they prove the whole arc: a customer pays and uploads, an operator moves
it down the ladder, and it comes out the far end.

---

## 2. The seams — what has to exist for a browser to drive this

Four spots where an automated run can't do what a human does. Three are trivial;
one is a real decision.

### 2a. Basic auth — trivial
`siteGate` in `proxy.ts` is **off when `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD`
are unset**. The E2E app is a local `next start` with a test env that simply
doesn't set them. (Or Playwright sends the header via `httpCredentials` — either
works; unsetting is simpler.) **No code change.**

### 2b. Upload — trivial
With no `BLOB_READ_WRITE_TOKEN`, the flow serves `uploadMode: "proxy"` and files
go through `/api/upload` to local disk. Playwright uploads a tiny fixture file;
the **real** upload path runs, no Blob store needed. **No code change.**
> *Accepted gap:* this exercises the dev proxy path, not prod's direct-to-Blob.
> That stays covered by the Phase 2 manual smoke until a test Blob store is worth it.

### 2c. The verification code — a small, guarded seam **(decision 1)**
Step 2 needs the 6-digit code, but it's bcrypt-hashed in the DB and only exists
in the email — unrecoverable by design. The cleanest seam is a **fixed code in
test mode**: `generateCode()` returns a constant (e.g. `"000000"`) when an
`E2E_TEST` env flag is set, so the test just types the known code. No endpoint,
no email retrieval.

```ts
// verificationApi.ts — generateCode()
if (env.isE2E) return "0".repeat(CODE_LENGTH);   // env.isE2E === process.env.E2E_TEST === "1"
```

**Hard-off in production** (the flag is never set in the prod env), and worth a
one-line unit test asserting `isE2E` is false without the flag. This is the same
"prove you can read the inbox" step, short-circuited only where we control both
ends. *Alternative:* a test-only endpoint that returns the just-issued code —
more moving parts, same result. **Recommend the fixed code.**

### 2d. Stripe payment — the real fork **(decision 2)**
The `<PaymentElement>` is a **cross-origin Stripe iframe**. Two ways to get
through it:

- **(a) Real Stripe test mode.** Test secret/publishable keys in the env, and
  Playwright types the `4242…` card into the Stripe iframe via `frameLocator`.
  *Highest fidelity — it exercises our real Stripe integration end to end.* Cost:
  Stripe-iframe automation is the flakiest part of any E2E, and it needs Stripe
  **test** keys as a CI secret. 3-D Secure (the redirect path) is even flakier, so
  the golden path uses the plain `4242` card and 3-D Secure stays a manual-smoke
  item.
- **(b) A `TEST_MODE` payment short-circuit.** In test mode, skip Stripe and mark
  the intent paid directly. *Deterministic, no iframe, no secret.* Cost: it does
  **not** test Stripe Elements at all — the one integration most worth an E2E.

**Recommend (a)** with the `4242` card: the point of E2E here is the real payment
seam, and accepting some flake on one nightly test is better than a green test
that skips the thing most likely to break. Open to (b) if you'd rather the run be
rock-solid and lean on the manual card smoke.

---

## 3. Infrastructure

- `@playwright/test` (dev dep) + `playwright.config.ts` (Chromium only to start).
- `e2e/` at the repo root (outside `src/`, like `tests/`) — `customer.spec.ts`,
  `operator.spec.ts`, and a `fixtures/` file (a tiny `.mp4`/image to upload).
- **A new workflow** `.github/workflows/e2e.yml`: `schedule` (nightly) +
  `workflow_dispatch`. It spins up the Postgres service, `db:migrate` + `db:seed`
  (seeded admin + a coach), builds and `next start`s the app with the test env
  (`E2E_TEST=1`, Stripe test keys, no `BLOB`/`BASIC_AUTH`), then runs Playwright.
- **Global setup** seeds the operators the operator path logs in as, and waits
  for the server to be ready.
- Artifacts: trace + screenshot on failure (Playwright's built-ins) uploaded for
  debugging a nightly red.

---

## 4. Decisions — settled 2026-08-26

1. **Verification code:** a **guarded `E2E_TEST` fixed code** — `generateCode()`
   returns a constant when the flag is set, hard-off in production, with a unit
   test asserting `env.isE2E` is false by default.
2. **Stripe:** **real test-mode card via the iframe.** The e2e env carries Stripe
   **test** keys; Playwright types `4242` into the Stripe iframe. 3-D Secure stays
   a manual-smoke item. → **needs Stripe test keys added as GitHub secrets** (see §7).
3. **v1 scope:** **both paths in one PR** — customer + operator golden paths
   together.
4. **Cadence:** **nightly + `workflow_dispatch`** on `main`. Not on PRs, so the
   merge gate stays fast.

---

## 5. Effort & sequencing

**One PR, both paths** (~3 days): Playwright + `playwright.config.ts` + the
`e2e.yml` workflow + the fixed-code seam (2c) + `customer.spec.ts` +
`operator.spec.ts` + a global setup that seeds the operators and starts the
server. It's a PR through the existing gate (the unit + integration suites still
run on it); the E2E itself runs nightly, not on the PR.

**Build order inside the PR** (so progress is visible and the risky bit is
isolated): infra + fixed-code seam → customer path up to payment → the Stripe
iframe step → confirmation + `/status` → operator path.

## 7. Blocker before the payment step can go green

**Stripe test keys as GitHub Actions secrets** — `STRIPE_SECRET_KEY` (test),
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test), and `STRIPE_WEBHOOK_SECRET` (test) —
referenced by `e2e.yml`. Everything else can be built and the run will get as far
as the card field without them; the payment step (and the operator path that
depends on a paid submission) needs them present. You add them in the repo
settings; I never handle the keys.

## 6. Risks / known-flaky

- **Stripe iframe** is the top flake source (2d). Mitigate with Playwright
  auto-waiting + a generous timeout on that step only; if it proves unstable,
  fall back to decision-2 option (b).
- **Timing on the ladder** — the operator path crosses several server actions +
  revalidations; assert on visible state, not fixed sleeps.
- **A nightly red needs an owner** — traces are uploaded, but someone has to look.
  Worth deciding who, same as the Phase 2 pre-deploy ritual.
