# The northstar pipeline

Every step of a submission's life, every substep inside it, and — for each one —
what the trail writes when it works, what it writes when it fails, and what each
party is shown either way. **Fifty-six substeps across eighteen steps.**

It is a *northstar*, not a description: it states what should exist. Anything
marked **not built** is a gap between here and the deployed system, and most of
the document is currently marked that way. Nothing here is a promise about
today's behaviour.

**Live page:** https://claude.ai/code/artifact/192b90e6-9e00-4995-b11a-ca90a7e466c9

---

## The one file anyone edits

`northstar.py`. It is the source. The other three files are outputs:

| file | what it is |
| --- | --- |
| **`northstar.py`** | the document, authored — every substep, row and message |
| `render.py` | turns it into the artifact's eight-column table body |
| `build.py` | runs the lot and checks the outputs against the source |
| `pipeline.html` | the published page |
| `pipeline-northstar-wide.csv` | 56 rows — one per substep, four columns of cells |
| `pipeline-northstar-tidy.csv` | 815 rows — one per trail row or message, filterable |

Regenerate after any edit:

```bash
python3 docs/design/northstar/build.py
```

It rewrites the table inside `pipeline.html`, rewrites both CSVs, and then
**verifies that source, artifact and CSV agree** — on the count *and* on the
text, in both directions. It exits non-zero if they don't. A diff on an output
that isn't explained by a diff on `northstar.py` means someone edited an output.

The one thing it can't rewrite is the counts sentence in the page header: that's
prose, in words, so it's checked by eye against the tally the script prints.

## Why it's authored rather than generated

`src/domains/submission/model/stageChain.ts` describes what the code does today.
This describes where the code is going, so it deliberately isn't generated from
that — a generated document can only ever restate the thing it was generated
from, and could never carry a row that doesn't exist yet.

The intended end state is that this becomes the model: once the pipeline matches,
`STAGE_CHAIN` is regenerated from here and the two stop being separate documents.

## How to read a row

Each substep is one row and answers six questions. `4b` names one line of the
pipeline exactly — the step number alone can't, since several substeps share it.

- **Substep — still to do** · the work in the to-do voice, plus the trail row
  written when it opens
- **Precondition** · who does it (Customer · Admin · Coach · Translator · System)
  and whether a person must
- **Written to the trail when it fails / when it works** · verbatim rows, never
  templates — `3 of 5` is one of ten things that sentence can say, and writing
  the template would hide the other nine
- **Shown to someone when it fails / when it works** · verbatim messages, each
  tagged with its audience and one of four surfaces: ▤ checkout flow ·
  ▥ status page · ▣ operator portal · ✉ email
- **Substep — done** · the past voice, plus the trail row written when it closes

## Conventions the document holds itself to

- **Enumerated, never templated.** Every count is spelled out.
- **A verdict is an outcome, not a failure.** An approval that returns work to a
  coach belongs in the success column; only the send that carries it can fail.
- **The customer's status page is one sentence, overwritten** — not a log. The
  trail keeps the history, and the trail is the operator's tool.
- **Nouns for file kinds, participles for statuses** — `intake_translation` is a
  thing, `intake_translated` is something that happened.
- **`intake` / `feedback`** are the two directions. *Feedback* is the coaching
  being judged; the file kind it arrives in is also `feedback`, paired with
  `intake` (renamed from `response` on 2026-08-05).

**`pipeline.html` is only part generated.** Everything between the last
`<tbody>` and `</tbody>` comes from `northstar.py`; the prose around it — the
stage chains, the point of no return, the open questions — is written by hand in
the file. `build.py` replaces the table and leaves the prose alone.

## Known open questions

- **10c and 14b are both the admin approving.** On a submission needing
  translation, three steps separate them and both are earned. On the untranslated
  path they are back to back with nothing in between, so the second press has no
  choice to make. Unresolved.
- **Step 9 is still named "Reviewing"** — the last use of *review* in the
  document. Renaming it is a status-enum change (`in_review`), so it's deliberate
  that it hasn't been taken.
- **Six rows carry an empty column**, all in the sweep tail (15c, 16c, 17c, 18a,
  18b, 18d). Deletion has no failure path here — it retries on the next sweep.
### Closed since — 2026-08-06

Three gaps this list carried are now shut, all by ADR 018:

- ~~**Assignment wants a join.**~~ Built. `submission_assignment` holds one row
  per promise to produce a file, and the single `assignedCoachId` column is
  dropped (`0006`, `0008`). More than one person per submission is now the
  ordinary case rather than the one the schema couldn't express.
- ~~**Eighteen steps against sixteen statuses.**~~ **Twenty statuses now.**
  Steps 5 and 11 have their own rungs — `sent_to_intake_translator` and
  `sent_to_feedback_translator` — so "emailed to a translator" and "the
  translator has it" are different places, the way `sent_to_coach` and
  `in_review` already were on the coach side. The second is earned by the
  translator's own download, not declared by the admin (`0010`).
- ~~**The file kinds and the statuses use different words.**~~ Renamed. Both
  say `feedback`; `response` is retired (`0005`, `_NomenclatureDocumentation.md` §4).
