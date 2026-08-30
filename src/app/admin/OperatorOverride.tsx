"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { failed, succeeded, type ActionResult } from "@/shared/lib/actionResult";
import {
  SUBMISSION_STATUSES,
  numberedRungLabel,
  type SubmissionStatus,
} from "@/domains/submission/model/submission";
import { STAGE_CHAIN } from "@/domains/submission/model/stageChain";

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
  purgeAction,
  resetAction,
  deleteAction,
}: {
  submissionId: string;
  status: SubmissionStatus;
  purgeAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  resetAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  deleteAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  // Nothing may come back out of `purged` — the bytes it describes are gone, and
  // a status implying otherwise would make the queue lie about what a customer
  // can still download.
  const canReset = status !== "purged";

  const [purge, purgeSubmit, purging] = useActionState<ActionResult, FormData>(
    purgeAction,
    undefined,
  );

  useEffect(() => {
    if (succeeded(purge)) router.refresh();
  }, [purge, router]);

  const [del, delSubmit, deleting] = useActionState<ActionResult, FormData>(
    deleteAction,
    undefined,
  );

  useEffect(() => {
    // The row is gone now — refresh drops it from the queue.
    if (succeeded(del)) router.refresh();
  }, [del, router]);

  const unchanged = target === status;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        Override…
      </button>
    );
  }

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

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Override
        </h4>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-ink-muted underline underline-offset-2"
        >
          close
        </button>
      </div>

      {canReset && (
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
              ? "Pick a rung it should go back to — it is on that one now."
              : "Recorded against the submission with your name on it."}
          </p>
        </form>
      )}

      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50/60 p-3"
        action={purgeSubmit}
      >
        <input type="hidden" name="submissionId" value={submissionId} />
        <label className="text-xs text-rose-800">
          Delete now:
          <select
            name="kind"
            defaultValue="intake"
            className={`${control} ml-1.5 border-rose-200 bg-white`}
          >
            <option value="intake">Client</option>
            <option value="intake_translation">Client — translated</option>
            <option value="feedback">Coach</option>
            <option value="feedback_translation">Coach — translated</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={purging}
          className={`${controlButton} border-rose-400 text-rose-700 hover:bg-rose-100 disabled:opacity-50`}
        >
          Purge folder
        </button>
        {/* Said out loud, because this is the one control with no way back. */}
        <span className="text-xs text-rose-700">
          The bytes go. The file record stays, so the portal can still say what
          was sent.
        </span>
      </form>

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
          Delete the whole submission — record, files and trail. No way back.
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
  );
}
