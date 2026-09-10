# documentation/ — this project's instance of each law

A **Law** is the rule and is copied verbatim between projects. A **Documentation** is this project's
instance of it and is written from scratch. If a law contains a table you have to fill in, it is in
the wrong file.

| Law (`laws/`) | Documentation (here) | Answers |
|---|---|---|
| [`_StructureLaw`](../laws/_StructureLaw.md) | [`_StructureDocumentation`](_StructureDocumentation.md) | our layers, our ten domains, our exceptions |
| [`_NomenclatureLaw`](../laws/_NomenclatureLaw.md) | [`_NomenclatureDocumentation`](_NomenclatureDocumentation.md) | the glossary — what "intake" means here |
| [`_SecurityLaw`](../laws/_SecurityLaw.md) | [`_SecurityDocumentation`](_SecurityDocumentation.md) | our threat model, boundaries, open findings |
| [`_VerificationLaw`](../laws/_VerificationLaw.md) | [`_VerificationDocumentation`](_VerificationDocumentation.md) | our gate roster and what each has caught |
| [`_QALaw`](../laws/_QALaw.md) | [`_QADocumentation`](_QADocumentation.md) | our probe, our itinerary, and what a pass has caught |
| [`_CommerceLaw`](../laws/_CommerceLaw.md) | [`_CommerceDocumentation`](_CommerceDocumentation.md) | one payment, one submission — and which rails don't bind |
| [`_DesignLaw`](../laws/_DesignLaw.md) | [`_DesignDocumentation`](_DesignDocumentation.md) | our tokens and rulings |
| [`_ReleaseLaw`](../laws/_ReleaseLaw.md) | [`_ReleaseDocumentation`](_ReleaseDocumentation.md) | our rungs, how a tag reaches production, and how it comes back |

**Above them:** [`PRINCIPLES.md`](../PRINCIPLES.md) — one per project, outranks the laws, answers *why*.

**Below them:** each domain carries `src/domains/*/_XxxDocumentation.md`. Read the slice's doc before
changing the slice. The shape is [`templates/_SliceDocumentation.md`](../templates/_SliceDocumentation.md).

Two supporting artifacts: an **ADR** records one decision and its rejected alternatives
(`docs/decisions/`, shape in [`templates/adr.md`](../templates/adr.md)); a **charter** is one AI
reviewer's mandate (shape in [`templates/charter.md`](../templates/charter.md), none written yet).

**Checked, not trusted.** [`scripts/check-doctrine.mjs`](../scripts/check-doctrine.mjs) runs in
`npm run build` and fails it on: a law with no companion, an unfilled brace-placeholder outside a
fenced form, a dead relative link, a domain with no slice doc, or **a law that drifted from the hash
pinned in [`doctrine.json`](../doctrine.json)** (since 2026-09-10). It found fourteen dead links in
files authored minutes earlier — a markdown link is a string, and a wrong string is a well-typed
string.

**Feedback flows back upstream.** What this project learned by *applying* the pack — proposed
amendments, and answers to the template's own open questions — is
[`_DoctrineFeedback.md`](_DoctrineFeedback.md).

**Versioned and vendored.** The pack follows its own `_ReleaseLaw` (its `RELEASING.md`). This project
is pinned to **pack v1.1.0** in `doctrine.json`, written by the pack's `tools/doctrine/doctrine.mjs pin`;
every law and template is marked `pack` — identical to canon — and `check:doctrine` fails the build on
drift. **Nobody edits `laws/` in a feature PR:** an amendment is recorded in
[`_DoctrineFeedback.md`](_DoctrineFeedback.md), sent upstream as a PR to the pack, and comes back via
`doctrine upgrade <this repo>`, followed by the pack changelog's `Operate` items. v1.1.0 was exactly
that loop, run once.

Adopted 2026-08-06 from `_DoctrineTemplate`; pinned to v1.0.0 on 2026-09-10 and upgraded to v1.1.0
the same day, when its two amendments landed upstream.
