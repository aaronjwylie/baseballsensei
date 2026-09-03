"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { failed, succeeded, type ActionResult } from "@/shared/lib/actionResult";
import {
  SUBMISSION_STATUSES,
  isReleased,
  numberedRungLabel,
  type SubmissionStatus,
} from "@/domains/submission/model/submission";
import { STAGE_CHAIN } from "@/domains/submission/model/stageChain";
import { Disclosure } from "./Disclosure";

/**
 * The operator override — put a submission back, or delete a folder now.
 *
 * The pipeline runs forward on its own; this is the handle for when it
 * shouldn't. Deliberately **one general handle rather than per-stage undo
 * buttons**: eleven specific affordances are eleven things nobody remembers
 * exist, and the case that actually arrives is never quite the one that was
 * anticipated.
 *
 * **Two boxes, ordered by how bad the mistake is.** Moving a status back is
 * recoverable — move it forward again. Deleting files is not, so it sits below
 * in its own red frame rather than beside the thing people came here to do.
 *
 * Imports the *model* directly rather than the domain barrel — this is a
 * `"use client"` file and the barrel re-exports database code.
 */
export function OperatorOverride({
  submissionId,
  status,
  paid = true,
  archiveAction,
  resetAction,
  deleteAction,
}: {
  submissionId: string;
  status: SubmissionStatus;
  /**
   * Unpaid submissions get **delete, and nothing else** (Ben, 2026-09-03).
   *
   * The whole panel was withheld before payment, so a scratch pad that stalled
   * had no controls at all: the admin could see it sitting in the queue and had
   * no way to remove it, and the only thing that would was a nightly sweep they
   * had to wait for.
   *
   * The other three genuinely do not apply, which is why they are hidden rather
   * than shown disabled. Reset refuses pre-payment rungs by its own guard, since
   * the sweep deletes anything sitting there. Archive files finished work out of
   * the queue, and an unpaid scratch pad is not finished work. Purging one
   * folder of a submission that is about to be deleted whole is the long way
   * round.
   */
  paid?: boolean;
  archiveAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  resetAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  deleteAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  // Type-to-confirm for the outright delete — the button stays dead until it
  // reads exactly DELETE, so it can't be the thing a stray click lands on.
  const [confirm, setConfirm] = useState("");
  /*
    Starts on the current rung so the dropdown reads as "where it is", and the
    button below is disabled until that changes. Previously it started here too
    and the button was live — so the most likely thing anyone did was press it
    unchanged, which hit a silent guard and looked like a broken button.
  */
  const [target, setTarget] = useState<SubmissionStatus>(status);
  const [reset, resetSubmit, resetting] = useActionState<ActionResult, FormData>(
    resetAction,
    undefined,
  );

  useEffect(() => {
    if (succeeded(reset)) router.refresh();
  }, [reset, router]);

  // Archiving a live submission sets aside a paid customer still owed feedback —
  // it needs a reason and a warning; archiving finished work is bookkeeping and
  // needs neither (Ben, QA 5.6).
  const owed = !isReleased({ status });
  const [archiveReason, setArchiveReason] = useState("");
  const [archive, archiveSubmit, archiving] = useActionState<
    ActionResult,
    FormData
  >(archiveAction, undefined);

  useEffect(() => {
    if (succeeded(archive)) router.refresh();
  }, [archive, router]);

  // Nothing may come back out of `purged` — the bytes it describes are gone, and
  // a status implying otherwise would make the queue lie about what a customer
  // can still download.
  const canReset = status !== "purged";


  const [del, delSubmit, deleting] = useActionState<ActionResult, FormData>(
    deleteAction,
    undefined,
  );

  useEffect(() => {
    // The row is gone now — refresh drops it from the queue.
    if (succeeded(del)) router.refresh();
  }, [del, router]);

  const unchanged = target === status;

  /*
    One size for every control in the override — selects, inputs and buttons
    alike — so the panel reads as one system rather than three stacked at
    different scales (Ben, QA 5.7). An explicit height, because a native
    `<select>` sizes itself differently from an input off the same padding;
    pinning it is the only way they line up. Colour still carries severity
    (neutral reset, rose purge, filled-red delete) — only the height and the text
    size are shared. Buttons add `inline-flex` to centre their label in that
    fixed height.
  */
  const control = "h-8 rounded-md border px-2 text-xs";
  const controlButton = `${control} inline-flex items-center justify-center font-semibold`;

  /*
    The same disclosure the other two sections use (Ben, 2026-09-03).

    This had its own toggle — an "Override…" link that swapped for a heading and
    a "close" link — so the third panel in a row of three announced itself
    differently from its neighbours and read as a different kind of control
    rather than the third of a set.

    `Disclosure`'s own comment said this one hand-rolled its state "because it
    also owns forms and pending flags". That was never the reason it had to:
    `open` was only ever driving the toggle, and `<details>` holds forms
    perfectly well. Losing it takes a `useState` with it.
  */
  return (
    <Disclosure label="Override">
      <div className="space-y-3">

      {/* Reset, archive and purge are all paid-only — see `paid` above for why
          each of the three has nothing to say about a scratch pad. */}
      {paid && canReset && (
        <form
          className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3"
          action={resetSubmit}
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-muted">
              Move back to:
              <select
                name="status"
                value={target}
                onChange={(e) => setTarget(e.target.value as SubmissionStatus)}
                className={`${control} ml-1.5 border-line bg-white`}
              >
                {SUBMISSION_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {numberedRungLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            {/*
              **The to-do voice, not the past one.** Resetting *to* a substep
              says it hasn't happened yet — "resume at the hand-off", not "the
              hand-off is done" — so the list reads the way `Next` does, and the
              note it leaves reads as an instruction rather than a claim.

              Still **recorded, not enforced**: only the rung is stored, because
              a chain line is derived from the data and has no column to set.
              The northstar is that a reset actually resumes the pipeline from
              the start of the chosen substep *(not built)*.
            */}
            <label className="text-xs text-ink-muted">
              at:
              <select
                name="substep"
                key={target}
                className={`${control} ml-1.5 border-line bg-white`}
              >
                <option value="">the start of the step</option>
                {STAGE_CHAIN[target].map((line) => (
                  <option key={line.what} value={line.next}>
                    {line.next}
                  </option>
                ))}
              </select>
            </label>

            {/*
              Inline with the two selects — it is one sentence ("move back to X
              at Y, because Z"), and splitting it across two rows read as two
              separate controls.
            */}
            <input
              name="reason"
              placeholder="why (optional)"
              className={`${control} w-44 border-line bg-white`}
            />
            <button
              type="submit"
              disabled={resetting || unchanged}
              title={unchanged ? "Pick a different rung first" : undefined}
              className={`${controlButton} border-line bg-white text-ink hover:border-ink disabled:opacity-50`}
            >
              {resetting ? "Resetting…" : "Reset status"}
            </button>
          </div>

          {failed(reset) && (
            <p className="text-xs text-rose-700">{reset.error}</p>
          )}
          {succeeded(reset) && (
            <p className="text-xs text-emerald-700">Moved back.</p>
          )}
          <p className="text-xs text-ink-muted">
            {unchanged
              ? "Pick a rung it should go back to. It is on that one now."
              : "Recorded against the submission with your name on it."}
          </p>
        </form>
      )}

      {paid && (
      <>
      {/*
        Archive — out of the queue, not gone. Available at any rung now (QA 5.6):
        the things that can never reach `complete` — a duplicate, a test entry, a
        cancelled or refunded customer — needed a way off the working surface. A
        live one is set aside with feedback still owed, so it asks for a reason
        and says what it is doing; a finished one is plain bookkeeping.
      */}
      <form
        className={`space-y-2 rounded-lg border p-3 ${
          owed ? "border-amber-300 bg-amber-50/40" : "border-line bg-paper-alt/40"
        }`}
        action={archiveSubmit}
      >
        <input type="hidden" name="submissionId" value={submissionId} />
        <div className="flex flex-wrap items-end gap-2">
          <span className="text-xs text-ink-muted">
            {owed
              ? "Archive, set aside, feedback still owed:"
              : "Archive, file out of the queue:"}
          </span>
          <input
            name="reason"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            placeholder={owed ? "why (required)" : "why (optional)"}
            className={`${control} w-44 border-line bg-white`}
          />
          <button
            type="submit"
            disabled={archiving || (owed && archiveReason.trim() === "")}
            title={
              owed && archiveReason.trim() === ""
                ? "A live submission needs a reason"
                : undefined
            }
            className={`${controlButton} border-line bg-white text-ink hover:border-ink disabled:opacity-50`}
          >
            {archiving ? "Archiving…" : "Archive"}
          </button>
        </div>
        {failed(archive) && <p className="text-xs text-rose-700">{archive.error}</p>}
        {succeeded(archive) && <p className="text-xs text-emerald-700">Archived.</p>}
        {owed && (
          <p className="text-xs text-amber-700">
            This hides an open obligation: a paid customer is still waiting. It is
            recorded with your name and reason, flagged in the Archived view, and
            its files are still purged on the normal clock.
          </p>
        )}
      </form>

      {/*
        "Purge folder" lived here until 2026-09-03. The folders take a per-file
        Remove now, so clearing one is a few clicks in the place you are already
        looking at the files, rather than a dropdown in a panel that names them
        again (Ben).

        Worth recording what went with it, since the two are not the same act: a
        purge dropped the bytes and **kept the file rows**, so the portal could
        still say what had been sent, while Remove deletes the row too. Nothing
        else offers drop-the-bytes-keep-the-record on demand — only the nightly
        retention sweep does, which is where it genuinely belongs. If an admin
        ever needs it by hand again, it is a control, not a capability that has
        to be rebuilt.
      */}
      </>
      )}

      {!paid && (
        <p className="text-xs text-ink-muted">
          Nothing has been paid for yet, so there is nothing to reset, archive or
          keep. The nightly sweep removes it once it has sat unpaid for the
          retention window — this is the same thing, now.
        </p>
      )}

      {/*
        More final than the purge above, so it sits below it and behind a
        type-to-confirm: this takes the record too — the row, its files and its
        whole trail — leaving nothing for the portal to remember. For scrubbing a
        test entry or honouring a delete-my-data request (Ben, QA 3.5).
      */}
      <form
        className="space-y-2 rounded-lg border-2 border-rose-500 bg-rose-100/60 p-3"
        action={delSubmit}
      >
        <input type="hidden" name="submissionId" value={submissionId} />
        <p className="text-xs font-semibold text-rose-800">
          Delete the whole submission: record, files and trail. No way back.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type DELETE"
            aria-label="Type DELETE to confirm"
            autoComplete="off"
            className={`${control} w-32 border-rose-300 bg-white tracking-[0.15em] text-rose-900 placeholder:tracking-normal`}
          />
          <button
            type="submit"
            disabled={deleting || confirm !== "DELETE"}
            className={`${controlButton} border-rose-500 bg-rose-600 text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {deleting ? "Deleting…" : "Delete submission"}
          </button>
        </div>
        {failed(del) && <p className="text-xs text-rose-700">{del.error}</p>}
      </form>
      </div>
    </Disclosure>
  );
}
