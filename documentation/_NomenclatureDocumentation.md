# \_NomenclatureDocumentation — what the words mean here

> **Scope:** this project only. Governed by [`_NomenclatureLaw.md`](../laws/_NomenclatureLaw.md), which
> holds the *rules* — casing, one stem per concept, the type family, how to rename. This holds **the
> actual glossary.**
>
> **The law behind the law:** *nomenclature should carry meaning, not require it.* A term that needs a
> gloss every time it appears is a term that's wrong in the code.

---

## 1 · The northstar — the settled words

| Word | Means |
|---|---|
| **customer** | the parent who pays. **Never has an account** |
| **player** | the child in the footage. A field on a submission, never an entity |
| **coach** | the reviewer in Japan. Has an operator login |
| **translator** | carries a submission between languages. An operator login too — a role, not a table |
| **operator** | anyone who logs in — `admin`, `coach`, or `translator`. The word that covers all three |
| **submission** | one paid request carrying a **pack** of files, reviewed together — not one video |
| **intake** | the files the **customer** sent |
| **feedback** | the files the **coach** wrote back |
| **pack** | the set of files moving together. Preferred over "the files" when the togetherness matters |
| **focus** | what the review is about — `Hitting` · `Pitching` · `Fielding` · `Catching` · `Other` |
| **the flow** | the customer's four steps on `/start`. Not "the funnel", not "checkout" |
| **the flow window** | the 30-minute sliding session governing an unfinished attempt. **The only clock in the flow** |
| **scratch pad** | an unfinished, unpaid submission — discardable at any moment |
| **scrub** | delete an unfinished submission, row and bytes together. Never used for a paid one |
| **the boundary** | step 4, payment. Before it a scratch pad, after it a record |
| **the ladder** | the twenty statuses, in order |
| **the trail** | `submission_event` — one row per thing that happened |
| **a rung** | one status on the ladder |

### 1a · The spine

**`submission`** is the noun every other domain orbits. Where a name could attach to either the
submission or something near it, it attaches to the submission.

### 1b · The two axes that share stems

`intake` and `feedback` each name both a *file kind* and a *status*. The grammar carries the
difference:

| Axis | Grammar | Answers | Example |
|---|---|---|---|
| **file kind** | a **noun** | *what is this file?* | `intake_translation` |
| **status** | a **participle** | *what has happened?* | `intake_translated` |

So `kind === 'intake_translation'` never reads as `status === 'intake_translated'`. Same word,
different part of speech, no ambiguity at the call site.

### 1c · The domain enums

| Enum | Values |
|---|---|
| `SubmissionStatus` | twenty rungs, in ladder order — the enum's declaration order **is** the ladder's, so `ORDER BY status` means "how far along" |
| `FileKind` | `intake` · `intake_translation` · `feedback` · `feedback_translation` |
| `Focus` | `Hitting` · `Pitching` · `Fielding` · `Catching` · `Other` |
| `Role` | `admin` · `coach` · `translator` |
| `SubmissionEventKind` | `status` · `email` · `verification` · `assignment` |
| `EmailOutcome` | `sent` · `delivered` · `bounced` · `complained` · `failed` |
| `FileSet` | `original` · `translation` — which set a party was sent |

### 1d · Words with two industry meanings, pinned here

| Word | Here it means | Not |
|---|---|---|
| **client** | the admin — the person we built this for | the browser. Say *browser* for that |
| **review** | a coach assessing a submission | code review |
| **assignment** | a promise to produce a file | homework, or a variable assignment |
| **collected** | the recipient **downloaded** it | gathered, or garbage-collected |
| **complete** | released to the customer | finished in every sense — eight rungs follow it |
| **resolved** | the admin closed it | a promise resolving |

---

## 2 · Where we are now — 2026-08-06

- ✅ **`intake` / `feedback` runs end to end** — file kinds, statuses, folders, storage paths, copy.
- ✅ **`operator` covers all three roles**; there is no `user` in the code. **`account` is now a
  domain of its own** — the ability to sign in, as distinct from the person who signs in.
- ✅ **No plurals anywhere in storage.** Tables are singular, named for what one row is.
- ✅ **`check:names` enforces** the one rule that a compiler cannot: a table's export name never
  appears as a word.
- ✅ **`Coach` the type is gone — it was a role wearing an entity's name.** The shape is
  `OperatorProfile`, which is what a coach and a translator both are; what separates them is `role`,
  a column ([`_NomenclatureLaw §4c`](../laws/_NomenclatureLaw.md)).
- ✅ **`coachEmail.ts` is `handoffEmail.ts`.** Neither of its messages was about coaching — one says
  work is waiting, the other says it was collected, and both are true of a translator word for word.
  The recipient's role is a parameter now.
- ✅ **One stem per domain.** `account` says *credential* throughout; the SQL name stays
  `operator_credential` so it pairs with `operator_profile`, which §2 explicitly allows.
- 🔶 **`in_review` keeps the word *review*** even though §1d pins it to a coach assessing a
  submission. It is the one rung a coach and an admin both say out loud, and renaming a status is a
  migration — deliberate, not overlooked.

---

## 3 · Where the words came from

- **`submission` over `video`** — the product was described as video review and never was one. A
  submission carries clips, stills and documents, reviewed together.
- **`operator` over `user` / `account`** (2026-08-05, migration `0001`) — the code said `account` for
  the folder, `user` for the files and table, and `Operator` for the types: three words, and the
  settled one used only by the types. Worse than untidy — **customers use this product constantly and
  never get a row**, so a table called `users` named the wrong population.
  [ADR 016](../docs/decisions/016-operator-not-account.md).
- **`feedback` over `response`** (2026-08-05, migration `0005`) — `response` was chosen for symmetry
  with `intake` and lost to the fact that nobody says it. The customer is promised *feedback*, the
  button says *Send feedback*, the email is *your feedback is ready*, and the domain folder was
  `feedback` from the start.

---

## 4 · Retired words — do not use for northstar concepts

| Retired | Use | Why |
|---|---|---|
| ~~video~~ (as the unit) | **submission** / **pack** | it carries clips, stills and documents |
| ~~feedback file~~ (singular) | **feedback** (the pack) | the retirement was the *singular*, not the word |
| ~~response~~ | **feedback** | nobody says it — §3 |
| ~~user~~ / ~~account~~ | **operator** | it named the wrong population — §3 |
| ~~resume~~ | — | there is no resume. Every page load starts at step 1 |
| ~~awaiting_upload~~ | — | retired with the flow that needed it; files arrive before payment |
| ~~funnel~~ | **the flow** | one word for the customer's path |
| ~~passthrough~~ | — | the Mux trick. A submission's own uuid is the link now |
| ~~assignedCoachId~~ | `submission_assignment` | one column could not hold a coach and two translators |

### 4a · Deliberate survivors

- **`coach`** survives as a *role* and as a *word customers read* — "with your coach". It is retired
  only as a **table** and as a **domain folder**.
- **`in_review`** keeps the word *review* even though §1d pins it, because it is the one rung a coach
  and an admin both talk about out loud, and renaming a status is a migration.
