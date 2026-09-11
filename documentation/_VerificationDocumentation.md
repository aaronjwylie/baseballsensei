# \_VerificationDocumentation — what this project actually gates

> **Scope:** this project only. Governed by [`_VerificationLaw.md`](../laws/_VerificationLaw.md), which
> holds the *rules*; this holds **our roster, what each gate is proven to catch, and what we chose not
> to gate.**
>
> **If this contradicts `package.json`, `package.json` wins — fix this doc.**

---

## 1 · The northstar

### 1a · The roster

Five gates run in `npm run build`, in this order, and the build stops at the first failure:

| # | Gate | Command | Blocks a deploy? |
|---|---|---|---|
| 1 | **Names** | `node scripts/check-names.mjs` | ✅ first step of `build` |
| 2 | **Doctrine** | `node scripts/check-doctrine.mjs` | ✅ law↔companion pairing, placeholders, dead links, slice docs |
| 3 | **Migrations** | `node scripts/migrate-on-deploy.mjs` | ✅ **fails the build if it cannot migrate** |
| 4 | **Types + lint + compile** | `next build` (runs `tsc`, then bundles) | ✅ |
| 5 | **The ladder** | `npm run simulate` | ❌ **run by hand — the gap in this roster** |

Plus `npm run lint` (eslint) standalone.

### 1b · What each gate is proven to do

Not what it is *supposed* to do — what it has actually caught here.

| Gate | Proven catch |
|---|---|
| `check:names` | **66 wrong strings that shipped to production.** A bulk rename put a table's export name into the public FAQ, a nav link that 404'd, and a Blob storage path. Every other check was green, and none of them could have failed |
| `migrate-on-deploy` | **A production outage, 2026-08-02.** Fresh code deployed against an old schema errored on every request. The gate now fails the build instead, because a build that cannot migrate must not produce a deploy |
| `tsc` + exhaustive `Record`s | **Every rung addition since.** Growing the ladder from 16 to 20 produced eight compile errors — each one a place that had to answer for the new state rather than silently default |
| `check:doctrine` | **Fourteen dead links in files authored minutes earlier**, and twelve more created by moving one law between folders. Same class as `check:names` — a link is a string |
| `simulate` | **Three guards that stopped matching when the ladder grew**, two of which made the translation path impossible to complete. Also a duplicated trail row, and a test that had begun passing while exercising nothing |

### 1c · The gates as vectors

Each catches a different class, and the classes barely overlap:

| Vector | Gate | What only it sees |
|---|---|---|
| **shape** | `tsc` | a value that cannot be what the type says |
| **exhaustiveness** | `Record<K,V>` + `tsc` | a case nobody answered for |
| **strings** | `check:names` | an identifier used as a word. **Structurally invisible to `tsc`** — a wrong string is a well-typed string |
| **behaviour over time** | `simulate` | a guard that is still valid TypeScript and no longer true. It walks all 20 rungs twice — once with translation, once without — through the real domain functions |
| **schema lineage** | `migrate-on-deploy` | code and database disagreeing about what exists |
| **the documents** | `check:doctrine` | a cross-reference that stopped resolving, or a rule with no instance. **The rail the doctrine lacked while preaching rails** |

---

## 2 · Where we are now — 2026-08-06

- ✅ **173 simulate checks**, both walks green.
- ✅ **`check:names`** — 7 table exports, no misuse.
- ✅ **`tsc`, `eslint`, `next build`** clean.
- ✅ **Migrations 0001–0011** applied in production; every one hand-written and snapshot-verified.
- ❌ **`simulate` is not in `build`.** It needs a live database, which a Vercel build does not have. So
  the check with the best catch record is the one nobody is forced to run. **This is the roster's
  weakest point** and the honest statement of it is that it depends on discipline, which
  [PRINCIPLES §14](../PRINCIPLES.md) says is not a rail.
- ❌ **No test framework.** There are no unit tests; `simulate` is the whole behavioural suite. Chosen
  deliberately at this size — a walk through real domain functions against a real database has caught
  more here than mocked units would — but it means a pure function with no rung is ungated.
- ❌ **No browser test.** The card field and 3-D Secure have never been exercised by anything but a
  human.

**The snapshot self-check.** Every hand-written migration is verified the same way: edit the snapshot
JSON, then run `drizzle-kit generate` and require it to say *"No schema changes"* — which is only
possible if the snapshot matches the TypeScript. Used on all eleven. It is not in the roster because it
is a step in a procedure rather than a command, which is itself a reason to be suspicious of it.

---

## 3 · Why this exists — the escapes

Each gate was bought by a specific escape. Kept in past tense and never pruned, because a rail whose
failure has been deleted is folklore.

- **2026-08-02 — the migration outage.** A deploy shipped code ahead of its schema. Every request
  errored. Bought gate 2, and the rule that previews are *skipped* rather than migrated, since they
  share the production database and a branch may carry a migration nobody has agreed to.
- **2026-08-05 — the sixty-six strings.** A word-boundary substitution could not tell an identifier
  from prose, and the words worth renaming are exactly the words that appear in sentences. Bought gate
  1, plus [`_NomenclatureLaw §3`](../laws/_NomenclatureLaw.md) on how to rename at all.
- **2026-08-06 — the flake that was a real bug.** `simulate` failed its
  assignment-trail ordering check **once in five runs**, then passed five
  straight. The temptation to call it flaky and move on was the whole danger:
  `submission_event.at` defaulted to `now()`, which in Postgres is the
  *transaction* start time, so two rows written in one transaction shared a
  timestamp and `ORDER BY at` between them was arbitrary. Migration `0012`
  switched it to `clock_timestamp()`, and the ordering is now asserted outright
  rather than depended upon. **An intermittent failure in a behavioural gate is
  a finding, not noise** — the gate was right and the schema was wrong.
- **2026-08-06 — the test that tested nothing.** After the ladder grew, `simulate` still jumped past
  the new rungs and asserted a hardcoded `16 expected`. It passed. Bought the rule that a count in a
  test is derived from the thing it counts, never written down.

---

## 4 · Deferred — what we chose NOT to gate

| Not gated | Why | What would change it |
|---|---|---|
| `simulate` in CI | needs a live database | a disposable Postgres in the build, or a preview-only step |
| unit tests | `simulate` covers the paths that matter at this size | a pure function complex enough to be wrong in a way no rung reveals |
| browser / E2E | one flow, one developer, walked by hand | a second flow, or the first regression that a human walk missed |
| accessibility | manual check at 375px | a real user report |
| load | ~10 users at MVP | volume that makes it a question |

---

## 5 · Where we came from

**Before 2026-08-01:** `tsc` and `eslint` were the whole roster. Both were green on the day the
migration outage happened, on the day sixty-six wrong strings shipped, and on the day three ladder
guards silently stopped matching.

That is the argument for this document existing: **green told us the code compiled, which was never in
doubt.** Every gate added since was bought by an escape that a compiler structurally could not see.
