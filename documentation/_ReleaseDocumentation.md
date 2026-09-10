# \_ReleaseDocumentation — what is live, where, and how we get back

> **Scope:** this project only. Governed by [`_ReleaseLaw.md`](../laws/_ReleaseLaw.md), which holds
> the *rules*; this holds **our rungs, our promotion mechanism, our changelog, our rollback floors, and
> the route from every push deploying production to a pipeline.**
>
> **If this contradicts Vercel's project settings, Vercel wins — fix this doc.**
>
> **Written 2026-09-10**, the day `1.0.0` was named and before any of it existed. §1 is the
> destination; §2 is the honest distance; §4 is the route. When a phase ships, §2 moves and §4
> shrinks — §1 should not need to change.

---

## 1 · The northstar

### 1a · Our rungs

Four names, three deployed places, two non-production databases. The four names are the ones the
team already uses; the law only asks that each be a real place with its own data.

| Rung | Is | Deploys from | Database | Storage | Stripe | Email | Site gate |
|---|---|---|---|---|---|---|---|
| **dev** | a laptop: `npm run dev` + Docker Postgres + local disk | the working tree | `baseball` in `docker-compose.yml` | `./.storage` | test keys | off, or a key to your own inbox | off |
| **qa** | every PR's **Vercel preview** on the staging project | any branch | **the QA Supabase project** — synthetic, seeded, reset at will | the QA Blob store | test keys, no webhook | on, to team addresses only | Basic Auth |
| **staging** | `staging.baseball-sensei.com`, a second Vercel project | `main` | **the staging Supabase project** — a scrubbed copy of production, restored per candidate | the staging Blob store | test keys + its own test-mode webhook | on, scrubbed addresses | Basic Auth |
| **prod** | `www.baseball-sensei.com` | the `production` branch, moved only to a tag | the production Supabase project | the production Blob store | live keys + the live webhook | on, real | off at go-live |

**Why qa and staging are two rungs and not one, here.** The law permits the collapse. We keep them
apart because their *data* answers different questions: qa is where a branch with a migration gets
its schema applied and its feature clicked through on rows nobody minds losing; staging is where the
release meets rows shaped like real ones — thirty submissions across the whole ladder, coach grants
with languages, an operator who is also a translator. A preview seeding samples into the staging copy
would blur the second question to answer the first. **If the cost of a third Supabase project ever
bites, collapse qa into staging and say so here** — the previews then share the staging database and
the scrub has to survive synthetic rows on top of it.

**Why `main` is staging, not production.** Every merge to `main` today is a production deploy
([`_ReleaseLaw` P9](../laws/_ReleaseLaw.md)). After the pivot, `main` is the *integration line*: it
deploys to staging continuously, and production moves only when a person promotes a tag. A release
candidate is therefore always "what staging is running right now", which is the simplest possible
answer to *what are we about to ship?*

### 1b · The release — what it is here

A release is a **git tag `vX.Y.Z` on a commit of `main`**, annotated, never moved. It carries:

| Fact | Home | Derived by |
|---|---|---|
| the version | `package.json` `version` — **the one home** | the tag name; the footer stamp; the changelog heading |
| the commit | the tag itself | `BUILD_SHA` in `next.config.ts` (already inlined for the QA probe — [`_QALaw` Q19](../laws/_QALaw.md)) |
| the schema it requires | `drizzle/meta/_journal.json` — the last entry's tag | the changelog heading's `schema NNNN`, written by the release script |
| whether it is a rollback floor | `drizzle/meta/floors.json` — the tags of contracting migrations | the changelog heading's `· floor` marker |
| what changed, for whom | `CHANGELOG.md`, the section under its heading | — this *is* the home |
| what an operator must do | the `Operate` subsection of that section | — |

`npm run check:release` asserts the derivations agree (P12) and runs first in `build`, beside
`check:names` and `check:doctrine`. Its vacuity floor: a repository with a `v*` tag and no matching
changelog section is a failure, not a pass.

**Version, here.** `1.0.0` is the go-live release — the tag whose promotion clears the Basic Auth gate
and takes real money. Everything before it is `1.0.0-rc.N`. After it, §5 of the law applies with these
readings: a change to a retention window, the price rule, the number of steps in `/start`, or any URL a
customer holds (`/status`, `/api/feedback/[id]`) is **MAJOR**; a new capability an operator can use is
**MINOR**; everything else is **PATCH**.

### 1c · The promotion mechanism — one branch, one direction at a time

Production is the `production` branch on the `baseball-sensei` Vercel project. It moves only by
`npm run promote -- vX.Y.Z`, which:

1. refuses unless the tag exists, the working tree is clean, and CI is green on the tagged commit;
2. refuses a **backward** promotion that would cross a floor (reads `floors.json` between the target
   and the current `production`);
3. pushes the tag's commit to `origin/production` — **fast-forward** for a promotion, **`--force`**
   for a rollback, and prints which it did.

Vercel rebuilds the commit with production's own environment. That is the law's **second form of
P10** — we rebuild rather than promote a build, because `NEXT_PUBLIC_SITE_URL` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are inlined at build time and a staging build carries the test
key ([`publicEnv.ts`](../src/shared/config/publicEnv.ts)). The rebuild is deterministic: `npm ci`
from the lockfile, Node pinned in CI and Vercel, no build-time input outside the repo and the
environment's declared variables. **Moving the publishable key to a runtime read would make build-once
possible** — deferred, §5.

**GitHub protects the arrangement:** `main` requires a PR with the `static` and `db` checks green;
`production` accepts pushes only from the two people who hold the accounts; tags matching `v*` cannot
be deleted or moved.

**The emergency override** is Vercel's *Instant Rollback* in the dashboard — it re-serves the previous
production build without a rebuild. It is faster than the script and does not move the branch, so it
is followed by `npm run promote` to the same tag so that `production` tells the truth again. Two
mechanisms would be a violation; this is one mechanism and one override, and the override is
corrected by the mechanism.

### 1d · Rollback and the floors

Rollback is `npm run promote` pointed at the previous tag. It is allowed when every migration between
the target's schema and production's current schema is **expanding** — the old code runs on the newer,
wider schema. A **contracting** migration (a drop, a narrow, a rename) is recorded in
`drizzle/meta/floors.json` in the same commit that adds it, and nothing older than the release
carrying it can be promoted again.

The rule that makes this work is [P4](../laws/_ReleaseLaw.md): **a contraction ships no sooner than
the release after the last code that read the thing.** `0028` did exactly this by instinct; from
`1.0.0` it is the rule, and `check:release` refuses a floor in the same release as the code change
that made it possible.

**A floor is preceded by a snapshot** ([law §6a](../laws/_ReleaseLaw.md)): before a release carrying a
contracting migration is promoted, a Supabase backup is taken and its name goes under that release's
`Operate`. It is the only way back across a floor, and it is a restore, not a rollback. The forward
chain is already proven from empty on every PR — `ci.yml`'s `db` job migrates a throwaway Postgres and
asserts no drift.

`migrate-on-deploy.mjs` is the backstop: on a production build whose journal is *shorter* than the
migrations already applied, it refuses the build unless every extra migration is absent from
`floors.json`. A rollback across a floor therefore fails at build, and the previous deploy keeps
serving — the same shape as the forward guard it already is.

**Rehearsed** (P11): once staging exists, a promotion `v1.0.0-rc.1 → v1.0.0-rc.2 → v1.0.0-rc.1` is
performed on the staging project and its outcome written in §3 before `1.0.0` is promoted anywhere.
*(not done)*

### 1e · What "prod-shaped" means here (P8)

Staging matches production in every row of §1a's table except the audience column and the credentials
behind each cell. Specifically it runs: the Blob driver (not local disk), Supabase's transaction pooler
with `prepare: false`, Resend against the verified domain, Stripe **test** mode with its own webhook
endpoint pointed at `staging.baseball-sensei.com/api/webhooks/stripe`, the `vercel.json` cron at 04:00
UTC against its own database, `QA_TOKEN` set so the probe can be armed, `CRON_SECRET` set, and Basic
Auth on. **Nothing that is off on staging and on in production**, with one named exception: the
duplicate-Vercel-project failure noise (`baseballsensai`) is deleted, not mirrored.

### 1f · The mirror and the scrub (P7)

`npm run mirror:staging` — run by whoever holds the accounts, from a checkout, before each candidate:

1. `pg_dump` production over the direct URL held under `PROD_DATABASE_URL` (the name the app does not
   read, the convention `.env.example` already sets for `PROD_BLOB_READ_WRITE_TOKEN`);
2. drop and restore into the staging project;
3. run `scripts/scrub-mirror.sql`, which is not optional and not a checklist:
   - every `submission.customer_email` → `staging+<first 8 of id>@baseball-sensei.com`;
   - every `operator.email` not on the team allowlist → the same shape;
   - `verification_code_hash`, `operator_credential` reset — staging logins are staging's own,
     re-seeded by `npm run db:seed` with staging's `SEED_ADMIN_*`;
   - every `submission_file.file_url` → `NULL`. The locators point into production's Blob store,
     which staging must not read (P6). The rows survive and the portal shows them as swept — **410,
     not a leak** — which is the honest state. Testers upload fresh files for download checks.
4. `npm run db:migrate` against staging, so the copy carries the candidate's schema.

The scrub is why a mirror and a connection are different things: after step 3 there is no address a
staging email can reach a customer at, and no locator a staging download can fetch a customer's file
from.

### 1g · The changelog

[`CHANGELOG.md`](../CHANGELOG.md) at the repository root, in the law's §6 shape: `Unreleased` on top,
then `## [X.Y.Z] — YYYY-MM-DD · schema NNNN[ · floor]`, sections **Added · Changed · Fixed · Removed
· Security · Operate**. A line is written **in the same commit as the change** — the same rule the
slice docs follow ([PRINCIPLES §11](../PRINCIPLES.md)), enforced the same way: by review, and by
`check:release` refusing a release whose `Unreleased` is empty while `main` has moved since the last
tag.

**Operate is the section this project most needs.** Its deploys have needed hands four times —
`CRON_SECRET`, `RESEND_API_KEY` becoming required, the Stripe webhook secret per mode, and
`NEXT_PUBLIC_SITE_URL` needing a redeploy — and none of those steps had a home until they had failed.
`check:release` diffs `.env.example` between the last tag and `HEAD`; a variable that appears must be
named under `Operate`.

### 1h · Every rung says what it is (P13)

The footer of every page carries `v1.2.0 · a1b2c3d`, from `package.json` and `BUILD_SHA`, on every
rung. `/api/version` returns the same two facts as JSON for a script. The QA probe's Q19 stamp becomes
a read of the same value rather than its own.

---

## 2 · Where we are now — 2026-09-10

**Nothing in §1 exists yet.** Stated plainly, because the pieces that *do* exist look like a pipeline
from a distance:

- ❌ **`main` is production.** The `baseball-sensei` Vercel project's production branch is `main`;
  every merge deploys live. 598 commits, no tags.
- ❌ **`package.json` reads `"name": "dev", "version": "0.1.0"`.** No `CHANGELOG.md`.
- ❌ **Previews share the production database.** `migrate-on-deploy.mjs` skips them *for that reason*,
  so a preview of a branch carrying a migration misbehaves by design. There is no qa rung — a preview
  is production's code against production's data with a different hostname.
- ❌ **No staging.** Nothing between a laptop and the live site is shaped like the live site.
- ❌ **No promotion, no rollback.** The only way back is to find a commit hash and push it to `main`,
  which is also the only way forward.
- ❌ **No rollback floor.** `0028` dropped columns; nothing records that `0027` and earlier can no
  longer be promoted.
- ❌ **The running system does not say its version.** It says its commit, to the QA probe only
  (`BUILD_SHA`), which is half of P13.
- ⚠️ **A duplicate Vercel project (`baseballsensai`) is wired to the same repo and fails every
  push.** Noise that looks exactly like a broken deploy ([`docs/OUTSTANDING.md`](../docs/OUTSTANDING.md) §1).

**What exists that the route builds on**, so nothing is rebuilt:

- ✅ **The merge gate.** `ci.yml` runs types, lint, the three architectural checks, the unit suite,
  and — against a throwaway Postgres — the full migration chain, a drift assertion, the seed, the flow
  probe, `simulate`, and the integration suite, on every PR and every push to `main`. This is step 1
  of the law's procedure, already mechanical.
- ✅ **The forward schema guard.** `migrate-on-deploy.mjs` fails a production build that cannot
  migrate. The backward guard (§1d) is the same file, one more check.
- ✅ **The build stamps its commit** (`next.config.ts`), for the QA probe.
- ✅ **The credential-naming convention.** `.env.example` already says: a production token held
  locally goes under `PROD_*`, which the app never reads. P6, practised for one variable.
- ✅ **Local dev is a real rung.** Docker Postgres, local disk, Stripe test keys, the seed, the ladder
  seed — a laptop is already the dev environment the law describes.
- ✅ **The nightly E2E** (`e2e.yml`) and the QA itinerary (`docs/qa/itinerary.md`) — the walk in step
  3 has content; it has nowhere shaped like production to be walked on.

---

## 3 · Why this exists — the escapes

Each is a real thing that happened here, kept in past tense.

- **2026-08-02 — the migration outage.** Code deployed ahead of its schema; every request errored for
  about an hour. Bought the forward guard. It is also P3's evidence, because the same outage waits at
  the end of any rollback across `0028`.
- **2026-08-05 — the squash baseline.** Production's migration ledger and the repository's disagreed
  about which migrations existed, and the state had to be *verified by REST probe, not by reading the
  ledger*. A release that names its schema head (P3) makes that question answerable from the tag.
- **2026-09-07 — five test files in the live bucket.** A dev `.env.local` carried the production Blob
  token under the name the driver reads. Bought the `PROD_*` convention, and is P6's evidence.
- **The silent deploy failure.** A Vercel build errored and production served stale code for about an
  hour before anyone noticed (`docs/qa/qa-plan.md` §1). With no version surface, "stale" and "current"
  looked identical from the browser. P13.
- **"Hard-reload before you retest — Vercel pins your browser"** (`qa-plan.md` §5b) and the Q19 stamp
  — two arguments in one QA afternoon about whether a fix had shipped. P13's evidence, inherited from
  the QA law's.
- **Four deploys that needed hands and said so nowhere** — `CRON_SECRET` (sweep answered 503),
  `RESEND_API_KEY` moving to required, the per-mode Stripe webhook secret, `NEXT_PUBLIC_SITE_URL`
  needing a redeploy. P5's `Operate` section.
- **2026-09-09 — the vestigial columns.** Two columns dropped in `0028` a month after they stopped
  being read — the right order, unwritten — and the month in between was long enough for them to be
  read as authoritative and for five operators to appear locked out. P4.

---

## 4 · The route from here

Five phases. Each is independently shippable and leaves every gate green
([PRINCIPLES §9](../PRINCIPLES.md)). **Phase 0 needs no account access and Ben can do it alone.
Phases 1–3 need Aaron, because they are dashboards.** The minimum for promoting `1.0.0` honestly is
Phase 0 plus the `production` branch from Phase 3 — staging can follow the first release if the
calendar forces it, and §2 will say so if it does.

### Phase 0 · Name what is · *no infra, ~half a day*

**Goal:** the release becomes a noun before the pipeline exists to carry it (P1, P2, P5, P12, P13).

1. `package.json`: `"name": "baseball-sensei"`, `"version": "1.0.0"`.
2. `CHANGELOG.md`: `Unreleased` (empty), then a `[1.0.0]` section **in progress** — *what v1 is*, for
   the reader who was not there: the four-step funnel, the operator portal, the twenty-rung ladder, the
   nine emails, retention. Not 598 commits; the promise. Its `Operate` section is the go-live
   runbook's remaining items: live Stripe keys and webhook, `CRON_SECRET`, clearing Basic Auth,
   confirming `NEXT_PUBLIC_SITE_URL`.
3. `drizzle/meta/floors.json`: `["0028_drop_vestigial_operator_columns"]` — the first floor, recorded
   after the fact, because it is true.
4. `scripts/check-release.mjs`, first in `build` and in `ci.yml`'s `static` job: tag ↔ version ↔
   changelog heading ↔ journal head ↔ floors; `.env.example` diff since the last tag named under
   `Operate`; `Unreleased` non-empty when `main` has moved since the last tag. **Break it on purpose
   and confirm red**, then fix ([`_VerificationLaw` §4](../laws/_VerificationLaw.md)).
5. Version surface: `APP_VERSION` beside `BUILD_SHA` in `next.config.ts`, read through
   `publicEnv.ts`; the footer stamp; `GET /api/version`. The QA probe reads the same value.
6. `git tag -a v1.0.0-rc.1` on `main`. **Tagging starts today**, which is the cheap thing
   `OUTSTANDING.md` §6 offered on 2026-08-26.

**Done when:** `npm run build` refuses a version bump without a tag, and refuses a tag without a
changelog section; the footer says `v1.0.0-rc.1 · <sha>` in dev.

### Phase 1 · Give non-production its own data · *accounts, ~half a day*

**Goal:** the qa rung exists — every preview runs against a database nobody minds losing (P6, P7).

1. Create the **QA Supabase project** and a **QA Blob store**. Migrate it (`db:migrate` over its direct
   URL), seed it (`db:seed` with `SEED_SAMPLES=1`, then `db:ladder`).
2. Vercel → the project that will build previews → **Preview** environment variables: the QA
   `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`, the QA `BLOB_READ_WRITE_TOKEN`, Stripe **test** keys,
   `RESEND_API_KEY` + `EMAIL_FROM` (synthetic rows carry `@example.com` addresses, so nothing real is
   reachable), `AUTH_SECRET` (its own — a session minted on qa must not be valid on prod),
   `CRON_SECRET`, `QA_TOKEN`, Basic Auth. **Leave `NEXT_PUBLIC_SITE_URL` unset** — `env.siteUrl`
   already falls back to `VERCEL_URL`, so links and the 3-D Secure return land on the preview's own host.
3. **Then, and only then**, `migrate-on-deploy.mjs`: migrate on every Vercel build that has a database
   URL, previews included. Rewrite its header comment in the same commit — the reason it skipped
   previews is gone, and a comment describing a hazard that no longer exists is a comment someone will
   act on.
4. `scripts/reset-qa.sh`: drop schema, migrate, seed. The known cost of a shared qa database is two
   open PRs carrying conflicting migrations; with three people the answer is *reset it*, and the
   script is what makes that a thirty-second act instead of an afternoon.

**Done when:** a PR carrying a migration previews correctly, and the preview's footer, `/status`,
and a test upload all work against rows that do not exist in production.

### Phase 2 · Staging · *accounts + DNS, ~one day*

**Goal:** a place shaped like production that is not production (P7, P8).

1. **Delete `baseballsensai`** — the misspelled duplicate. Then create `baseball-sensei-staging` from
   the same repository, production branch `main`, domain `staging.baseball-sensei.com` (a CNAME in
   GoDaddy). **Move Phase 1's preview variables to this project** and set the original project to
   build production only (Ignored Build Step: skip anything that is not `VERCEL_ENV=production`), so
   a PR builds once, on the staging project, against qa.
2. Create the **staging Supabase project** and **staging Blob store**; staging's **Production**
   environment variables mirror the live set with staging's own credentials, Stripe **test** keys, and
   a **test-mode webhook** in Stripe pointed at the staging URL. `NEXT_PUBLIC_SITE_URL =
   https://staging.baseball-sensei.com`, explicitly — the 3-D Secure return must come back to the host
   the flow cookie was set on.
3. `scripts/mirror-to-staging.sh` + `scripts/scrub-mirror.sql` (§1f). Run it once; confirm the
   admin queue shows production-shaped rows with unreachable addresses and swept files.
4. `OPERATIONS.md` §4–§6 gain an **Environment** column; §11 ("decommission the dev setup") is
   retired — the second project is now permanent furniture, by design.

**Done when:** `main` deploys to staging on merge; a test card and a 3-D Secure card clear on staging
against staging's Stripe webhook; the 04:00 sweep runs against staging's copy and warns a scrubbed
address; production is untouched throughout.

### Phase 3 · Production changes only by promotion · *~half a day, then go-live*

**Goal:** `main` stops being production (P9, P10, P11).

1. Create `production` at the commit currently live. Vercel `baseball-sensei` → production branch
   `production`. GitHub: protect `main` (PR + `static` + `db` required), restrict `production` pushes
   to the account holders, protect `v*` tags.
2. `scripts/release.mjs` (`npm run release -- 1.0.0`): clean tree on `main`, CI green, bump, cut the
   changelog section with date + schema head + floor marker, commit `Release 1.0.0`, annotated tag,
   push. `scripts/promote.mjs` (`npm run promote -- v1.0.0`): §1c.
3. **Rehearse on staging**: promote `rc.1`, then `rc.2`, then back to `rc.1`, on the staging project
   (its production branch temporarily pointed at a `staging-release` branch the script targets with
   `--project staging`). Write the outcome in §3.
4. **Go-live is the first real promotion.** Walk the release itinerary on staging
   ([`_QADocumentation`](_QADocumentation.md) — its content is that law's), do the `Operate` items in
   the `[1.0.0]` section, `npm run release -- 1.0.0`, `npm run promote -- v1.0.0`, confirm the footer
   on `www`, one real low-stakes purchase, refund it. Clear Basic Auth on production only.

**Done when:** a push to `main` no longer changes `www`; `production` is at `v1.0.0`; the previous
tag (`v1.0.0-rc.N`) is still promotable and the script says so.

### Phase 4 · The floor is mechanical · *~2 hours*

**Goal:** a rollback across a contraction fails at build, not at runtime (P3, P4, P12).

1. `migrate-on-deploy.mjs`: on a production build, compare the journal against
   `drizzle.__drizzle_migrations`; if the database is ahead, refuse unless every extra tag is absent
   from `floors.json`. Prove it: on staging, add a throwaway contracting migration, promote, roll back,
   watch the build refuse, restore.
2. `check:release`: a floor added in the same release as the code change that stopped reading the
   column is refused — the contraction waits one release (P4). The check is a diff of `floors.json`
   against the changelog's previous section.

**Done when:** the rehearsal in §1d is recorded, and `npm run promote` to a pre-floor tag prints the
floor it refuses to cross.

### Phase 5 · Sweep the documents · *~2 hours*

`CLAUDE.md` §6 (env vars per rung), §10 (the deploy story), §12 (the previews-share-prod pitfall is
retired); `README.md` quick start gains "which rung am I on"; `OPERATIONS.md` §15 rows for the new
scripts; `docs/qa/qa-plan.md` §6 (environments) folded into this document. Every one in the same
commit as the change it describes ([PRINCIPLES §11](../PRINCIPLES.md)), not a sweep at the end —
this phase is the list, not the timing.

### Cost

| Item | Today | After | Note |
|---|---|---|---|
| Vercel | Hobby, 2 projects (one broken) | Hobby, 2 projects (both real) | custom environments need Pro; two projects do the same job for free |
| Supabase | 1 project, free | **3 projects** | the free plan allows two per organisation. Either the Pro plan (~$25 USD/mo, inside the $80 CAD budget) or the qa/staging collapse of §1a |
| Blob | 1 store | 3 stores | a few files each; negligible |
| Stripe | test | test on qa + staging, live on prod | separate webhook endpoints per mode already understood ([`CLAUDE.md` §12](../CLAUDE.md)) |
| Resend | 1 key | 1 key, 3 environments | one domain; the scrub is what keeps non-prod mail off customers |

---

## 5 · Deferred — what we chose NOT to build

| Not built | Why | What would change it |
|---|---|---|
| **Build-once promotion** (P10 first form) | two `NEXT_PUBLIC_*` values are inlined; a staging build carries the test Stripe key | moving `stripePublishableKey` to a server-read passed as a prop, and `NEXT_PUBLIC_SITE_URL` already has a runtime fallback. Then Vercel's promote-between-environments (Pro) or a single project with custom environments |
| **A release branch** | three people; "don't merge to `main` during a candidate" is a sentence, not a process | a candidate that had to wait on someone else's half-finished merge |
| **Feature flags** | promotion is fine-grained enough at this cadence | the first change that must be deployed dark |
| **Supabase branching** for per-PR databases | one shared qa database plus a reset script covers it | two people with conflicting migrations open at once, more than once |
| **Automated changelog from commits** | P5 — written with the change, by the person who understood it | never, on this project's reasoning; revisit if `Unreleased` keeps arriving empty |
| **Blob mirroring into staging** | locators are nulled instead; rows read as swept | a release whose risk is *in* the download path — then copy the files for that candidate only |

---

## 6 · Where we came from

**2026-08-26 —** `_ReleaseLaw` named as the eighth law, trigger set at "when production carries
someone else's money" (`docs/OUTSTANDING.md` §6). The cheap step — tag production deploys now — was
offered and not taken up.

**2026-09-10 —** the law written, this document with it, on the day `1.0.0` was named. The team's
own description of the pipeline (dev → qa → staging → prod, with staging "sourcing prod's database")
was the starting point; the one departure from it is §1f — a *copy* of production's database, never
a connection to it — and the reasoning is the law's §3a: this app mutates on read, so a staging that
reads production writes to it.
