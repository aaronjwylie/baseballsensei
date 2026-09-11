# PRINCIPLES — how this codebase is built

> **Canonized 2026-07-28 (Ben + Claude).** Adapted from the WRLD sandbox's constitution
> (`wrld-sandbox/PRINCIPLES.md`), which earned these rules on a much larger codebase. This
> file is the *why*; [`docs/design/structure.md`](docs/design/structure.md) is the *how it's
> laid out*; [CLAUDE.md](CLAUDE.md) is the *what we're building and for whom*.
>
> **If a principle here can't be honored by a piece of code, that's a signal the model is
> wrong — fix the model, not the code.** Friction is information.

---

## The two laws that outrank everything

**1 · Build exactly as much platform as the coaching workflow needs — and no more.**
Every principle below is subordinate to this one. Both the customer funnel and the operator
portal are ours to build — but if applying a principle would add machinery this business
doesn't have the scale for yet, don't. A $20/month tool beats a folder of our code whenever
the thing isn't part of the product experience. ([CLAUDE.md §1](CLAUDE.md#1-project-northstar).)

**2 · One home per fact.** Every fact has exactly one owner; every other surface derives or
reads it. No second copy, no resolution chain. This is the anti-drift law — and the reason
Step 0 of the realignment existed, because two runbooks were describing two different
databases.

---

## How we organize

### 3 · Domain over layer

Folders name **concepts, not tech roles**. The tree should scream *baseball coaching
platform*, not *Next.js*. A newcomer scanning `src/domains/` should learn what the business
does.

### 4 · A slice holds its noun *and* its verbs

The noun/verb distinction is real, but it's the **segment** boundary *inside* a slice, not a
top-level `entities/`-vs-`features/` split.

- The **noun** — a thing that *exists* (a `Submission`): its shape and how to read one.
  Stable, shared. Lives in the slice's `model/` + `api/`.
- The **verb** — something a user *does* (paying, uploading, checking status): interaction
  and orchestration. Lives in the same slice's `model/` + `ui/`.

**The test:** delete every verb — what's left is the noun. A slice may be all noun, all
verb, or both. `submission` is both: the record *exists*, and looking yours up is a deed.

### 5 · Code lives at the highest node where it's still true

The Postgres connection and the storage-driver seam are true for any domain → `shared/`.
The knowledge that a submission's focus is one of five values is true only for submissions →
`domains/submission/`. Push a fact up until it stops being universally true, then stop.

### 6 · Segments scale with the slice — never pre-create empty ceremony

A slice uses as few segments as it needs. Start minimal; split when a folder crowds. An
empty `lib/` is worse than no `lib/`.

### 7 · The barrel makes granularity free

Consumers import a slice's `index.ts`, never its internals. That makes the internal layout a
**private implementation detail** — changeable anytime, zero ripple. It's what lets rule 6
be safe.

### 7b · Storage declarations follow ownership — and form their own plane

**Adopted 2026-08-05** ([ADR 015](docs/decisions/015-schema-by-domain.md)). A table or enum
lives in the folder of the domain that owns it, not in a shared infrastructure file. Ownership,
not usage: `submissionStatus` is submission's even though four layers read it; `focus` is
submission's because `FOCUS_OPTIONS` already was, even though `coaches.specialties` uses it too.

Three consequences, and the third is the one that bites:

- **A barrel aggregates; it never declares.** [`src/db/schema.ts`](src/db/schema.ts) exists so
  drizzle-kit has one file to read. It contains no declarations. That part is firm; where it
  *sits* is not — see below.
- **The whole-picture view is a tooling concern, not a file-structure one.** "What does the
  database look like" is answered by Drizzle Studio, the pgAdmin ERD, and generated SQL — none of
  which read our folders. Keeping declarations physically adjacent was paying a locality cost for
  a view we can get three other ways. *Explicit non-goal: never build a utility that assembles
  the schema for reading. If that starts to feel necessary, the split cost more than expected and
  we revisit it rather than paper over it.*
- **Declaration files are their own plane, and the import rules above don't reach them.** A
  `*Table.ts` imports other declaration files **directly and cross-domain** — `coachTable`
  imports `operatorTable`, not `@/domains/operator`. This looks like a violation of rule 7 and of
  structure.md §4.5, and it is; it's forced by the module system, not chosen. A foreign key is a
  compile-time reference no barrel can carry, because the barrel already imports the file that
  would import it. Close that loop and one of the two modules initialises half-formed, so a table
  arrives `undefined` from inside Drizzle with a stack trace naming neither file.

  So: **a declaration never imports a barrel** — not `@/db/schema`, not `@/shared/db`, not a
  slice's `index.ts` — nor anything that transitively reaches one. Everything *above* the plane
  keeps the normal rules.

  *Sharpened 2026-08-05, a day after it was written.* It first read "a declaration imports only
  declarations", which was a proxy for the real hazard and immediately proved too strict: the
  enums now derive from the domain vocabularies (`submissionStatusEnum` ← `SUBMISSION_STATUSES`),
  so declarations import plain model files and always will. Those are leaves — they import
  nothing upward, so no loop can close through them. **The danger was never "a non-declaration";
  it was a module that imports you back.** A rule stated as a proxy will keep forbidding safe
  things and, worse, will eventually permit an unsafe one that happens to fit its letter.

The cost paid knowingly: placement becomes a recurring judgment call that a single file never
had, and it *drifts* — what one domain clearly owns becomes contested when a second consumer
appears. That correction is a file move and `tsc` finds every call site, which is why the cost is
acceptable rather than merely tolerated.

#### ⚠️ The manifest's address is provisional — decided 2026-08-05, kept under review

What's **settled** is that the manifest can't live in `shared/`. It was going to, and rule 4
caught it: a file importing every domain cannot be domain-less. That's the invariant doing its
job, and it isn't up for revisiting.

What's **provisional** is `src/db/` specifically. It's a fourth top-level folder beside `app/`,
`domains/`, and `shared/` that is *not a layer* — which is either honest or a smell, and one
file isn't enough evidence to tell. It's there because:

- **Nothing in `src/` imports it**, so it constrains nothing and nothing constrains it. Its only
  consumers are `drizzle.config.ts` and `scripts/`, both outside the cake already.
- **It stays under `src/`** so the `@/` alias resolves — which is what drizzle-kit actually reads
  when it bundles the schema. Repo root would work too and buys nothing.
- **The alternative was a documented exception in `shared/`**, and exceptions to rule 4 are
  worth more than the tidiness of three top-level folders. Once a law has one carve-out, the
  second is an argument rather than a violation.

**What would move it.** If something in `src/` ever legitimately needs the whole map, that's
evidence it *is* a layer and belongs in the cake. If `src/db/` grows a second file — a
`relations.ts`, or a join table owned by neither domain — the folder acquires a real purpose and
we should name it for that purpose rather than for the tool that wanted it. And if it simply
reads as clutter after a few months of working in the tree, that's reason enough; nothing here is
load-bearing.

Recorded this way on purpose. The reasoning above is worth more than the conclusion, because the
conclusion is a judgment call and the reasoning is what will tell us if it was the wrong one.

### 8 · Compartmentalize the differences; unify the commonality

Separate concepts that are genuinely different even when they share a shape. But write the
*shared* part **once**, so symmetry is built in rather than hoped for. The three
transactional emails are three different messages (their domains own them) wearing one
brand shell (`shared/email` owns that).

This is the counterweight to rule 2: unify what's the *same*, separate what's *different*.
The goal is a bijection — one fact, one home.

**Where this bites in practice — the size diagnostic and its evidence — is
[`laws/_StructureLaw.md`](laws/_StructureLaw.md) §3a.** The principle is philosophy; how it shows up in a
folder is structure, and structure has its own law.

---

## How we work

### 9 · Always green

Every step compiles and runs. Nothing is left half-broken; each step is reversible. A
refactor that requires a "don't worry, it'll typecheck at the end" is too big — cut it up.

### 10 · Honest degradation

A not-yet-built path is honestly stubbed, never mocked to look real. **Absent reads as
absent.** If email isn't configured, we log that we skipped it — we don't pretend to send.

### 11 · Docs are part of done

Each domain slice ships a `_XxxDocumentation.md`, kept true **in the same commit** as the
code it describes. Three sections, each answering one question:

- **The northstar** — what this slice *is*. The invariants, the shape, the *why*. Timeless:
  it reads the same whether the slice is one commit old or a hundred.
- **Where we are** — what's built *right now*, honestly (per rule 10): shipped ✅,
  stubbed/deferred 🔶, the open gaps. A snapshot; it churns.
- **Where we came from** — the breadcrumb trail, **and it must actually leave crumbs.** Not
  "ported from the old build" — the *record*: decisions taken **with their reasoning**, what
  each superseded, the scars. When a decision reverses an earlier one, **the earlier one
  stays**, marked superseded. We keep the trail; we never rewrite history. Date the entries.

Why the third section is worth the effort: a future reader can check themselves against
*why*, not just *what*. That's what makes a decision reviewable instead of merely visible.

**Write the real names.** A doc names the actual functions, fields, statuses, routes and env
vars — `startSubmissionAction`, `emailVerifiedAt`, `awaiting_approval`, `/api/cron/sweep` —
never "the submit handler" or "the verified flag". Paraphrase reads more smoothly and is
worth less. Three things follow from using the real ones:

- a reader goes from the sentence to the source with no translation step;
- the doc becomes a **check on naming**. If a term here doesn't match what's on screen or in
  the code, one of the three is stale — and that mismatch is now *discoverable by reading*
  rather than latent until something breaks;
- it exposes bad names. A term that needs a gloss every time it appears is a term that's
  wrong in the code. **Nomenclature should carry meaning, not require it** — if the doc keeps
  having to explain a name, rename the thing.

That's rule 2 applied to words: the name *is* the fact, and every doc that mentions it is a
surface deriving from that one home.

### 11b · The point of no return

A multi-step operation that dies partway is not a question of "transactional or
not" — it resolves per step, and the line is sharp:

**A step must survive a failure if its effect already exists outside our database.
It must be undone if the only place it is true is inside.**

Undoing what the world already did makes the record lie; keeping what only we
believe makes it lie the other way. So every sequence has a **point of no return** —
the first step whose effect escapes us. Before it, scrub and let the caller retry
clean. From it on, keep, and **repair forward**: the world has moved and the
database's job is to catch up.

Two rules follow. **Put the point of no return as late in the sequence as the
ordering allows** — everything before it is cheaply reversible. **When both failure
states are wrong, fail toward the one someone will notice**; a silent wrong state
is discovered by a complaint, a loud one by the person who can fix it.

The exception is abuse counters, which ratchet: a spent attempt is never handed
back, even though nothing outside changed.

### 12 · Tense marks the world

**Present tense = the northstar** (the model as it *is* in the destination we're building).
**Past tense = what we left.** *"The codec owns every column name"; "column names used to be
scattered across six files."* Present tense is never about legacy, so every sentence is
unambiguous about which world it describes — and the northstar is the default reality.

**The present tense is not softened to fit the code.** Where the build lags the destination,
the sentence still states the destination and an **appended note** records the distance:
*(today: …)* when the thing exists but differs, *(not built)* when nothing implements it,
⚠️ when the northstar itself is undecided. Never the reverse — a doc that describes what the
code happens to do can only ever justify the code, and a divergence written as a hedge stops
being a to-do.

### 13 · Discuss before build

Name it → autopsy the current shape → argue the northstar → canonize the decision → build
it. Only the last beat writes code. Nothing skips the argument.

---

### 14 · Doctrine is earned upward and adopted downward

A rule enters the pack from a project that paid for it, with the failure attached — never from the
pack's own imagination. It reaches the other projects by version, not by osmosis. So the copy in a
project outranks the pack **exactly when it has learned something the pack has not**, and the pack
outranks the copy the rest of the time; the pin (`doctrine.json`) says which state a copy is in. This
is "if the doc contradicts the code, the code wins" one level up: the pack is the doc, the projects
are the code. The loop that moves a rule up and back down is the pack's `RELEASING.md` §3; this
project's half of it is [`documentation/_DoctrineFeedback.md`](documentation/_DoctrineFeedback.md).
Taken verbatim from pack v1.2.0 §15 on 2026-09-10 — the day the loop first ran here.

## What this codebase deliberately does NOT adopt from WRLD

WRLD is a large real-time platform; this is a five-domain service. Ported with eyes open:

| WRLD has | Here | Why |
|---|---|---|
| `pages/` layer | **No** — `src/app/*/page.tsx` composes directly | Next.js reserves `src/pages/` for the Pages Router; a folder there would be claimed as routes. And with one screen per route there's nothing for the layer to earn. |
| `widgets/` layer | **No** — header/footer are domain-less, so `shared/layout/` | Rule 5. Nothing here is a cross-domain block that *knows* domains. |
| Group folders + cutters | **Not yet** | No family of alikes exists. Add when a second one does. |
| `slices/` nesting | **Not yet** | No domain is big enough to recurse. |
| Lint-enforced boundaries | **Not yet** — convention + review | Five domains is small enough to police by eye. Revisit if it slips. |

Adopting empty structure would violate rule 6. These are the upgrade path, not a to-do list.

---

## Related

- [`docs/design/structure.md`](docs/design/structure.md) — the layout, segments, and naming
- [CLAUDE.md](CLAUDE.md) — what we're building, for whom, and what's out of scope
- [`docs/decisions/`](docs/decisions/) — ADRs for decisions that departed from the spec
- [OPERATIONS.md](OPERATIONS.md) — everything outside the codebase
