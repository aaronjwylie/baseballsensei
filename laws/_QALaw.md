# \_QALaw — finding what nobody knew to ask

> **What this is.** The principled home for **quality assurance** — a human working a product cover to
> cover, watched closely enough that what they find can be acted on. It answers one question: *what is
> wrong that no gate was ever going to tell us?*
>
> **This law is project-agnostic and copied verbatim.** It legislates what an instrument must capture,
> what an itinerary must be, and how a finding is recorded. The project's actual itinerary, its probe,
> and what a pass has found live in [`_QADocumentation.md`](../documentation/_QADocumentation.md).
>
> **A SECOND thing exists and is not a section of this one:**
> [`_VerificationLaw.md`](_VerificationLaw.md). That law is the machinery that proves a change did not
> break what we already knew to ask about. This one is the hours a person spends discovering what we
> did not. §2 is the whole of the distinction and is worth reading before deciding a check belongs here.
>
> **Examples** ([PRINCIPLES §12a](../PRINCIPLES.md)): every failure cited is **evidence** — past tense,
> permanent, never pruned.

---

## 1 · The northstar

> **A gate answers a question someone already thought to ask. A QA pass is how the unasked questions
> get found.** Everything here exists to spend human attention where machines are structurally blind,
> and to make sure that attention is not wasted.

Two properties follow, and everything in this law is downstream of them.

**QA is judgement, not machinery.** A gate is deterministic: same input, same answer, forever. A pass
is a person forming an opinion — *that reads wrong*, *that took too long*, *I did not know what to do
next*. Those are not assertions and cannot be made into them without first knowing to ask.

**QA does not amortize, and verification does.** A gate is expensive once and free for a thousand runs
after; that economics is why a gate should be total. A pass costs the same every time it is run, which
means it must be **spent**, not repeated: pointed at exactly what the gates cannot reach, and shortened
every time one of its findings becomes a gate (Q12).

**The corollary is the whole discipline: an itinerary that is not shrinking is not being learned from.**

---

## 2 · Why this is not verification

[`_VerificationLaw`](_VerificationLaw.md) §2 already concedes the ground, in its own words:

> a **check** is a machine-verifiable assertion about something you already knew to ask; **testing** is
> human exploration that finds what you did not know to ask. By that split, everything in that document
> is checking — which is why it *complements a human clicking around rather than replacing it*, and why
> the limit is **structural** rather than a temporary shortfall.

This law governs the other half of that sentence. The split is not tooling, it is epistemic:

| | Verification | QA |
|---|---|---|
| **Asks** | did this change break what we knew to ask? | what is wrong that nobody knew to ask? |
| **Method** | deterministic machinery | human judgement |
| **Repeats** | identically, forever | never the same way twice |
| **Answers** | binary, per check | a finding, whose severity someone weighs |
| **A failure means** | the code is wrong | the code, the copy, the data, the design, or the plan is wrong |
| **Economics** | expensive once, free after | expensive every time |
| **Blind to** | anything not yet imagined | anything not on the screen |

> **The last row of the middle column is why both exist.** A gate cannot tell you the hero image failed
> to load, that a button's label lies about what it does, or that a step is confusing. A person cannot
> re-check a twenty-rung state machine on every merge without becoming a machine badly.

**The clarifying test, when it is unclear which side a check belongs on:** *if it fails, do you know
what to fix?* A red gate names a line. A finding may require a conversation. If a check needs a
conversation, it is QA, and trying to gate it produces a flaky gate and a resented one.

---

## 3 · The rails

Fifteen. Q1–Q6 govern the instrument, Q7–Q10 the itinerary and the run, Q11–Q15 the record, the loop,
how a pass is watched, how the two documents stay one, and the record's own instrumentation.

### The instrument

**Q1 · Arm the instrument first, and prove it sees before spending a single check on the product.**
Have someone perform a deliberate, known act and confirm it arrives. A pass conducted through an
instrument nobody verified produces silence that cannot be distinguished from success.

**Q2 · The instrument is under test for the whole run, and is the more likely suspect early on.**
It is new, it was written for this run, and it has never met real use. Expect the first findings to be
about the instrument rather than the product, and treat that as the instrument working. *Evidence: in
one pass, the first three findings were all defects in the probe — anchor navigation uncaptured, failed
requests uncaptured, and framework prefetches reported as failures.*

**Q3 · Capture the way the system under test actually says no.**
Every product has a characteristic failure mode, and it is rarely an exception. A rendered message, a
disabled control, a silent no-op, a toast that vanishes — find out how *this* system reports refusal
and capture that specifically, or the log will show a person acting and then, apparently, stopping.
*Evidence: a flow whose server actions answered `{ok: false, error}` over HTTP 200 and rendered the
message into the page produced no window error, no console output and no failed request. Its most
common failure mode was invisible to an instrument capturing all three.*

**Q4 · A line in the log must mean something went wrong.**
Frameworks cancel their own speculative work constantly — prefetches abandoned by the navigation that
made them moot, requests aborted by an unmounting component. Reporting those is not thoroughness; it is
teaching the reader to ignore the log. **Suppress routine cancellation, and suppress the instrument's
own traffic**, or a pass reaches its third phase with nobody reading.

**Q5 · Record descriptions, never contents.**
What was clicked, which field was filled, how long the entry was — never what was typed. On a
production system this is not politeness: a QA log that accumulates real entries is a second copy of
that data, governed by none of the retention rules that cover the first. **Names matching secrets are
dropped twice** — in the instrument and again at the ingest — because the instrument is one of the
things under test.

**Q6 · Off is the default, and off is total.**
Instrumentation reachable by anyone is an endpoint someone will find. Gate it on a secret whose absence
disables everything, answer *not found* rather than *not authorised* — an endpoint that says "wrong
token" has confirmed it exists — and make removal a single deliberate act. **Write the teardown when
you write the instrument**, while the reasoning is still to hand.

### The itinerary and the run

**Q7 · Every check has an id, and the ids are stable.**
This is the highest-leverage decision in the whole document. An id is what lets a finding be named in
one syllable, referenced tomorrow, and closed without ambiguity. An itinerary of unnumbered prose
produces findings that read *"the thing on the second page"*.

**Q8 · Order by dependency and by the cost of being wrong — never by module.**
An itinerary organised the way the code is organised tests the way the code is written rather than the
way it is used. Order it as a person meets it: prerequisites that would invalidate everything after
them, then the path where being wrong costs money or trust, then the long tail. Put the irreversible and
the expensive **last**, once everything cheap has passed.

**Q9 · Separate defects from decisions, and mark them differently.**
Some checks exist because the implementer overrode the designer, chose between two defensible
readings, or shipped less than was drawn. Those are not bugs to find — they are **decisions to
ratify**, and presenting them as checks invites a pass to re-litigate settled calls while genuine
defects wait. Mark them, state who decided and why, and let the reviewer disagree explicitly.

**Q10 · Run in the mode where you can cause failure on demand.**
The failures worth testing are the ones that are hard to produce: a declined payment, an authentication
challenge, a dropped connection, a full disk. Choose the environment that lets you *summon* those —
a provider's test mode, a fault-injecting proxy, a throttled network — and leave the real one for a
final configuration check. **Testing in the irreversible mode first costs money and removes the ability
to test the failures at all.**

### The record, the loop, and the watching

**Q11 · One record, live and shared — not one per participant.**
Two people run a pass and a third follows it. State kept in one browser is invisible to the other two,
and a record that only settles at the end is no use while the run is happening. Whatever holds the
marks must be **readable by everyone who needs it, as they are made** — including by someone with no
checkout, which is why a link beats a file. *Evidence: a checklist built for a watcher to follow stored
its marks in `localStorage`, where the watcher could not reach them — the one thing it existed to do.*

> **The instrument and the record remove different narration.** The instrument says what happened, so
> the tester need not describe their actions. The record says where the run is, so they need not
> describe their position. Missing either, the tester ends up reading their session aloud, which is
> slower than doing it alone.

**Q12 · A finding a gate could have caught becomes a gate, and the itinerary shrinks.**
This is the loop that keeps QA from becoming ceremony. Every pass should end with two lists: what to
fix, and **what should have been mechanical**. The second list is an amendment to
[`_VerificationLaw`](_VerificationLaw.md)'s roster, and the corresponding check is then **deleted
here**. An itinerary that never loses a line is one nobody is learning from.

**Q13 · Someone must hold a view the testers do not.**
Not for oversight — for triangulation (§7). A watcher reading the instrument, and where possible the
system's own state, can see the consequence of an action rather than only the action; the testers can
see meaning, which no log carries. **Staff the pass so at least two different kinds of evidence are in
the room**, because every disagreement between them is a finding neither would have produced alone.

**Q14 · The itinerary and the record are one source and one generated output.**
An itinerary that is edited and a record that is ticked are the same 166 facts written twice, and the
pair drifts the first time either is touched — which is guaranteed, because Q12 removes checks and
findings add them **while the pass is running**. So: the itinerary is the source, the record is built
from it by a script, and **nothing is hand-copied between them**. Two properties make that safe to run
mid-pass:

- **Marks survive a rebuild**, carried across by id. A rebuild that discarded progress would be
  unusable at exactly the moment it is needed.
- **A mark whose check has gone is reported, not dropped.** Silently losing a verdict is how a record
  comes to claim a coverage nobody achieved.

**And the generator refuses to guess.** A row that looks like a check but cannot be parsed is a hard
error, never a skip — a quietly dropped check makes the record claim *less* than the itinerary
promises, in the one direction nobody audits.

**Q15 · Instrument the record too, as far as its host allows — and say where it cannot be.**
The record is a surface people use, and how they used it is evidence: which phase was being read, a
tick someone changed their mind about, a filter to failures that says the run has moved from testing to
reviewing. A verdict with no account of how it was reached is thinner than it looks.

**It will almost never be instrumentable the way the product is.** A record lives in someone else's
host — a sandboxed viewer, a wiki, a spreadsheet — and typically cannot post anywhere. Carry its trail
inside whatever the record already saves, accept that it arrives later and coarser, and **write down
what it cannot see** rather than implying parity. Q5 applies unchanged: which check a note belongs to,
never a word of it.

**The version is part of this.** A shared record acquires copies — a pinned link, a stale tab, a
downloaded page — and every question about a finding then starts with *which version were you looking
at?* That question has to be answerable at a glance.

**But do not invent a second numbering if the host already has one.** Two schemes side by side are two
names for one thing, and the one you control is the one that will be wrong. It is worse than that for a
record that publishes itself: the host assigns a version *at publish*, after the page is written, so a
number baked into the page cannot include its own — and every time a viewer's tick republishes the
page, it carries the old stamp while the host increments underneath it. **Use the host's version, and
spend your effort on naming it**: a label saying what changed is worth more beside a version row than a
number repeated in two places. Stamp your own only where the host offers none.

---

## 4 · What an instrument captures

The minimum that makes a pass legible without narration. Anything less and the tester is describing
their own session from memory.

| Signal | Why it earns its place |
|---|---|
| **Interaction** | what was clicked, by its accessible name — the name a person would use for it |
| **Navigation** | including in-page movement, if the product navigates that way |
| **Form activity** | which field, its type, whether it was filled — never the value (Q5) |
| **Submission** | the act, and which fields the form carried |
| **Uncaught errors** | window errors and unhandled rejections |
| **Failed requests** | status and path — path only, since query strings carry tokens |
| **Rendered refusals** | the product's own way of saying no (Q3) |
| **Participant** | who did it, when two people run at once |

Two rules on top of the list:

- **The instrument must never become the bug.** Wrap every listener, swallow the reporter's own
  failures, and never throw into the page. An instrument that breaks what it measures is worse than
  none, because it also invalidates everything measured before it broke.
- **Timestamps are stored as instants and read in the reader's zone.** An absolute instant is the only
  defensible storage when participants are in different places; but printed raw it says one time while
  the person who did the clicking is looking at another, and every other console the run
  cross-references is in a third. **Print both.**

---

## 5 · What an itinerary is

**Faceted, not linear.** Group by surface and journey — public pages, the paid path, each role's
portal, delivery, system jobs, and the cross-cutting sweep that applies to all of them. A person tests
one context at a time; make the document match.

**Each check is three things:** an **id** (Q7), the **act** in the tester's words, and the **expectation
in falsifiable terms**. "Works correctly" is not an expectation. "Answers 410, not 404" is.

**A phase states its own prerequisites** and what it invalidates if skipped, because a pass is run by
people who will legitimately choose to skip.

**And it says what it is not covering.** Coverage claimed but not exercised is worse than an
acknowledged gap ([PRINCIPLES §10](../PRINCIPLES.md)) — the same rule the gate roster lives under.

---

## 6 · The record has two jobs, and they are not the same job

**During the pass it is a shared cursor. Afterwards it is the report.** Most records are built for the
second job and are then useless for the first, which is the more demanding of the two.

### During — the cursor

A pass is long, is run by more than one person, and is watched by someone who is not clicking. What
holds it together is a surface all of them can see:

- **Live.** A mark by one participant reaches the others in seconds, not at the end. Without that, two
  testers re-run each other's checks and neither notices.
- **Reachable by a link.** The person following may have no repository, no editor and no local copy. A
  file in the source tree fails this test precisely when it matters — a designer, a client, or a second
  pair of eyes brought in for an hour.
- **Navigable.** Eleven phases and a few hundred checks; jumping to a phase has to be one click, and it
  has to be obvious which phase is finished.
- **Showing what is LEFT, not only what is done.** Remaining is the number that decides whether to
  carry on, break, or stop — and it is the one a checklist usually omits.
- **Cheap to update.** A tick. Anything heavier and the record silently stops matching the run, which
  is worse than no record because it is believed.
- **Honest about where it stores things.** A record that says "shared" while writing to one browser is
  a lie in the direction of safety. Say which mode it is in, on the page.

### Afterwards — the report

The same document, read cold by someone who was not there:

- **Carries the ids** (Q7), so a finding and its check are the same thing.
- **Distinguishes not-yet-run from passed**, so a resumed pass starts in the right place.
- **Lets a failure carry a sentence.** A failed check with no note is a finding nobody can act on.
- **Filters to the failures**, because that view is the actual output of the pass.
- **Names what was skipped and why** — an unexercised check recorded as passed is the one outcome that
  makes the whole document untrustworthy.

> **The record is not a bug tracker and should not become one.** It says what happened during a pass.
> What happens *next* — priority, owner, whether it ships — belongs wherever that project already
> decides such things.

---

## 7 · Three views, and the value of their disagreement

A pass run well has the same run visible three ways at once, held by different people:

| View | Sees | Is blind to |
|---|---|---|
| **The screen** — the testers | what it looks like, reads like, feels like; whether a step made sense | the network, the database, and their own memory of what they just did |
| **The instrument** — the watcher | every action and refusal, exactly, in order | meaning. It cannot tell you an image failed to load or a sentence is wrong |
| **The record** — everyone | the agreed verdict, and how much is left | anything nobody has formed an opinion about yet |

A fourth, where the watcher can reach it: **the system's own state** — the row that moved, the trail
that was written, the mail that was accepted. That is what closes the loop from *"I clicked assign"* to
*"the assignment happened, and here is the evidence."*

> **The disagreements are the point.** Not the redundancy — the *contradiction*. When the instrument
> says nothing happened and the tester says something did, one of them is wrong, and finding out which
> is a finding either way.

*Evidence: every defect found in one pass's first hour came from a disagreement, not an assertion. The
log showed a tester submit a code and then fall silent while the tester was looking at an error message
— which exposed that the product's characteristic refusal was uninstrumented (Q3). The log reported four
network failures while the testers saw nothing wrong — which exposed that the instrument was reporting
the framework's own cancelled prefetches (Q4). Neither view alone said anything was wrong.*

**What this asks of how a pass is staffed.** One person clicking while another watches is not
supervision and should not be described as it; it is two instruments pointed at one system from
different angles. A pass where everyone holds the same view produces only the findings somebody thought
to notice on screen — which is the smallest of the three sets.

**And it is why Q4 is load-bearing.** A watcher only keeps watching while the log stays worth reading.
A stream with routine false alarms in it collapses this section back to one view within an hour, and
nobody announces that it has happened.

---

## 8 · The ways a pass is silently not one

Each of these looks like QA and produces nothing.

- **No instrument.** The only bug report available is *"it didn't work"*, and the tester is asked to
  remember what they did. Q1.
- **An instrument nobody proved.** Silence is read as success. Q1 again, and it is the most expensive
  version of this failure because it invalidates the whole run.
- **A noisy log.** False failures teach the reader to skim. By the third phase the log is decoration. Q4.
- **The author testing their own change.** They will follow the path they built and will not see the
  assumptions they made. Not always avoidable on a small team — **but say so in the record**, because
  it bounds what the pass is worth.
- **An itinerary shaped like the codebase.** It tests what was built rather than what is used. Q8.
- **Checks with no falsifiable expectation.** Everything passes, because nothing said what failing
  looks like.
- **A pass run against data that cannot afford it.** QA generates real records in whatever it points
  at. Settle retention, access and reversibility *before* the first check, not after.
- **One view only.** The tester clicks, and nobody is reading anything but the screen. What gets found
  is what someone happened to notice, and no disagreement is possible because there is nothing to
  disagree with. Q13.
- **A record only the tester can see.** The people following ask what is happening, the tester
  narrates, and the pass runs at the speed of description. Q11.
- **A record that settles only at the end.** Useful as a report, useless as a cursor: two testers
  duplicate each other's checks and nobody notices until the totals disagree. Q11.
- **Findings that never become gates.** The same pass is run forever, finding the same things. Q12.
- **A record nobody instrumented.** The product's every click is captured and the document holding the
  verdicts records nothing, so how a judgement was reached is lost while how a button was pressed is
  kept. Q15.
- **Two copies of the checks.** One in the document people edit, one in the thing people tick. They
  agree on the day they are made and never again, and the first person to notice is a tester ticking a
  check that no longer exists. Q14.

---

## 9 · Writing your own

**Do not adopt this law before you have run a pass without one.** The rails above are each a
description of something that went wrong; adopted in advance they read as bureaucracy, and the two or
three that would have saved your project are indistinguishable from the ten that would not have.

The order that works:

1. **Run a pass with an instrument and no doctrine.** Note every moment you could not tell what
   happened.
2. **Fix the instrument during the run.** Those fixes are the first draft of your Q1–Q6.
3. **Write the itinerary as you go**, giving every check an id from the first one.
4. **At the end, split the findings** into *fix this* and *this should have been mechanical*.
5. **Then write your Documentation** — the itinerary, the probe, the roster of what a pass has caught.

---

## Related

- [`_VerificationLaw.md`](_VerificationLaw.md) — the machinery this law complements. Q12 amends its
  roster; its §2 concedes this law's territory.
- [`_SecurityLaw.md`](_SecurityLaw.md) — Q5 and Q6 are its rails applied to an instrument. A probe is a
  data collector and an endpoint, and it is governed there too.
- [`PRINCIPLES.md`](../PRINCIPLES.md) — §10, known limits stated honestly, is why §5 ends with an
  itinerary declaring its own gaps.
