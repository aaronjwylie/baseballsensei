# \_DoctrineFeedback — what this project learned by applying the pack

> **Scope: upstream, not here.** This is the one place `{{project}}` records what it learned by
> *applying* the doctrine pack, in a form the pack can act on. Nothing here changes this repo;
> everything here is a proposal about the portable documents — and each entry is the body of the PR
> that will carry it upstream (the pack's `RELEASING.md` §3).
>
> **Kept because a fork that learns something and doesn't say so is a fork that diverges.** A law
> amended locally is pinned `amended` in `doctrine.json`; this file is where the amendment's *why*
> lives until it lands in a pack version and the pin flips back to `pack`.
>
> **A ledger that is not shrinking is not being sent.** When an entry lands, strike its heading and
> name the version — never delete it; the trail is the point.

---

## 1 · Proposed amendments

> One per rule. The heading names the law and the rule; the body carries **the failure that produced
> it** (a rule without its failure is folklore), **which section it touches**, and **whether it adds,
> sharpens, or reverses** — the last decides MAJOR vs MINOR upstream. Write it in the law's own voice,
> with the evidence in an `⟨INHERITED EVIDENCE⟩` block, so the PR is a verbatim lift.

### 1a · `{{_XLaw}}` — {{the rule, as a statement}}

**Touches:** {{§N}} · **Kind:** {{adds | sharpens | reverses}} · **Seasoned since:** {{date the
amendment was pinned locally}}

{{The rule, in the law's voice.}}

> **⟨INHERITED EVIDENCE⟩** {{The failure, in `{{project}}`, past tense, dated.}}

**Why it belongs in the law and not in this project's Documentation:** {{one sentence — what makes
it project-agnostic}}.

---

## 2 · Answers to the pack's open questions

> The pack's `NOTES.md` carries open questions. Where applying the pack here answered one, say which
> and how. Strike when the pack records the answer.

- **Q{{n}} —** {{answer}}

---

## 3 · Not recommended

> Things considered for upstream and kept project-only, with the reason. Prevents the same proposal
> being re-derived next quarter.

- **{{…}}** — {{why it is this project's alone}}

---

## 4 · History

- **{{DATE}} —** adopted pack v{{X.Y.Z}}.
