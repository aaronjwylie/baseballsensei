# \_DoctrineFeedback — proposed amendments to `_DoctrineTemplate`

> **Scope: upstream, not here.** This is the one place `baseballsensei` records what it learned by
> *applying* the doctrine pack, in a form the template's own thread can act on. Nothing here changes
> this repo; everything here is a proposal about the portable documents.
>
> **Kept because a fork that learns something and doesn't say so is a fork that diverges.** Adopting
> the pack on 2026-08-06 surfaced more in a day than reading it would have in a week, which is the
> argument for adopting it into a live project rather than assessing it in the abstract.
>
> Cross-reference: `_DoctrineTemplate/NOTES.md` §5 holds the template author's own open questions.
> Where a finding here answers one, it says which.

---

## 1 · Recommended amendments

### ~~1a · `_StructureLaw` — two rules this project had to discover the hard way~~ — **landed in pack v1.1.0** (2026-09-10)

**Both are now in [`laws/_StructureLaw.md`](../laws/_StructureLaw.md) here** (§3a and §5b) and should
go upstream. They were written in the template's voice — rule stated agnostically, this project's case
in an `⟨INHERITED EVIDENCE⟩` block — so they can be lifted verbatim.

| § | Rule | Why it belongs in the law |
|---|---|---|
| **3a** | *Two slices for parallel concepts should be roughly the same size* — when they aren't, the shared part is living inside one of them | It is a **diagnostic**, which the pack is otherwise short on. Most rules tell you what to do; this one tells you how to *notice* you didn't, from a directory listing, without opening a file |
| **3b** | *The third file, not the thin wrapper* — when two like kinds need the same machinery, extract it to a file neither owns; never make one the home and the other a wrapper | §3a diagnoses; this resolves. It also pins the word **streamlining**, which otherwise reads as permission to reduce file count at the cost of symmetry. Carries the project owner's own formulation: *if an extra barrel or a third file is what buys separation and symmetry, take it every time* |
| **5b** | *A shared table is not a reason to share a folder* — the constraint is evidence about the table, not a verdict about the folder | The existing rules (cross-domain barrels + the declaration plane) have a **consequence nobody had written down**: two concerns sharing a table cannot be two domains. That silently makes the schema the author of the folder tree, and the rules then defend a schema mistake as a structural fact |

§5b is the more important of the two. Its general form — *a constraint that arrives from the schema
deserves one round of "why is the schema like that" before it becomes an architectural conclusion* —
generalises past storage, and may belong in `PRINCIPLES` rather than `_StructureLaw` if a second
instance ever appears.

### ~~1b · `_NomenclatureLaw` — name the shape, not the role that reached it first~~ — **landed as §4c, pack v1.1.0**

Added to [`laws/_NomenclatureLaw.md`](../laws/_NomenclatureLaw.md) §4 here. The rule: if a second kind
of thing turns out to have the identical shape, the type was named after a **role** and the role got
mistaken for the entity.

**The test is cheap and portable:** *if a second role arrived tomorrow, would the type need renaming?*
If yes it is already named wrong — the name is describing a *use* of the shape rather than the shape.
A role belongs in an enum, where a per-row value is supposed to live; in a type name it can only be
changed by a rename.

**The tell is an import**, which makes it greppable: a file about one role reaching into its sibling
for the type they both are.

### ~~1c · `_CommerceLaw` — a Documentation should be able to decline its law~~ — **landed as `_CommerceDocumentation` §1d, pack v1.1.0**

Writing `_CommerceDocumentation` here was awkward in a way worth fixing upstream. This project has one
payment, no balance, no ledger, no payout — so **most of `_CommerceLaw` does not bind**, and there is
no sanctioned way to say that. A companion that declines most of its law looks like an unfinished
document rather than an accurate one.

**Proposal:** give the Commerce companion (and any other law that scales with model complexity) a
standard section:

```markdown
### 1c · What does not apply, and why
| Rail | Applies? | Why |
|---|---|---|
| a ledger | ❌ | there is no balance to reconcile |

**If any row above ever becomes ✅, the law binds in full from that moment** — and the rails it
describes are cheaper to adopt before there is data than after.
```

That last sentence is the load-bearing one: it converts a decline into a **tripwire** instead of a
permanent exemption.

### ~~1d · The placeholder convention should be *fenced*, not counted~~ — **landed: the pack's own `doctrine check` reads fences, v1.0.0**

`NOTES.md` §5 Q8 proposes `grep -rn '{{' laws/` returning "only the two sanctioned spots". A count is
brittle — it breaks the moment a law legitimately grows a third form-block.

**Proposal:** the rule is *a placeholder inside a fenced code block is a **form** the law is
prescribing; a placeholder in prose is an unfinished document.* That is checkable, it does not need
maintaining, and it lets a law show a shape without being flagged.

Found by building the check: a brace-counting first version flagged `_DesignLaw` §2, which is
legitimately showing the shape a principle must take.

---

## 2 · Answers to the template's open questions — **absorbed into the pack's `NOTES.md`, v1.0.0**

**Q1 · Should `_StructureLaw` be a root law?** — **Yes, and the argument is stronger than stated.**
Not merely "it binds the whole project": while `docs/design/structure.md` held the rules *and* this
project's instance in one file, there was **no way to tell whether a sentence was binding or merely
observing**. `domains/operator` was questioned three times for holding two concerns, and each time the
answer was drawn from that file, and each time it read as a description of the tree rather than as a
missing rule. The mixture did not just make the doc unportable — **it hid a structural gap for three
rounds.**

**Q3 · Does the split hold for a per-slice doc?** — **A `_DocumentationLaw` is worth building.** This
project has nine slice docs plus six companions, and their rules are genuinely spread across
`PRINCIPLES §11`, `§12` (tense) and `_NomenclatureLaw §5`/`§7`. Two things I had to re-derive while
writing six companions in a row, which a law would have handed me: the three-section shape
(northstar / where we are / where we came from), and the rule that **"where we are now" is written in
the honest present, including the ❌ rows.** The temptation to write only the ✅ rows is strong and a
law saying so would have saved arguing with myself six times.

**Q8 · Nothing enforces the pack.** — **Confirmed, fixed here, and the evidence is worse than
suspected.** Built [`scripts/check-doctrine.mjs`](../scripts/check-doctrine.mjs), wired into
`npm run build`. Four checks: law↔companion pairing, unfilled placeholders outside fences, every
relative link resolving, every domain carrying a slice doc.

**It found fourteen dead links in files I had authored minutes earlier**, and twelve more created by
moving a single law between folders. Neither `tsc`, `eslint`, `next build` nor `check:names` could see
them — **a markdown link is a string, and a wrong string is a well-typed string**, which is the same
class of failure that shipped sixty-six wrong strings to production here on 2026-08-05.

**Recommendation: ship the check *with* the pack.** A doctrine that preaches mechanical rails and
carries none is the pack's single clearest self-contradiction, and the fix is ~130 lines with no
dependencies.

**Q7 · Does `_DesignLaw` survive the agnostic test?** — **Weakly, and this project is a poor witness.**
Our design system is deliberately minimal (hierarchy by weight and space, the accent equal to ink), so
we exercise almost none of it. Two parts did earn their keep: the *Rejects:* line, which forced us to
write down what the ink-accent ruling refuses, and §4's gallery rule, which we **fail** — recorded
honestly in `_DesignDocumentation` rather than quietly skipped. A law we fail is doing more work than
a law we never test.

---

## 3 · Not recommended

- **Do not fold `PRINCIPLES` into `laws/`** (Q2). Applying the pack made the tier distinction useful
  rather than decorative: when the two structure rules above were first written, they went into
  `PRINCIPLES` — and were **wrong there**, because principles are global philosophy and how a rule
  shows up in a folder is structure. Having a separate tier is what made that misfiling visible and
  correctable. The asymmetry is the point.
- **Do not collapse the `⟨INHERITED EVIDENCE⟩` blocks into an appendix** (Q5). Every one of them was
  read here, in place, while deciding whether a rule applied. A footnote is the first thing nobody
  reads, and the evidence *is* the argument.

---

## 4 · History

- **2026-08-06** — `baseballsensei` adopted the pack: five laws copied verbatim, `_NomenclatureLaw`
  kept local because it had already diverged (it carries a `How to rename` section and a project
  glossary), six Documentation companions written, `docs/design/structure.md` retired to a pointer,
  and `check:doctrine` built. This file opened the same day.
