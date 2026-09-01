"use client";

import type { ReactNode } from "react";
import { pillClass } from "@/shared/ui";
import {
  RUNG_LABEL,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
  TRANSLATION_RUNGS,
} from "../model/submission";

/**
 * The ladder as sixteen dots, with the current rung named above it.
 *
 * **It replaces the status column rather than joining it.** That's what pays for
 * the pill's height: a row that shows a badge *and* a progress bar is taller than
 * one where the bar carries the badge.
 *
 * Optional rungs are drawn as a detour, not a gap. A submission whose coach reads
 * English never touches four of them, and without that distinction every such row
 * looks permanently incomplete.
 *
 * Imports the model directly, not the slice barrel — the barrel re-exports
 * Postgres code and this is a client component.
 */

/** Operator-facing names. The customer's lookup collapses these; this doesn't. */
/** The rungs only a submission needing translation touches. */
const OPTIONAL: ReadonlySet<SubmissionStatus> = new Set(TRANSLATION_RUNGS);

/** The one rung that wants the eye. */
const WARN: ReadonlySet<SubmissionStatus> = new Set(["purge_imminent"]);

export function StatusRail({
  status,
  needsTranslation,
  detail,
}: {
  status: SubmissionStatus;
  /** Fades the optional rungs on a submission that will never touch them. */
  needsTranslation: boolean;
  /**
   * A second line under the name: the breadcrumb still outstanding.
   *
   * The name answers *where* a submission is, and can sit unchanged for days.
   * This answers *what has to happen for it to move* — which is the question
   * anyone scanning a queue is actually asking.
   *
   * **The same sentence that closes the trail below**, so the pill is the tail
   * of that list hoisted into view rather than a second opinion about it.
   *
   * **A build-time readout, on trial.** It roughly doubles the row's height,
   * and once the flow is trusted the name alone is probably enough. Drop this
   * prop and its two call sites to take it out; nothing else depends on it.
   */
  detail?: ReactNode;
}) {
  const at = SUBMISSION_STATUSES.indexOf(status);
  const pos = (i: number) => (i / (SUBMISSION_STATUSES.length - 1)) * 100;
  // Keep the pill on canvas at the extremes; the stem still points true.
  const pillLeft = Math.min(Math.max(pos(at), 9), 91);
  const warn = WARN.has(status);

  // The rail's furniture drops by the height of the second line when there is
  // one, so the stem still lands on the pill and the dots stay clear of it.
  const drop = detail ? 17 : 0;

  return (
    <div
      className={detail ? "relative h-[61px]" : "relative h-11"}
      /* Counted, not written down. This said "of 16" while the ladder
         had 20 rungs — it went stale the moment translation was added,
         and a screen reader was the only place it showed. */
      aria-label={`Step ${at + 1} of ${SUBMISSION_STATUSES.length}: ${RUNG_LABEL[status]}`}
    >
      <span
        className={`${pillClass} absolute top-0 -translate-x-1/2 ${
          detail ? "flex flex-col items-center gap-px leading-tight" : ""
        } ${
          warn
            ? "border-amber-600 bg-white text-amber-700"
            : "border-ink bg-ink text-white"
        }`}
        style={{ left: `${pillLeft}%` }}
      >
        <span>{RUNG_LABEL[status]}</span>
        {detail ? (
          <span
            className={`max-w-[34ch] truncate text-[10px] font-normal ${
              warn ? "text-amber-700/75" : "text-white/70"
            }`}
          >
            {detail}
          </span>
        ) : null}
      </span>
      <span
        className={`absolute h-[9px] w-px -translate-x-1/2 ${warn ? "bg-amber-600" : "bg-ink"}`}
        style={{ left: `${pos(at)}%`, top: 21 + drop }}
      />
      <div
        className="absolute inset-x-0 flex h-[9px] items-center justify-between"
        style={{ top: 36 + drop }}
      >
        {/* the hairline the dots sit on — one process, not sixteen events */}
        <span className="absolute inset-x-[3px] top-1/2 h-px bg-line" />
        {SUBMISSION_STATUSES.map((rung, i) => {
          const optional = OPTIONAL.has(rung);
          const past = i < at;
          const now = i === at;
          return (
            /*
              Its own label rather than `title`.

              A native tooltip waits about a second, can't be styled, and never
              appears on touch — which made the sixteen dots effectively
              unlabelled, since the pill names only the rung you're already on.
              This one shows the instant the pointer lands.

              The dot itself stays the hover target and the label is
              `pointer-events-none`, so a tooltip can never sit between the
              cursor and the thing it describes.
            */
            <span
              key={rung}
              className={[
                // An invisible -inset-2 pad makes the hover target ~25px
                // without moving anything: the dot still lays out at its own
                // size, and the pad is a pseudo-element on top of it.
                "group relative flex-none rounded-full",
                "before:absolute before:-inset-2 before:content-['']",
                now ? "h-[9px] w-[9px] outline outline-[3px] outline-white" : "h-[7px] w-[7px]",
                now
                  ? warn
                    ? "bg-amber-600"
                    : "bg-ink"
                  : past
                    ? optional
                      ? "bg-white ring-2 ring-inset ring-band"
                      : "bg-band"
                    : "bg-white ring-1 ring-inset " + (optional ? "ring-band" : "ring-line"),
                optional && !needsTranslation ? "opacity-35" : "",
              ].join(" ")}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white group-hover:block"
              >
                {i + 1} · {RUNG_LABEL[rung]}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
