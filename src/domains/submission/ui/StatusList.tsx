"use client";
import type { ReactNode } from "react";

import { ButtonLink } from "@/shared/ui";
import type { PublicSubmission } from "../model/publicSubmission";
import { SubmissionSummary } from "./SubmissionSummary";

/**
 * A customer's submissions, rendered.
 *
 * Extracted from `StatusLookup` so **both doors show the same page**: the
 * capability link from an email lands here directly, and the typed-email lookup
 * lands here after a code. Two entrances, one room — written twice they would
 * drift, and the row a customer sees would depend on how they arrived.
 */
export function StatusList({
  submissions,
  email,
  downloads,
}: {
  submissions: PublicSubmission[];
  email: string;
  /**
   * The download rows for each submission that has any, keyed by its id.
   *
   * **Passed in, not imported.** Rendering them here directly would make
   * `submission` depend on `feedback`, which already depends on `submission` —
   * a cycle the graph forbids (`_StructureLaw` §5.3) and nothing could see
   * until `check:structure` existed. Composition belongs to the layer above;
   * this component says *where* they go and `app/` says *what* they are.
   *
   * **A map rather than one node**, which is what collapsed the page from two
   * lists to one (Ben, 2026-09-03). A single opaque panel could only be placed
   * *beside* the list, so every finished review appeared twice — once in the
   * panel with its download and once in the list with its status, each carrying
   * half of what a reader wanted. Keyed by id, the files can go inside the card
   * that already says whose review it is.
   *
   * Elements, not a render function: this crosses a server-to-client boundary
   * on `/status/[token]`, and a function would not serialise.
   */
  downloads?: Record<string, ReactNode>;
}) {
  if (submissions.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-6 text-center">
        <p className="text-ink">
          No submissions found for <span className="font-medium">{email}</span>.
        </p>
        <p className="mt-1.5 text-sm text-ink-muted">
          Double-check the address, or start a new review.
        </p>
        <div className="mt-5">
          <ButtonLink href="/start">Start a review</ButtonLink>
        </div>
      </div>
    );
  }

  /*
    **One list, one card per submission** (Ben, 2026-09-03).

    This was two sections — "Ready to download" and a full list below it — so a
    finished review appeared twice: once with its files and no status, once with
    its status and no files. Neither card was the whole thing, and on an account
    where everything is finished the page was the same list printed twice.

    Ordered **ready first**, which is the one thing worth keeping from the split.
    A parent whose review has just landed should not scroll past submissions that
    need nothing from them to reach the one that does. Within each group the
    server's order stands, which is newest first.

    Not sorted by `hasFeedback` but by whether files are actually on the page: a
    released submission whose files have been swept still reads as having
    feedback, and belongs with the rest rather than at the top promising a
    download it no longer has.
  */
  const hasFiles = (s: PublicSubmission) => !!downloads?.[s.id];
  const ordered = [
    ...submissions.filter(hasFiles),
    ...submissions.filter((s) => !hasFiles(s)),
  ];

  return (
    <>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {`Your submissions (${ordered.length})`}
      </h3>
      <ul className="mt-3 space-y-3">
        {ordered.map((submission) => (
          <StatusRow
            key={submission.id}
            submission={submission}
            downloads={downloads?.[submission.id]}
          />
        ))}
      </ul>
    </>
  );
}

/**
 * The two sentences most of the ladder collapses into. Named constants rather
 * than repeated literals so a wording change lands everywhere at once — eleven
 * of the sixteen rungs share one of these.
 */
const WITH_YOUR_COACH = {
  label: "With your coach",
  className: "bg-blue-50 text-blue-700 border-blue-200",
} as const;

const READY = {
  label: "Feedback ready",
  className: "bg-emerald-50 text-emerald-700 border-emerald-200",
} as const;

const STATUS_META: Record<
  PublicSubmission["status"],
  { label: string; className: string }
> = {
  // A draft never reaches the lookup — `findByCustomerEmail` filters it out —
  // but the map is exhaustive so a new status can't be added without deciding
  // what a customer should be told about it.
  //
  // **Twenty operator states collapse into five customer ones.** A parent has
  // no use for `feedback_translating`; they want to know whether it has arrived,
  // whether it's being worked on, and whether they can still download it. Every
  // middle rung is therefore the same sentence, deliberately — the collapse is
  // the feature, not laziness.
  draft: {
    label: "Not finished",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  awaiting_payment: {
    label: "Awaiting payment",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  // Not "video received" — a submission is a pack of files, and naming it after
  // one of them is how the old single-video model kept creeping back.
  new: {
    label: "Received",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },

  // Everything between assignment and release is one sentence to the customer.
  // Translation and the admin's approval check are internal steps; surfacing them
  // would invite questions the parent can't act on.
  assigned: WITH_YOUR_COACH,
  intake_translator_assigned: WITH_YOUR_COACH,
  sent_to_intake_translator: WITH_YOUR_COACH,
  intake_translating: WITH_YOUR_COACH,
  intake_translated: WITH_YOUR_COACH,
  sent_to_coach: WITH_YOUR_COACH,
  in_review: WITH_YOUR_COACH,
  awaiting_approval: WITH_YOUR_COACH,
  feedback_translator_assigned: WITH_YOUR_COACH,
  sent_to_feedback_translator: WITH_YOUR_COACH,
  feedback_translating: WITH_YOUR_COACH,
  feedback_translated: WITH_YOUR_COACH,

  // Ready to collect. `resolved` is the admin closing his side of the job — nothing
  // changes for the customer, who can still download.
  complete: READY,
  collected: READY,
  resolved: READY,

  // The one middle state worth surfacing: it changes what they should *do*.
  purge_imminent: {
    label: "Ready, expiring soon",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  purged: {
    label: "No longer available",
    className: "bg-stone-50 text-stone-600 border-stone-200",
  },
};

/**
 * One submission, as a card the customer can identify (Ben, 2026-09-03).
 *
 * It was a name, a focus, a date and a pill on one line — which is legible on a
 * page with one submission and useless on a page with five, where every row
 * says "Hitting" and the only thing separating two reviews of the same child is
 * a date. A customer looking for "the one where I asked about his back elbow"
 * had nothing to look for.
 *
 * So the card carries the things that tell one apart: who it was for and how
 * old they were, what it was about, when it was sent, when it came back, and
 * their own words. The notes are the strongest of those and were the ones
 * missing — nobody remembers a date, everybody remembers what they asked.
 *
 * It does **not** name the coach. That is ours, not theirs, and the projection
 * this reads leaves it out on purpose whoever is asking.
 */
function StatusRow({
  submission,
  downloads,
}: {
  submission: PublicSubmission;
  /** This submission's files, when it has any. Rendered inside its own card. */
  downloads?: ReactNode;
}) {
  const meta = STATUS_META[submission.status];

  return (
    /*
      A ready card is tinted, the rest are plain. Colour is what separated the
      two lists, and it survives the merge as a property of the card rather than
      of a section \u2014 which is the more honest place for it: readiness belongs to
      a submission, not to a region of the page.
    */
    <li
      className={`rounded-2xl border p-5 ${
        downloads ? "border-emerald-200 bg-emerald-50/50" : "border-line bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SubmissionSummary submission={submission} />
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}
        >
          {meta.label}
        </span>
      </div>

      {/*
        The files, in the card that already says whose review this is. There was
        a "Download \u2191" link here that jumped to a separate panel; the jump is
        gone with the panel, and a link to somewhere else on the page was always
        a worse answer than the thing itself.
      */}
      {downloads}
    </li>
  );
}
