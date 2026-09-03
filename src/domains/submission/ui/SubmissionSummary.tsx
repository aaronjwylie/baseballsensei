"use client";

import type { PublicSubmission } from "../model/publicSubmission";

/**
 * How a submission describes itself to the customer who sent it.
 *
 * **One description, two places.** The history list and the downloads panel
 * both show the customer their own submissions, and both had their own idea of
 * what that meant — history grew name, age, focus, notes and dates while the
 * downloads panel still showed a bare player name, so seven finished reviews
 * arrived as seven near-identical lines (Ben, 2026-09-03). Two lists describing
 * one thing two ways is the drift this component exists to end.
 *
 * The notes matter most and were missing longest. Nobody remembers a date;
 * everybody remembers what they asked, so "the one where I said he drops his
 * back elbow" is how a person actually finds a review among several.
 *
 * It renders no card of its own. The two callers sit in different containers —
 * a plain card in history, a green one under Ready — and a component that
 * brought its own frame would have to be argued out of it at one of them.
 */
export function SubmissionSummary({
  submission,
  dateLabel = "Sent",
}: {
  submission: PublicSubmission;
  /** History says "Sent"; a finished review is better dated by both ends. */
  dateLabel?: string;
}) {
  const sent = formatDate(submission.submittedAt);
  const back = formatDate(submission.completedAt);

  return (
    <>
      <div className="font-semibold text-ink">
        {submission.playerName}
        {submission.playerAge ? (
          <span className="font-normal text-ink-muted">
            {`, age ${submission.playerAge}`}
          </span>
        ) : null}
      </div>
      {submission.focus ? (
        <div className="mt-0.5 text-sm text-ink-muted">{submission.focus}</div>
      ) : null}

      {/* Their own words, quoted back rather than truncated: a long note stays
          readable to the line, and the card stays a card. */}
      {submission.customerNotes ? (
        <p className="mt-3 border-l-2 border-line pl-3 text-sm leading-snug text-ink-soft">
          {submission.customerNotes}
        </p>
      ) : null}

      {(sent || back) && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
          {sent && (
            <div className="flex gap-1.5">
              <dt>{dateLabel}</dt>
              <dd className="m-0 font-medium text-ink-soft">{sent}</dd>
            </div>
          )}
          {back && (
            <div className="flex gap-1.5">
              <dt>Feedback ready</dt>
              <dd className="m-0 font-medium text-ink-soft">{back}</dd>
            </div>
          )}
        </dl>
      )}
    </>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
