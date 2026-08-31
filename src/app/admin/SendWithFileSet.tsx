"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { failed, succeeded, type ActionResult } from "@/shared/lib/actionResult";
import type { FileSet } from "@/domains/submission/model/submissionFile";

/**
 * What each set *is* — never what language it is in.
 *
 * These read "English" / "Japanese" until 2026-08-31, and that was wrong in
 * both directions at once (Ben). `original` is whatever the customer uploaded,
 * which is Japanese whenever the customer is; the coach's own response is
 * Japanese far more often than not, and step 13's radio called it "English".
 * One map, two hand-offs, wrong at both.
 *
 * The deeper problem is that **we do not know what language any file is in.**
 * Nothing records it — that is the gap tracked as "record the file's language
 * at upload" — so a language on this label was always an inference dressed as a
 * fact, and the one place it mattered most: the admin choosing what to send is
 * exactly the person who would act on it.
 *
 * So the labels name the set by its provenance, which we do know for certain
 * because it is the folder the file is in. Per side, because "the originals"
 * means the customer's at step 8 and the coach's at step 13.
 */
const LABELS: Record<"intake" | "feedback", Record<FileSet, string>> = {
  intake: {
    original: "The client's originals",
    translation: "The translation",
    both: "Both",
  },
  feedback: {
    original: "The coach's response",
    translation: "The translation",
    both: "Both",
  },
};

/**
 * A send button that first asks *which language set* to send.
 *
 * Used at both hand-offs — step 8 to the coach, step 13 to the customer —
 * because they're the same decision pointed at different people. One component
 * rather than two, so the two can't drift into different wordings or different
 * defaults for the same question.
 *
 * **The control disappears when there's nothing to choose.** Most submissions
 * have no translation, and a radio with one option is a question that wastes the
 * reader's attention on a decision they don't have. `sets` comes from
 * `availableSets`, which only returns more than one entry when both an original
 * and a translation actually exist.
 *
 * **The action's result is rendered, not swallowed.** This hand-rolled its own
 * submit and threw the return value away, which was invisible while actions
 * returned `void` and was exactly how "there are no files in that set to send"
 * came out as nothing happening at all.
 *
 * Client-side so it can `router.refresh()` after the action: `revalidatePath`
 * alone left the page serving its cached RSC, so the row wouldn't move until a
 * manual reload.
 */
export function SendWithFileSet({
  action,
  submissionId,
  sets,
  side,
  label,
  className,
}: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  submissionId: string;
  sets: FileSet[];
  /** Which hand-off this is — it decides whose "originals" these are. */
  side: "intake" | "feedback";
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState<ActionResult, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (succeeded(state)) router.refresh();
  }, [state, router]);
  // Default to the first offered set — `availableSets` returns them in the
  // order original · translation · both, so the originals win when both exist.
  const [fileSet, setFileSet] = useState<FileSet>(sets[0] ?? "original");

  if (sets.length === 0) return null;

  return (
    <form
      className="flex flex-col items-start gap-2"
      action={submit}
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="fileSet" value={fileSet} />

      {sets.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">Which files to send</legend>
          {sets.map((option) => (
            <label
              key={option}
              className="flex items-center gap-1.5 text-xs text-ink-muted"
            >
              <input
                type="radio"
                name="fileSetChoice"
                value={option}
                checked={fileSet === option}
                onChange={() => setFileSet(option)}
                className="h-3.5 w-3.5"
              />
              {LABELS[side][option]}
            </label>
          ))}
        </fieldset>
      )}

      <button type="submit" disabled={pending} className={className}>
        {pending ? "Sending…" : label}
      </button>
      {failed(state) && (
        <p className="max-w-xs text-[13px] text-rose-700">{state.error}</p>
      )}
    </form>
  );
}
