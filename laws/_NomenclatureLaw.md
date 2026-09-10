# \_NomenclatureLaw — how anything is named

The one home for the **rules** of naming. Pairs with [`PRINCIPLES.md`](../PRINCIPLES.md) (the *why*) and
[`_StructureLaw.md`](_StructureLaw.md) (the *where*); this is **how it's spelled.**

> **This law is project-agnostic and copied verbatim.** It legislates *form* — casing, stem discipline,
> the type family, how to rename. It contains **no project vocabulary.**
>
> **Your project's words live in [`_NomenclatureDocumentation.md`](../documentation/_NomenclatureDocumentation.md)** —
> the settled glossary, the retired words, the domain enums, the two-altitude button/function pairs.
> That doc is entirely project-specific and is the artifact this law governs.
>
> **The examples below (`Order`, `orderApi`, …) are illustrative and generic.** They are a
> *reference implementation* of the rule, not the model ([PRINCIPLES §12a](../PRINCIPLES.md)) — swap them
> freely; the rule does not depend on them.

> **The law behind the law:** *nomenclature should carry meaning, not require it.* A term that needs a
> gloss every time it appears is a term that's wrong in the code.

---

## 1 · Casing

| Kind | Convention | Illustrative example |
|---|---|---|
| Type / interface | `PascalCase`, **singular** | `Order` · `OrderPatch` · `PublicOrder` |
| Union member (a domain value) | the storage layer's own spelling | `'awaiting_payment'` · `'public'` |
| Component (file **and** export) | `PascalCase` | `OrderForm.tsx` → `OrderForm` |
| Module file | `camelCase` | `orderApi.ts` |
| API client (file **and** export) | `camelCase` `xApi` | `orderApi.ts` → `orderApi` |
| Store (file → hook) | `camelCase` → `use` + `PascalCase` | `orderStore.ts` → `useOrderStore` |
| Action file | `camelCase` `xActions` | `orderActions.ts` |
| Message / email sender | `camelCase` `xEmail` | `receiptEmail.ts` |
| Domain slice folder | `camelCase` | `order` · `checkout` |
| Segment folder | **fixed lowercase set** | `model` · `api` · `ui` · `lib` · `config` |
| Barrel | `index.ts` | |
| Slice doc | `_<Slice>Documentation.md` | `_OrderDocumentation.md` |
| Table declaration file | `camelCase` `xTable`, **matching its export exactly** | `orderTable.ts` → `orderTable` |
| Enum declaration file | `camelCase`, its export **plus `Enum`** | `orderStatusEnum.ts` → `orderStatus` |
| DB table | `snake_case`, **singular** — named for what *one row* is | `order` · `order_line` |
| DB column | `snake_case` | `customer_email` |
| ORM field | `camelCase` — the mapper owns the crossing | `customerEmail` |
| id field | `xId`, `camelCase` | `orderId` · `stripePaymentId` |
| boolean field | `isX` / `hasX` | `isActive` · `hasFeedback` |
| ISO-string timestamp | `xAt`, a `string` | `submittedAt` |
| epoch-ms timestamp | `xAtMs`, a `number` | `startAtMs` |
| Env var / secret | `SCREAMING_SNAKE`, **the concept only** | `API_BASE_URL` |
| Bundler-exposed env var | tool prefix + that same concept | `NEXT_PUBLIC_API_BASE_URL` |

**The type must match the suffix.** An `xAtMs` typed `string`, or an `xAt` typed `number`, is a defect —
the suffix is a promise about the value.

**No hyphens in folders**, so a folder name reads as one concept.

**One exception, forced from outside:** the framework's own routing directory follows the framework,
which reserves filenames and lowercase URL segments. **Framework conventions win inside the framework's
own directory, and nowhere else.**

### 1a · Rail — a secret is named for what it IS, never for its stage or its consumer

Not `SANDBOX_API_URL` — the stage lives in the *value*, and sandbox becomes production without a rename.
Not `AGENTS_API_URL` — the moment a second consumer wants the same URL, a first-consumer name forces a
**duplicate secret**: two names, one value, rotated independently, and drift is a matter of *when*. The
bundler prefix is namespace, not concept: strip it and the same word must remain.

> **⟨INHERITED EVIDENCE⟩** `wrld-sandbox` nearly created `VERIFICATION_API` holding a value identical to
> an existing `API_BASE_URL`, because a second consumer wanted it.

---

## 2 · One stem per concept

A domain folder and everything in it use **one** word, never two forms of the same idea:

```
order · orderApi · OrderPatch · order_line · _OrderDocumentation · /order
```

A mix of `order` and `orders` is the exact smell this kills. **Tables are singular**, named for what
**one row** is.

### 2a · The export carries the declaration suffix; the storage name does not

```
orderTable.ts   →   export const orderTable = pgTable("order", …)
```

Not decoration. `order` is the obvious name for *one row you just fetched*, and it is used everywhere as
a local. Name the table object the same thing and the two fight in every file that touches both — which
is how scripts grow `import { x as xTable }` aliases by hand. **The suffix makes the alias unnecessary,
so the filename, the export, and what you type are one word.**

### 2b · One stem, two axes — the grammar carries the difference

When one stem must appear on two different axes:

| Axis | Grammar | Answers | Illustrative |
|---|---|---|---|
| **A thing / a kind** | a **noun** | *what is this?* | `intake` · `intake_translation` |
| **A state** | a **participle** | *what has happened?* | `intake_translating` · `intake_translated` |

One concept keeps one stem, and `file.kind === 'intake_translation'` never reads as
`row.status === 'intake_translated'`. Same word, different part of speech, no ambiguity at the call site.

**This applies across axes generally.** The same concept spelled one way in the schema and another in the
status enum is the same violation as two folders for one concept — one level up.

### 2c · One word per concept, and it survives EVERY layer

The sibling failure to inventing a synonym, and harder to see, **because nobody invents anything**: each
*layer* independently reaches for a word that is perfectly good *there*. The route author writes `deduct`
because that is accounting. The component author writes `Remove` because that is the button. The service
author writes `clawBack` because that is the mechanism. The ledger author writes `correction` because
that is the record. **Four honest choices, one concept, and no single commit looks wrong.**

> **The test: the word a user or operator SEES is the word in the URL, the hook, the service, the
> component, and any value stored in the database.**

If the button says *Remove* and the ledger row says *correction*, the record answers in a language the
tool does not speak — and the person reading it back is the one who most needs them to agree.

> **⟨INHERITED EVIDENCE⟩** In `wrld-sandbox` the operator's two balance verbs had accumulated **six
> names** across endpoints, hooks, services, buttons and journal rows. **It had already reached the
> database**, so the fix needed a data migration, not just a rename.

**Two words are correct only when they are two THINGS.** The test is whether you can state the difference
in one sentence *without using the other word.*

Hence the corollary: **layers may differ, a layer may not.** A primitive is allowed its own vocabulary
because it names *how*; within the verbs that name *what*, one word.

### 2d · Do not invent a synonym for a settled word

A ported or newly-written feature arrives with its own vocabulary *and* whatever the author reached for
while writing it. **The second kind spreads fastest, because it feels descriptive** — so it reads as
deliberate to the next person, who then extends it. It costs nothing to introduce and a full sweep to
remove.

> **⟨INHERITED EVIDENCE⟩** In `wrld-sandbox` a feature port seeded one invented synonym across **~87
> places** — endpoint prose, hook names, style keys, test names, four docs. None of it was canon; all of
> it read as canon by the next person.

**If a word is not in the project glossary, it is not a project word.** Use the settled one, or add it
there first. Applies to identifiers, endpoints, comments, UI copy and docs equally.

### 2e · A word with two industry meanings must be PINNED where we use it

Inventing a synonym is one failure; **silently picking one of two live meanings** is the other, and it is
harder to spot because every word is real. *"Component test"* means unit test to ISTQB and UI-tree test
to the frontend world. *"Integration test"* means narrow or broad depending on who is speaking. Neither
is wrong — but a doc that uses one sense without saying which **will be read in the other.**

**Name the sense at first use, once, and move on.**

### 2f · Borrowed models are cited as OURS

When a framework is synthesised from outside sources, the doc says so and names the sources. Standard
*values* are common vocabulary; the *structure* over them is a house term and must not be presented
outside the team as though it were a standard. **Confidence in a borrowed frame is how folklore starts.**

---

## 3 · How to rename

> **⟨INHERITED EVIDENCE — the newest amendment, and the most expensive lesson in either source repo.⟩**
> In `baseballsensei` a plural table name was replaced with its declaration-suffixed export **everywhere
> the word appeared.** The public FAQ asked *"Who are the coachTable?"*, the admin nav pointed at
> `/admin/coachTable` — a 404 — and file uploads wrote to `submissionTable/{id}/…` in object storage.
> **Sixty-six wrong strings shipped to production.**
>
> **The typechecker, the linter, the build and all 149 simulation checks passed — and none of them could
> have failed. A wrong string is a well-typed string.**

The law says what things are called; this says how to change what they are called.

- **Scope the substitution to files that import the thing.** Prose and copy don't import anything. A
  word-boundary match cannot tell an identifier from a sentence — **and the words worth renaming are
  exactly the words that appear in sentences.**
- **A declaration-suffixed name names a declaration export and nothing else.** Not a prop, not a local,
  not a URL segment, not a word. Everywhere else the English word stands.
- **Read the diff.** On a common word, green checks mean nothing. They tell you the code still compiles,
  which was never in doubt.
- **Retiring a word means recording what replaced it** — in the project's Documentation, §4. A retirement
  with no replacement named is a rule nobody can apply.

**Make it mechanical** ([PRINCIPLES §14](../PRINCIPLES.md)). A `check:names` step, running as the *first*
step of the build so it fails a deploy rather than teaching the lesson twice. It flags a declaration
export appearing inside any string or template literal, in prose in a comment, or in a file that never
imported it — while allowing a `` `backticked reference` `` in a docblock, which is documentation working
as intended. A companion `check:vocabulary` fails the build on any **declared retired word.**

Both are **declared, not inferred** — the retired list and the allowlist are files someone edits, so the
decision lands in a diff instead of in a hurry.

---

## 4 · The type family

One `model/<x>.ts` file holds the whole family. **Only the shapes the entity actually needs.**

| Type | Meaning | Illustrative |
|---|---|---|
| `X` | the full entity — the **owner's / operator's** view | `Order` |
| `PublicX` | the shareable subset, `Pick<X, …>`, **co-located** | `PublicOrder` |
| `XInput` | what a **form** collects, before it's an entity | `OrderInput` |
| `XDraft` | the partially-filled input a form holds mid-edit | `OrderInputDraft` |
| `NewX` | what a **create** needs | `NewOrder` |
| `XPatch` | `Partial<…>` — **the one write shape** | `OrderPatch` |
| `XValues` | the **editable core** — only for entities with an editable subset | `OrderValues` |
| `XRow` | the storage shape, **only inside `api/xRow.ts`** | — |
| enum / union | a `PascalCase` type of storage-spelled literals | `OrderStatus` |

**`Pick<X, …>` over a hand-written subset, always.** A `PublicX` that restates its fields drifts the
moment `X` changes; a `Pick` cannot.

**One write shape.** A second write shape beside `XPatch` is a finding.

### 4a · Exhaustive maps over lists

A question every union member must answer is a **`Record<Union, T>`**, never a list:

```ts
const IS_PAID: Record<OrderStatus, boolean> = { … }
```

Adding a member without answering is then a **compile error.**

### 4b · A question about an ordered enum is a PREDICATE, never a comparison

> **⟨INHERITED EVIDENCE⟩** In `baseballsensei`, `status === "complete"` was how **thirteen call sites**
> asked *may the customer see this?* — true until a later `collected` rung existed, and then false **the
> instant a customer downloaded**, revoking their own access by using it. No type error, no failing test.

So every question about an ordered enum is a **named, exhaustive predicate** — `isPaid`, `hasResponse`,
`isReleased` — which makes adding a rung without answering a compile error. This is not style; it is the
mechanism. **It was a list once, and one member slipped through it.**

### 4c · Name the shape, not the role that reached it first

`X` is what the entity **is**. If a second kind of actor turns out to have the identical shape, `X`
was named after a *role*, and the role got mistaken for the entity.

**The test:** *if a second role arrived tomorrow, would the type need renaming?* If yes it is already
named wrong — the name describes a *use* of the shape rather than the shape. A role belongs in an
enum, where a value that varies per row is supposed to live; in a type name it can only be changed by
a rename.

**The tell is an import, which makes it greppable:** a file about one role reaching into its sibling
for the type they both are. Reading that in a diff is easier than noticing the type was wrong months
earlier.

This does **not** make role-named *files* wrong. A file named for a role is right when it holds what is
genuinely that role's alone; it is wrong when it holds the machinery every role uses —
[`_StructureLaw.md`](_StructureLaw.md) §3a has the diagnostic for telling those apart.

> **⟨INHERITED EVIDENCE⟩** In `baseballsensei`, `Coach` was a real entity while there was a `coach`
> table. When that table dissolved into `operator` + `operator_profile`, `Coach` described *an
> operator with a profile* — which a translator also is, field for field. The name survived its own
> entity for two months, until `translatorApi.ts` imported `Coach` and the import said what the type
> had not.

---

## 5 · The slice layout

```
domains/<slice>/
├── model/<slice>.ts              # the type family
├── model/<slice>Table.ts         # one declaration, named for its export
├── model/<x>Enum.ts              # one enum, likewise. Never grouped
├── model/<slice>Input.ts         # the validation schema, when a form collects one
├── api/<slice>Api.ts             # the data client
├── api/<slice>Row.ts             # the ONLY column↔domain mapper
├── api/<slice>Actions.ts         # server actions
├── ui/<Component>.tsx
├── index.ts                      # the barrel — the public surface
└── _<Slice>Documentation.md
```

Segments are created **when they're needed**, never pre-made empty.

**Three invariants worth memorising:**

- **Every storage column name lives in one place** — the owning slice's `model/<x>Table.ts`, surfaced
  through `api/<slice>Row.ts`. If you're mapping columns anywhere else, you're in the wrong file.
- **One declaration per file, always** — even the two-line enums. The rule buys **the absence of a
  judgment call** about what groups with what, which is worth more than the file count it costs: the
  moment an `xEnums.ts` exists, the next enum joins it by default and the shared file is back, just
  smaller.
- **Every environment read lives in one place**, split by **audience** — server secrets in one file,
  browser-safe values in another — so a client component never imports a module full of secrets.

**Import from a slice's barrel**, never deep into `model/` or `api/` — with one exception that is a hard
rule, not a preference: **a client-boundary file imports the slice's `model/` directly.** A barrel that
re-exports `api/` pulls the database client into the browser bundle and the build fails.

---

## 6 · Two altitudes, kept distinct

- **User words** — what the button says: *"Approve & send"*
- **System words** — what the code calls it: `approveAndComplete`

They are **not synonyms and neither replaces the other.** A button labelled `approveAndComplete` is as
wrong as a function named `approveAndSend`. Both altitudes are recorded in the project glossary.

---

## 7 · When the code disagrees with this law

**If a retired word appears as live naming *pervasively*** — across many files, or a whole feature —
*especially* if a canonical word coexists for a **distinct** concept, that signals **the law is stale,
not the code** ([PRINCIPLES](../PRINCIPLES.md): *if this contradicts the code, the code wins*).

File **one** "review the law" note naming the word and where it is retired. **Never N per-file errors.**

> **⟨INHERITED EVIDENCE⟩** `wrld-sandbox` retired one word in favour of another. The code kept both, for
> **different things**: one named a rolling *store*, the other an *axis value* on a record. The blanket
> retirement collapsed a distinction the code deliberately kept. **Verdict: the law was under-specified,
> not the code.** Refined, rather than renaming ~50 call sites.

---

## 8 · What these rules do NOT govern

**The rules above govern IDENTIFIERS, not prose.** §1, §2 and the retirement list apply to symbols,
types, folders, routes and config keys — **never** to English in button labels, screen copy, or config
descriptions. *"Couldn't reach discovery."* inside a `discover` feature is prose, not a stem violation.

**A name we don't control is never a violation.** External API shapes (`payment_intent`,
`email_addresses`), ORM-generated composite keys, DOM and platform types, migrations, lockfiles.

> **⟨INHERITED EVIDENCE⟩** Third-party shapes were **~85%** of the raw `snake_case` hits in the first
> automated nomenclature pass. **The skip zone is load-bearing, not optional.**

---

## Related

- [`PRINCIPLES.md`](../PRINCIPLES.md) — why the codebase is shaped this way
- [`_StructureLaw.md`](_StructureLaw.md) — the layout and dependency rules
- [`_NomenclatureDocumentation.md`](../documentation/_NomenclatureDocumentation.md) — **this project's
  actual words**: the glossary, the retired list, the domain enums
