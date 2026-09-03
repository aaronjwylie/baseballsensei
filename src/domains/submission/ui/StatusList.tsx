"use client";
import type { ReactNode } from "react";

import { ButtonLink } from "@/shared/ui";
import { FEEDBACK_ANCHOR } from "@/shared/lib/anchors";
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
  feedbackAccess,
  readyIds,
}: {
  submissions: PublicSubmission[];
  email: string;
  /**
   * What to show once any submission has feedback waiting.
   *
   * **Passed in, not imported.** Rendering it here directly made
   * `submission` depend on `feedback`, which already depends on `submission` —
   * a cycle the graph forbids (`_StructureLaw` §5.3) and nothing could see
   * until `check:structure` existed. Composition belongs to the layer above;
   * this component says *where* it goes and `app/` says *what* it is.
   */
  feedbackAccess?: ReactNode;
  /**
   * Which submissions the panel above is already showing, so they are not
   * listed a second time below it.
   *
   * Ids rather than a count or a flag: the list below has to know *which*, and
   * the composing layer is the only place that can see both halves — this
   * component cannot look inside `feedbackAccess`, which is deliberately opaque
   * to it.
   */
  readyIds?: string[];
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

  const anythingReady = submissions.some((s) => s.hasFeedback);

  /*
    **Each submission appears once** (Ben, 2026-09-03).

    Every finished review was listed twice — as a card under Ready with its
    download, and again below under a heading of its own. On an account where
    everything is finished that is the same list printed twice, which is what it
    looked like.

    Filtered by id rather than by `hasFeedback`, and the difference matters at
    the end of the retention window: a released submission whose files have been
    swept still reads as having feedback, but has no card under Ready to be a
    duplicate *of*. Filtering on the flag would erase it from both lists and the
    customer would lose the only record that it ever existed. `readyIds` is what
    is actually on the page, so only what is genuinely shown twice is removed.
  */
  const shown = new Set(readyIds ?? []);
  const rest = submissions.filter((s) => !shown.has(s.id));

  return (
    <>
      {/*
        **Ready first, history second** (Ben, 2026-09-03).

        These sat the other way round, so a parent whose review had just landed
        opened the page to a list of past submissions and had to scroll past
        their own history to reach the thing the email had told them was
        waiting. The page has one job on the day it matters, and that job was
        below the fold.

        The order is not "newest first" — it is *actionable first*. What follows
        needs nothing from them.
      */}
      {anythingReady && feedbackAccess}

      {rest.length > 0 && (
        <>
          {/*
            "Your history" was wrong for what is left once the finished reviews
            move up to Ready: these are the ones still being worked on, and
            calling them history invites a customer to stop waiting for them.
            It only says "everything else" when there is a Ready panel above to
            be else *of*.
          */}
          <h3
            className={`text-sm font-semibold uppercase tracking-wide text-ink-muted ${
              anythingReady && feedbackAccess ? "mt-8" : ""
            }`}
          >
            {anythingReady && feedbackAccess ? "In progress" : "Your submissions"}
          </h3>
          <ul className="mt-3 space-y-3">
            {rest.map((submission) => (
              <StatusRow
                key={submission.id}
                submission={submission}
                hasDownloads={false}
              />
            ))}
          </ul>
        </>
      )}
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
  hasDownloads,
}: {
  submission: PublicSubmission;
  /** Only link to a panel that is actually on the page. */
  hasDownloads: boolean;
}) {
  const meta = STATUS_META[submission.status];

  return (
    <li className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SubmissionSummary submission={submission} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}
          >
            {meta.label}
          </span>
          {submission.hasFeedback && hasDownloads ? (
            <a
              href={`#${FEEDBACK_ANCHOR}`}
              className="shrink-0 text-xs font-semibold text-accent underline underline-offset-2 hover:text-ink"
            >
              {"Download \u2191"}
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}
