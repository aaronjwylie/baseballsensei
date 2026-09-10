# \_ReleaseLaw — a named point you can return to

> **What this is.** The principled home for **releases** — how a proven, passed build becomes a
> named version, travels through environments toward the people it is for, and can be walked back.
> It answers one question: *what is live, where, since when — and how do we get back?*
>
> **This law is project-agnostic and copied verbatim.** It legislates what a release *is*, what an
> environment must own, and what must be true before a promotion. The project's actual environments,
> its promotion mechanism, its changelog and its rollback rehearsal live in
> [`_ReleaseDocumentation.md`](../documentation/_ReleaseDocumentation.md).
>
> **Two other laws sit beside this one and are not sections of it.**
> [`_VerificationLaw.md`](_VerificationLaw.md) proves a *change* did not break what we knew to ask.
> [`_QALaw.md`](_QALaw.md) is the hours a person spends finding what nobody asked. Neither says which
> proven, passed build is *live*, for *whom*, or how the previous one comes back. That is this law, and
> §2 is the whole of the boundary. In particular: **what a person checks on the last rung before
> production is an itinerary, and belongs to `_QALaw`. That a rung exists, what it must be shaped like,
> and what must be true before anything leaves it — that is here.**
>
> **Examples** ([PRINCIPLES §12a](../PRINCIPLES.md)): every failure cited is **evidence** — past tense,
> permanent, never pruned. This law was written in `baseballsensei` on the day of its first release, so
> its evidence is that project's own; anywhere else it reads as ⟨INHERITED EVIDENCE⟩ and is kept until
> the rule catches something of yours.

---

## 1 · The northstar

> **A deploy is an event. A release is a noun.** Everything here exists because a project that has
> only deploys can say what production *is*, and cannot say what it *was*, what *changed*, or how to
> *get back* — and every one of those becomes a question the moment someone else's money is in it.

A release is a **named, immutable, describable, promotable, reversible** point. Five properties, each
its own rail, and a thing missing any one of them is a deploy wearing a release's clothes.

### The six words, used precisely

Loose usage rots fast ([`_NomenclatureLaw.md`](_NomenclatureLaw.md) §2c), and this vocabulary is
looser in the wild than most, so:

| Word | Means |
|---|---|
| **environment** | a *place* a build runs — with its own data, its own credentials, and its own audience. Named for who it serves, not where it is hosted |
| **build** | one compilation of one commit. An artifact. Rebuilding the same commit is a *second* build |
| **deploy** | putting a build into an environment. **An event** — it has a time, not a name |
| **release** | a named, immutable version of the source: a tag on a commit, plus the schema it requires and the words describing what changed. **A noun** — the thing you promote |
| **promotion** | moving a release to the next environment **without changing what it is** |
| **rollback** | promotion of a previous release. Not a special operation — the ordinary one, pointed backwards |

Two more that describe a release's position on the road: a **release candidate** is a release
proposed for production and not yet accepted — the same commit, with a suffix that says so; a
**hotfix** is a release cut from the *live* release rather than from the integration line, because
what is live needs mending faster than what is next can be finished.

> **Environments are places; releases are things; deploys are events.** Most confusion in this area is
> one of these being used for another — *"we released to staging"* (a deploy), *"what's on prod?"*
> answered with a branch name (a place answered with a moving target), *"roll back"* meaning revert a
> commit (a change, not a promotion).

### Why it exists — the escapes

**Do not adopt this law before you have your own.** The thing that went live and could not be named,
undone, or explained is the doc's whole argument, and it belongs in
[`_ReleaseDocumentation.md` §3](../documentation/_ReleaseDocumentation.md).

> *Evidence, `baseballsensei`, 2026-09-10:* five hundred and ninety-eight commits on `main`, every
> merge a production deploy, **no tag on any of them**, and a `package.json` reading
> `"name": "dev", "version": "0.1.0"` on a system with real operators signed in. Asked *what is live?*
> the only honest answer was a commit hash. Asked *what changed since the coach last looked?* there was
> no answer at all. Asked *how do we get back to Tuesday?* — find Tuesday's hash, and hope its schema
> still fits.

---

## 2 · Why this is not verification, and not QA

The three laws answer three questions about the same change, in order:

| | Verification | QA | Release |
|---|---|---|---|
| **Asks** | did this change break what we knew to ask? | what is wrong that nobody knew to ask? | **which proven build is live, where, since when, and how does the last one come back?** |
| **Subject** | a change | a product | a *version* |
| **Method** | deterministic machinery | human judgement | **named points and promotion between places** |
| **Output** | pass / fail | a finding | a tag, a changelog entry, a way back |
| **Failure looks like** | a red gate | a note | **an outage nobody can name, or a fix nobody can describe** |
| **Blind to** | anything not yet imagined | anything not on screen | **whether the thing is *right* — it only knows whether it is *the same thing*** |

**A release law does not decide whether a build is good.** The gates decided that, and the pass
decided that. This law decides that *the build that was judged is the build that ships*, that it has a
name, that the name says what it needs, and that the previous name is one command away. **Identity,
not quality.**

The clarifying test, when a rule seems to belong here: *does it change what the software does, or
only which copy of it is running where?* The first is not this law's. The second is.

> **The itinerary a person walks on the last rung before production belongs to `_QALaw`.** This law
> requires that the rung exist and that a promotion out of it record what was walked. It does not say
> what to walk. Two documents about one afternoon, and the seam is: *what to check* versus *what must
> be true before leaving*.

---

## 3 · The environments — a ladder of places

Code moves one way along a ladder of environments. Each rung is **more shaped like production and more
locked down** than the one before it, and each has a different audience — the developer, the tester,
the release, the customer.

| Rung | Serves | Its data | Its stability |
|---|---|---|---|
| **development** | whoever is writing the change | fake, seeded, disposable | none — expected to be broken |
| **test** *(qa)* | whoever is checking the *feature* | synthetic, shared, resettable | low — churns with the work |
| **staging** | whoever is checking the *release* | **a scrubbed copy** of production's, or realistic synthetic | high — behaves like production |
| **production** | the people the software is for | real | highest — changes only by promotion |

**The count is the project's choice; the properties are not.** A two-person project may collapse test
and staging into one rung. That is legitimate **when written down** ([PRINCIPLES §10](../PRINCIPLES.md)
— honest degradation): the Documentation names the rungs that exist and says which of the four
questions each one answers. A rung that exists in a diagram and nowhere else is the empty `lib/`
folder, one level up.

### 3a · Shape converges; data never does

The whole point of the ladder is that **each rung differs from production in one fewer way**, so that
by the last one the only remaining difference is *who it can hurt*. Same host, same storage driver,
same database engine, same providers in their test modes, same scheduled jobs, same gates in the
build. A staging that runs on a laptop's disk has tested nothing about the object store.

> *Evidence:* a file upload that worked on local disk through the whole build **could never have worked
> in production** — the serverless request body was capped near 4.5 MB and a phone video is not
> (`baseballsensei`, ADR 011 — client-direct uploads). The dev rung differed
> from production in the one dimension that mattered, and nothing between them was shaped like the
> real thing.

But data moves the other way. **Production's data is production's.** A lower rung holds a *copy* if it
needs realism, and the copy is scrubbed before it becomes an environment (P7) — because the classes of
software this law is written for **mutate on read**: a download stamps a row, a nightly job deletes
files, a page view sends an email, a build applies a migration. A rung that *reads* production's
database is a rung that *writes* to it, and there is no such thing as a read-only staging.

### 3b · Every rung owns its own credentials

An environment is defined by what it can reach. **Nothing but production holds production's
credentials** (P6), and no rung holds another's. Not as a security matter alone — as an identity
matter: a developer's laptop holding the live storage token is not a *development* environment; it is
production with a different front-end, and every rule about production now applies to it while
nothing enforces them.

---

## 4 · The rails

Thirteen. P1–P5 govern the release itself (the noun); P6–P9 the environments (the places); P10–P13
the promotion (the verb). **P for promotion**, which is the act this law exists to make safe.

### The release

**P1 · A release is a tag on a commit, and the tag never moves.**
A version that can be re-pointed is a branch with a number on it. A wrong release gets a successor;
it is never edited. Tag the commit, sign or annotate it so it carries a date and an author, and
protect it from deletion. *Evidence: reconstructing what shipped when across five hundred untagged
commits was judged "the expensive half" and deferred twice (2026-08-26, again 2026-09-10). Tagging
forward costs seconds; the debt was the not-doing.*

**P2 · The version lives in one place, and everything else derives it.**
One file holds the number ([PRINCIPLES §2](../PRINCIPLES.md) — one home per fact). The tag equals it,
the running system reports it (P13), the changelog names it, and a gate asserts all four agree (P12).
A version written in two places is two versions the first time one is bumped. *Evidence:
`"version": "0.1.0"` in production since the first deploy — a number nobody read was a number nobody
updated, and the field silently became decoration.*

**P3 · A release states the schema it requires.**
Where migrations run on deploy, the code and the database are one thing shipped as two, and **the
version must name both halves**: the tag, and the migration head it was built for. A release that
does not say which schema it needs makes every rollback a guess. *Evidence: 2026-08-02 — a deploy
shipped code ahead of its schema and every request errored for an hour. The fix (migrate on deploy,
fail the build if you cannot) closed the forward direction. Nothing yet closed the backward one — a
rollback to a commit whose schema has since been contracted is the same outage with the arrow
reversed.*

**P4 · Contract one release after you stop reading.**
Every migration is either **expanding** (adds, widens, makes nullable — old code keeps working) or
**contracting** (drops, narrows, renames — old code breaks). A contracting migration ships **no sooner
than the release after** the last release whose code read the thing it removes. This is what makes
rollback possible at all: between any release and the one before it, the schema is a superset, so the
older code runs. A contraction is a **rollback floor** — nothing older than it can be promoted again —
and it is marked as one where the schema is declared, so the promotion gate (P12) can refuse to cross
it. *Evidence: two columns sat nullable for a month after the last code read them, then were dropped
in `0028`. That was the right order, practised by instinct and written nowhere — and the cost of not
writing it was that the vestigial columns still read as authoritative, and on 2026-09-09 it briefly
appeared that five operators, two of them admins, had no way to sign in.*

**P5 · The changelog is written with the change, and cut at the release — never reconstructed.**
An `Unreleased` section at the top; every change that a customer, an operator, or the next developer
would want to know about is a line there, **in the same commit as the change**, in the words of the
person who understood it. Cutting a release moves the section under the version's heading and dates
it. A changelog written at release time from commit messages is written by someone translating, at the
one moment they know the least. And it must say what an operator has to **do** — a new variable, a
dashboard step, a job to run — because a release whose deploy needs a hand is not fully described by
what its code does. *Evidence: a variable moved from optional to required when the verification step
was added, and the runbook learned about it afterwards; the retention sweep answered 503 in production
because the secret that guards it was never set — the code was released and its one manual
step was not.*

### The environments

**P6 · No environment holds another environment's credentials.**
Especially: nothing but production holds production's. A token, a database URL, a signing secret —
each names the rung it belongs to, and a lower rung that carries a higher rung's credential *is* that
rung, with none of its protections. Where a person must reach production from a machine, the
credential goes in under a name the application does not read. *Evidence: 2026-09-07 — a
development `.env.local` carried the production storage token under the name the app reads, the
driver chose production on the token alone, and five test files landed in the live bucket. The
runbook already listed six risks of "running local dev against production"; a list of risks is not a
rail.*

**P7 · A mirror is a copy, never a connection — and it is scrubbed before it becomes an environment.**
A rung that wants production-shaped data restores a snapshot into its own database, and then, before
anything runs against it, rewrites every address a message could reach and every locator a file could
be fetched from. The scrub is a script, run by the restore, not a checklist. **A staging pointed at
the live database is not staging; it is a second production with a test label**, and every job it
runs, every email it sends, and every migration its build applies lands on real people. ⚠️ *Unproven
as an incident here — proposed and refused before it was built, on the strength of P6's evidence and
§3a.*

**P8 · The last rung before production differs from it only in who it can hurt.**
Same host, same storage driver, same database engine and pooler, same email provider, same payment
provider in its test mode, same scheduled jobs, same build gates, same site gate. Anything that is
*off* on the last rung and *on* in production is untested until it is live. *Evidence: §3a — the
upload that could never have worked.*

**P9 · Production changes only by promotion of a release, never by a push of a branch.**
The thing that deploys to production is a tag, moved there by a person who can also move it back. A
branch whose tip is production makes every merge a release, and a release nobody named is a release
nobody can describe. *Evidence: every merge to `main` for three months was a production deploy —
including, on the day this was written, "CTA arrow: nudge up to 3px". The nudge was fine. That it was
indistinguishable from a schema change was not.*

### The promotion

**P10 · Promote the thing you validated.**
The build that reaches production is the build that was checked on the rung before, or — where the
build inlines its environment and *cannot* be carried across — **the same commit, rebuilt by the same
deterministic process** (locked dependencies, pinned runtime, no build-time input that is not in the
repository or the environment's declared config). Say which of the two the project does. What is never
allowed is validating one commit and shipping another: a fix on the way to production goes back to the
rung before, gets a new candidate suffix, and is walked again.

**P11 · Every release has a rehearsed way back before it goes forward.**
Rollback is promotion of the previous release (§1), subject to the schema floor (P3, P4). *Rehearsed*
means actually performed, at least once, on the last rung before production, with the result recorded
in the Documentation. A rollback that has only been described is a plan; a plan is not a capability,
and the moment you need one is the wrong moment to find out which. ⚠️ *Unproven — no rollback has ever
been performed on the project this law was written in, which is the rail's own argument.*

**P12 · The release gate is mechanical.**
A script, run in the build and in CI, refuses a release when: the tag and the version file disagree;
the changelog has no section for the version; the section does not name the schema head it was built
against; a configuration variable added since the last release is not named in the release notes; or
the promotion would cross a rollback floor. Nobody remembers these. The build refuses.
([PRINCIPLES §14](../PRINCIPLES.md) — a rail nobody can forget beats a rail everyone must remember.)
*Evidence: the same class as the sixty-six wrong strings and the fourteen dead links — a version
string is a well-typed string, a missing changelog entry is a valid markdown file, and every existing
gate is green while both are wrong.*

**P13 · Every running instance says which release it is.**
The version and the commit, readable from the thing itself — a footer, a header, an endpoint — so
that *"is this the fix or the one before?"* is answered by looking rather than by arguing. This is
[`_QALaw` Q19](_QALaw.md) seen from the other side: that rail stamps the build into a QA session;
this one makes the stamp a property of every environment, always, whether or not a pass is running.
*Evidence: Q19's own — two arguments in one afternoon about behaviour that had shipped twenty minutes
earlier, or never.*

---

## 5 · Versioning — number the promise, not the code

Semantic versioning was written for libraries, where the promise is an API. A product's promise is
what its people were told. So:

| Bump | When |
|---|---|
| **MAJOR** | a promise changes. Something a customer or operator was told, holds a link to, or relies on — a window, a price rule, a URL, a step in a flow — is different now, and they need telling |
| **MINOR** | there is something new to tell them. A capability that did not exist |
| **PATCH** | nothing to tell them. It works more like it was already said to |

**Before the first release to someone else's money, the number is for the team** and may move freely.
`1.0.0` means: from here on, every bump is a statement to someone outside the room. The pre-release
suffix (`-rc.1`, `-rc.2`) marks a candidate — the same commit that will be the release if it is
accepted, and never a different one (P10).

> **The test for MAJOR is not "how much code changed"; it is "does anyone outside the team need to hear
> about it?"** A rewrite that changes nothing anyone can see is a PATCH. A one-line change to a
> retention window is a MAJOR.

---

## 6 · The changelog — what changed, for whom, and what to do about it

One file at the repository root. Newest first. Sections by *kind of change*, in the customary order
(**Added · Changed · Fixed · Removed · Security**) — plus two the customary form lacks and this law
requires:

- **Operate** — what someone with a dashboard must *do* for this release: a variable to set, a webhook
  to re-point, a job to run once, a migration that needs a snapshot first. **A release with a non-empty
  Operate section is not deployed by pushing it.** (P5)
- **Schema** — the migration head this release was built against, and whether any migration in it
  **contracts** — which makes this release a rollback floor. (P3, P4)

Each heading carries the version and the date: `## [1.2.0] — 2026-10-01`. The `Unreleased` heading
carries neither, and is never empty for long — an empty `Unreleased` after a week of merges is a
changelog that has stopped being written with the change (P5).

**Write it for the reader who was not there.** A line says what is different *for someone* — *"the
coach's download link now survives a driver swap"* — not what the code did — *"refactored file
resolution"*. Link the ADR where there is one. The commit messages are the developer's record; this is
everyone else's.

**The line, checked before it is committed** — five questions, and a line that fails one is rewritten:

1. **Who** is it for — a customer, an operator, the next developer? Name them or the section does.
2. Does it say what is **different**, not what was done? *"Coaches can now…"* / *"The status page
   no longer…"* — a verb about the product, not about the code.
3. Can the reader **act** on it without the diff? If it needs a hand, that hand is under `Operate`.
4. Does it **link** the decision, where one was recorded — the ADR, the slice doc entry?
5. Is it in the **same commit** as the change it describes? A line written later is a line written
   from memory.

### 6a · Migrations — the half of a release that has no undo

A migration is the one part of a release that promotion cannot reverse: code moves back by promoting
the previous tag; a schema only ever moves forward. Everything below follows from that.

- **Forward only. There are no down migrations.** A "down" that drops the column it added destroys
  the rows written meanwhile; one that does not is not a rollback. The way back is P4 — old code on
  a wider schema — never a migration run backwards. A project that generates down migrations has a
  tool that promises something the data cannot keep.
- **An applied migration is never edited.** It has run somewhere; editing it makes the ledger
  describe a file that no database ever executed. A wrong migration gets a successor that corrects
  it. *Evidence: several of this project's migrations are hand-corrected and carry the note "apply
  them; don't regenerate" — the tool could not tell a rename from a drop-plus-add without a
  terminal, and re-generating would have silently rewritten migrations already applied in production.*
- **Expand, then contract, in different releases** (P4). Add the column; ship code that writes both;
  ship code that reads the new one; drop the old one **one release later**. Each step runs on the
  schema before it and after it.
- **A data migration is not a schema migration.** Backfilling a column is a *change to rows*; adding
  it is a *change to shape*. Keep them in separate files, because the second is idempotent and the
  first usually is not, and because a backfill that fails halfway must be resumable where a `CREATE`
  need only be re-run. A repair that turns out to have nothing to repair is **deleted unapplied**,
  never shipped as a no-op. *Evidence: a repair migration was written for orphaned logins, then
  deleted when the state it repaired was found not to exist — "shipping a data mutation for a problem
  that no longer exists is worse than not shipping one."*
- **A floor is preceded by a snapshot.** Before a contracting migration reaches production, the
  database is backed up and the backup's name goes in the release's `Operate` section. It is the only
  way back across a floor, and it is a restore, not a rollback — slower, lossier, and worth having.
- **The whole chain applies to an empty database, on every change.** A gate, not a habit
  ([`_VerificationLaw`](_VerificationLaw.md)): migrate a throwaway database from nothing and assert
  that generating from the schema produces no diff. *Evidence: migration drift reached production
  twice before this was a gate.*
- **A migration that needs a hand is named under `Operate`.** A snapshot first, a long backfill to
  run off-peak, a lock that needs a quiet hour — the changelog says so, or the deploy is done by
  someone who did not know.

---

## 7 · The procedure — one shape, every time

The steps are the same for a feature release, a hotfix, and a rollback. Only where the commit comes
from differs.

1. **Cut.** From the integration line (or, for a hotfix, from the live tag): bump the version file,
   move `Unreleased` under its heading with the date and the schema head, commit, tag with the
   candidate suffix. The gate (P12) runs and must pass.
2. **Stage.** The candidate reaches the last rung before production, by whatever mechanism the
   Documentation names. Its data is that rung's own (P6, P7). The rung says which release it is (P13).
3. **Walk.** A person walks the release itinerary — **whose content is `_QALaw`'s business, not this
   law's.** What this law requires is that the walk happened, on this commit, and that it is recorded
   against the candidate.
4. **Accept or return.** A finding sends the *commit* back to the integration line for a fix and a new
   candidate; it never gets patched on the rung (P10). Acceptance re-tags the *same commit* without the
   suffix.
5. **Promote.** The accepted release moves to production by the project's promotion mechanism —
   never by pushing a branch (P9) — by a person who can also move it back (P11).
6. **Confirm.** Production says the new version (P13). The Operate section has been done. The previous
   release is still promotable, or the changelog says why not (a floor).
7. **Return the hotfix.** A hotfix cut from the live tag is merged back to the integration line the
   same day. **A fix that lives only on production is reverted by the next release**, silently, by
   someone who never knew it was there.

---

## 8 · The ways a release is silently NOT a release

> **Every row is a state a project can be in with every gate green.** The failure is always quiet,
> because a release only speaks when it is asked what it is — and nobody asks until something is wrong.

| It looks like a release, but | What actually happens |
|---|---|
| **the tag was moved** to include "one more fix" | two people who checked `v1.2.0` checked different code. The name now means nothing |
| **the version was bumped without a tag**, or tagged without a bump | the two homes disagree, and whichever one the reader trusts is wrong half the time |
| **the changelog was written at release time** from the commit log | it describes the code, not the change, by the person who knows least about why |
| **a rollback target's schema has been contracted since** | the old code reads a column that is gone. The 2026-08-02 outage, arrow reversed |
| **staging reads production's database** | staging's nightly job deletes production's files; staging's build migrates production's schema; a test submission emails a real customer |
| **the release candidate and the release are different commits** | what was walked is not what shipped. The walk was theatre |
| **a lower rung's scheduled jobs run against a database it does not own** | two sweeps, two warnings, one customer wondering why they were told twice |
| **a hotfix reached production and never the integration line** | the next release un-fixes it, and the bug report reads as a regression nobody can find the cause of |
| **the running system cannot say its version** | every bug report is ambiguous, and every "it's fixed" is an argument |
| **an environment exists in the diagram and not in the Documentation** | people plan around a rung that no build has ever reached |

**THE RULE — a release must be able to answer for itself.** Its name, its schema, its words, and its
predecessor, from the tag alone, without a person who remembers. If any of those needs a person, that
person will eventually be unavailable, and the release will be a deploy again.

---

## 9 · What you choose NOT to build is a decision, and decisions belong in writing

This law does not require blue/green infrastructure, feature flags, release branches, canary rollouts,
or a build promoted across environments as one artifact. Each is on the upgrade path, and each is a
deferral with a cost. Record the ones you decline in the Documentation with what it costs while they
wait:

- **A release branch** buys the ability to freeze a candidate while feature work continues on the
  integration line. Until the team is large enough that "don't merge during a candidate" stops being
  workable, it costs more than it buys.
- **Feature flags** are a way to deploy without releasing — the code is live, the behaviour is not.
  They belong to a later law when promotion becomes too coarse a unit; until then a flag is a second
  release mechanism nobody wrote the rules for.
- **Build-once promotion** (P10's first form) is the honest ideal and is defeated by any build that
  inlines its environment. The fix is to stop inlining, not to pretend the rebuild is the artifact.

**The trap to name: a pipeline with more rungs than the team can keep truthful.** Four environments
maintained by two people is four sets of credentials, four schemas to keep in step, and four places
for a scrub to be forgotten. A rung nobody has time to keep shaped like production is worse than no
rung — it reads as coverage (§3). **Collapse honestly before you drift quietly.**

---

## Related

- [`PRINCIPLES.md`](../PRINCIPLES.md) — §2 one home per fact · §10 honest degradation · §11b the point
  of no return · §14 make the rail mechanical
- [`_VerificationLaw.md`](_VerificationLaw.md) — proves the change; feeds step 1
- [`_QALaw.md`](_QALaw.md) — the itinerary walked in step 3; Q19 is P13's ancestor
- [`_SecurityLaw.md`](_SecurityLaw.md) — P6 is also a security rail, seen from the other side
- [`_ReleaseDocumentation.md`](../documentation/_ReleaseDocumentation.md) — **this project's rungs,
  mechanism, changelog, floors, and the route from here**
