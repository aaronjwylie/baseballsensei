"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { LocalTime } from "@/shared/ui";
import { Disclosure } from "./Disclosure";
import { StatusRail } from "@/domains/submission/ui/StatusRail";
import { StageChain } from "@/domains/submission/ui/StageChain";
import { RUNG_LABEL } from "@/domains/submission/model/submission";
import type { ChainState } from "@/domains/submission/model/stageChain";
import type { SubmissionEvent } from "@/domains/submission/api/submissionEventApi";

/**
 * One row of the queue: the rail collapsed, everything else a click away.
 *
 * **The rail replaces the status badge rather than joining it**, which is what
 * pays for the pill's height — a row carrying both is taller than one where the
 * bar carries the badge. Files, the coach control and the override all move into
 * the expanded panel, so the collapsed row lands thinner than the table it
 * replaced while saying considerably more.
 *
 * Client-side only for the open/closed state. Everything it renders is computed
 * on the server and passed in; the controls arrive as nodes because they're
 * bound to Server Actions the row knows nothing about.
 */
export function QueueRow({
  playerName,
  shortId,
  meta,
  facts,
  flag,
  rail,
  stage,
  lastCompleted,
  control,
  folders,
  details,
  events,
  override,
}: {
  playerName: string;
  /** First eight characters of the uuid — the handle people actually say. */
  shortId: string;
  /** Focus · file count · customer — the one quiet line under the name. */
  meta: string;
  /** The right-hand summary: who has it, how long it's been sitting. */
  facts: ReactNode;
  /** The thing that wants attention, if anything does. */
  flag?: string;
  rail: {
    status: Parameters<typeof StatusRail>[0]["status"];
    needsTranslation: boolean;
  };
  stage: ChainState[];
  /** The rung it reached, so `Completed` isn't blank on a busy submission. */
  lastCompleted?: { label: string; at?: string };
  control?: ReactNode;
  folders: ReactNode;
  details: ReactNode;
  events: SubmissionEvent[];
  override: ReactNode;
}) {
  const [open, setOpen] = useOpenAcrossReloads(shortId);

  /*
    The one line the submission is waiting on — a breadcrumb, not the next rung.
    A rung can be several of these away.

    **The same sentence serves both surfaces**: it closes the trail and it is
    the pill's second line. The trail is then a list of things that happened,
    each with its time, ending on the one that hasn't — and the pill is that
    ending, hoisted to where it's visible without expanding the row.

    Absent when every line of the stage is met. The submission is waiting on a
    transition rather than on a person, and both surfaces say nothing rather
    than invent a to-do.
  */
  const pending = stage.find((line) => line.now);

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[minmax(0,200px)_1fr_minmax(0,150px)_30px] items-center gap-4 px-4 py-2.5 text-left outline-ink hover:outline hover:outline-1 hover:-outline-offset-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 max-[860px]:grid-cols-[1fr_30px]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{playerName}</span>
          <span className="mt-px block truncate text-[11.5px] text-ink-muted">
            <span className="font-mono text-ink-soft">{shortId}</span>
            {meta ? ` · ${meta}` : ""}
          </span>
        </span>

        <span className="pt-0.5 max-[860px]:col-span-2">
          <StatusRail
            status={rail.status}
            needsTranslation={rail.needsTranslation}
            detail={pending ? `○ ${pending.next}` : undefined}
          />
        </span>

        <span className="text-right text-[11.5px] text-ink-muted max-[860px]:text-left">
          {facts}
          {flag ? (
            <span className="mt-px block text-[10.5px] font-semibold leading-tight text-amber-700">
              {flag}
            </span>
          ) : null}
        </span>

        <span
          aria-hidden
          className={`justify-self-end text-ink-muted transition-transform ${open ? "rotate-90 text-ink" : ""}`}
        >
          ›
        </span>
      </button>

      {open && (
        <div className="bg-paper-alt px-4 pb-5">
          <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-6 pt-4 max-[860px]:grid-cols-1">
            <div>
              <StageChain
                stage={stage}
                control={control}
                lastCompleted={lastCompleted}
              />
            </div>
            <div>
              <Label>Files: four folders</Label>
              {folders}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-6 border-t border-line pt-3 max-[860px]:grid-cols-1">
            <div>
              <Disclosure label="This submission">{details}</Disclosure>
            </div>
            <div>
              {/*
                Closed by default, like the override. An expanded row was
                showing four sections at once, and the two that are *reference*
                — the field dump and the full history — are the ones you open
                when something looks wrong, not the ones you read every time.
              */}
              <Disclosure
                label="Trail"
                hint={`${events.length} ${events.length === 1 ? "entry" : "entries"}`}
              >
                <Trail events={events} pending={pending?.next} />
              </Disclosure>
            </div>
          </div>

          {/* Its own section rather than a footnote under the details: it is the
              only thing here that changes the submission, and the only thing
              that can destroy anything. */}
          <div className="mt-4 border-t border-line pt-3">{override}</div>
        </div>
      )}
    </div>
  );
}

/**
 * How one breadcrumb reads.
 *
 * Shared by the trail and the pill's second line so the two can't drift — the
 * pill is showing the *last* row of the very list underneath it, and a reader
 * comparing them should see the same words.
 *
 * `mark` carries the outcome at a glance: two ticks for a delivery, a return
 * arrow for a bounce, a key for a code that worked.
 */
function describeEvent(e: SubmissionEvent): {
  mark: string;
  text: string;
  bad: boolean;
  good: boolean;
} {
  if (e.kind === "status") {
    return {
      mark: "→",
      text: e.status ? RUNG_LABEL[e.status] : "—",
      bad: false,
      good: false,
    };
  }
  if (e.kind === "verification") {
    return { mark: e.ok ? "🔑" : "⚠", text: e.label ?? "", bad: !e.ok, good: !!e.ok };
  }
  const mark =
    e.outcome === "delivered" ? "✓✓" : e.outcome === "bounced" ? "↩" : e.ok ? "✓" : "✗";
  return {
    mark,
    // The outcome only earns a word when it isn't the plain "we sent it" the
    // previous row already said.
    text: `${e.label ?? ""}${e.outcome && e.outcome !== "sent" ? ` ${e.outcome}` : ""}`,
    bad: e.outcome === "bounced" || e.outcome === "failed" || e.ok === false,
    good: e.outcome === "delivered",
  };
}

/**
 * Remember whether this row was open, across a reload.
 *
 * An override or an assignment reloads the page, and the row you were working
 * in used to close under you — so the way to see what you had just done was to
 * find the row again and open it again.
 *
 * **`sessionStorage`, not the URL.** The URL would make expanding a row a
 * server round-trip and put a growing list of ids in the address bar;
 * expansion is a reading posture, not a location. And not `localStorage`,
 * because a row opened last week should not still be open — the right lifetime
 * is the tab.
 *
 * `useSyncExternalStore` rather than state seeded in an effect: the server has
 * no `sessionStorage`, and `getServerSnapshot` is exactly the hook's answer to
 * that. Writes happen in the click handler, where they belong.
 */
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function useOpenAcrossReloads(key: string) {
  const storageKey = `queue:open:${key}`;
  const open = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(storageKey) === "1",
    () => false,
  );
  const setOpen = useCallback(
    (next: boolean) => {
      // Absent rather than "0": a queue of collapsed rows shouldn't leave a key
      // behind for every one of them.
      if (next) sessionStorage.setItem(storageKey, "1");
      else sessionStorage.removeItem(storageKey);
      for (const fn of listeners) fn();
    },
    [storageKey],
  );
  return [open, setOpen] as const;
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
      {children}
    </div>
  );
}

/**
 * Everything that happened, newest last.
 *
 * Status moves, sends and the customer's code attempts share one list on purpose — reading them apart makes
 * "the status says delivered but the email never went" a two-place comparison,
 * which is exactly the failure this view exists to surface. A send that didn't
 * land is the one thing here drawn in a colour.
 */
function Trail({
  events,
  pending,
}: {
  events: SubmissionEvent[];
  pending?: string;
}) {
  if (events.length === 0 && !pending) {
    return <p className="text-[11.5px] italic text-ink-muted">Nothing recorded yet.</p>;
  }
  return (
    <ol className="list-none p-0">
      {events.map((e) => (
        <li
          key={e.id}
          className="grid grid-cols-[1fr_auto] gap-3 py-0.5 text-[11.5px] text-ink-soft"
        >
          <span className="min-w-0 truncate">
            {(() => {
              const d = describeEvent(e);
              return (
                <span
                  className={
                    d.bad
                      ? "font-semibold text-rose-700"
                      : d.good
                        ? "text-emerald-700"
                        : "text-ink"
                  }
                >
                  {e.kind === "status" ? null : `${d.mark} `}
                  {d.text}
                </span>
              );
            })()}
            {e.note ? <span className="text-ink-muted">: {e.note}</span> : null}
          </span>
          <span className="tabular-nums text-ink-muted">
            <LocalTime iso={e.at} />
          </span>
        </li>
      ))}

      {/*
        The list ends on what hasn't happened.

        Everything above is past voice with a time — a thing that was satisfied.
        This is the same kind of line, one step further on, and it needs the
        future wording rather than a greyed-out version of the past one: "Payment
        cleared" dimmed still reads as an event that occurred.

        It's the outstanding *breadcrumb*, not the next rung. A rung can be
        several of these away, and "what has to happen next" is the smaller,
        more useful question.

        Absent when every line of the stage is met — the submission is then
        waiting on a transition rather than on anyone, and inventing a to-do for
        it would be a lie.
      */}
      {pending ? (
        <li className="grid grid-cols-[1fr_auto] gap-3 py-0.5 text-[11.5px] italic text-ink-muted">
          <span className="min-w-0 truncate">○ {pending}</span>
          <span className="tabular-nums">not yet</span>
        </li>
      ) : null}
    </ol>
  );
}


