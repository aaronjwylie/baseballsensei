"use client";

import type { ReactNode } from "react";
import type { ChainState } from "../model/stageChain";

/**
 * What has happened at the rung a submission is sitting on, and what's left.
 *
 * **Split into two blocks by tense**, because they answer different questions.
 * *Completed* is the record — past voice, checked off, and there to be scanned
 * rather than read. *Next* is the only part anyone acts on, so it gets the
 * future voice and the control.
 *
 * One list did both jobs before, under a heading ("Then, in order") that
 * described neither: the done lines and the outstanding one sat in the same
 * column in the same voice, and the eye had to sort them by colour.
 *
 * The control lives **on the line it satisfies** rather than in a button bar
 * below. A bar makes you read the status, work out what it implies, then find
 * the matching button; here the thing you read and the thing you press are the
 * same thing, and they can't drift.
 */
export function StageChain({
  stage,
  control,
  lastCompleted,
}: {
  stage: ChainState[];
  /**
   * The step that got the submission to this rung.
   *
   * *Completed* lists only what has happened **on the current rung**, which is
   * deliberate — the chain is per-rung and a submission that has just arrived
   * genuinely has nothing done here yet. But "Nothing yet." on a submission
   * that is paid, assigned, translated and sent reads as though nothing has
   * ever happened (Ben, QA e2j). The rung it just reached is the one thing that
   * is certainly complete, so it stands in rather than an empty panel.
   */
  lastCompleted?: { label: string; at?: string };
  /** Rendered under the line the submission is waiting on. */
  control?: ReactNode;
}) {
  const done = stage.filter((line) => line.met);
  const outstanding = stage.find((line) => line.now);
  /*
    What follows the outstanding line, still unmet.

    Kept rather than dropped: at `assigned` the pointer can sit on "record the
    coach's languages" while the hand-off waits behind it, and a panel that
    showed only the first would make the rung look like one step of work when
    it's two.
  */
  const later = stage.filter((line) => !line.met && !line.now);
  /*
    Where the control goes. Usually the outstanding line; when nothing is
    outstanding it's the last line anyone can press, which is what keeps a rung
    whose work is done but whose status hasn't moved from being a dead end.
  */
  const handle = stage.find((line) => line.holdsControl);

  return (
    <div>
      <Heading>Completed</Heading>
      {done.length > 0 ? (
        <ol className="list-none p-0">
          {done.map((line) => (
            <li
              key={line.what}
              className="grid grid-cols-[15px_1fr] items-start gap-2 py-0.5 text-[12px] leading-snug text-ink-muted"
            >
              <span className="pt-px font-mono text-[11px] text-emerald-600">✓</span>
              <span>
                {line.what}
                <span className="ml-1.5 text-[10.5px] text-ink-muted opacity-80">
                  {line.from}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : lastCompleted ? (
        <ol className="list-none p-0">
          <li className="grid grid-cols-[15px_1fr] items-start gap-2 py-0.5 text-[12px] leading-snug text-ink-muted">
            <span className="pt-px font-mono text-[11px] text-emerald-600">✓</span>
            <span>
              {`Reached ${lastCompleted.label}`}
              {lastCompleted.at ? (
                <span className="ml-1.5 text-[10.5px] text-ink-muted opacity-80">
                  {new Date(lastCompleted.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </span>
          </li>
        </ol>
      ) : (
        <p className="text-[12px] italic text-ink-muted">Nothing yet.</p>
      )}

      <div className="mt-3">
        <Heading>Next</Heading>
        {outstanding ? (
          <div className="text-[12.5px] leading-snug text-ink">
            <span className="font-semibold">{outstanding.next}</span>
            <span className="mt-px block text-[11px] font-normal text-ink-muted">
              {outstanding.from}
              {outstanding.why ? `, ${outstanding.why}` : ""}
            </span>
            {outstanding.holdsControl && control ? (
              <div className="mt-2">{control}</div>
            ) : null}
          </div>
        ) : (
          <div>
            {/* Every line is met and the rung hasn't moved. Say so plainly, and
                still offer the handle — a reset lands here every time, and
                without the control the row can only be moved by another
                override. */}
            <p className="text-[12px] italic text-ink-muted">
              Everything here is done and the rung hasn&apos;t moved
              {handle ? `, so run “${handle.next}” again to advance it` : ""}.
            </p>
            {control ? <div className="mt-2">{control}</div> : null}
          </div>
        )}

        {later.length > 0 && (
          <ol className="mt-2 list-none p-0">
            {later.map((line) => (
              <li
                key={line.what}
                className="grid grid-cols-[15px_1fr] items-start gap-2 py-0.5 text-[11.5px] leading-snug text-ink-muted"
              >
                <span className="pt-px font-mono text-[11px] text-band">then</span>
                <span>{line.next}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
      {children}
    </div>
  );
}
