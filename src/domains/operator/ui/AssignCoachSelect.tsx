"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { failed, succeeded, type ActionResult } from "@/shared/lib/actionResult";
import { assignCoachAction } from "../api/coachActions";

/**
 * The coach-assignment control on the admin queue.
 *
 * **`useActionState`, not a hand-rolled pending flag.** The previous version
 * tracked `busy` itself and threw the action's return value away — which was
 * fine while the action returned `void`, and was exactly why a refusal ("this
 * has already gone out to a coach") looked identical to a success: nothing
 * happened and nothing was said. React owns pending now, and the result is
 * rendered.
 *
 * Two things that were already right and stay right:
 *
 * 1. **Controlled, not `defaultValue`.** An uncontrolled `<select>` in a
 *    Server-Action form did not reliably carry the user's new pick across the
 *    submit re-render, so Save posted the *previous* coach id.
 * 2. **`router.refresh()` after a success.** `revalidatePath` clears the server
 *    cache, but the page keeps serving its cached RSC until a real navigation.
 *
 * **The name is not an identifier** (QA 5.9.17). The current roster is five
 * variations of "Ben", several sharing a language, so a bare name picked out a
 * set rather than a person — and which coach is chosen is what decides whether
 * the submission needs translating at all. So the option carries the coach's
 * languages, and the address the mail will reach is shown under the control for
 * whoever is selected. Mirrors `AssignTranslatorSelect`, which had the same fix:
 * the email lives under the control, not inside the option, because an option in
 * a row this wide would push Save off the edge.
 */
export function AssignCoachSelect({
  submissionId,
  assignedOperatorId,
  coaches,
}: {
  submissionId: string;
  assignedOperatorId?: string | null;
  coaches: { id: string; name: string; email: string; languages: string[] }[];
}) {
  const [coachId, setCoachId] = useState(assignedOperatorId ?? "");
  const chosen = coaches.find((c) => c.id === coachId) ?? null;
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    assignCoachAction,
    undefined,
  );
  const router = useRouter();

  useEffect(() => {
    if (succeeded(state)) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="submissionId" value={submissionId} />
        <select
          name="coachId"
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
          disabled={pending}
          className="min-w-0 max-w-[18rem] flex-1 truncate rounded-md border border-line bg-white px-2 py-1.5 text-sm disabled:opacity-60"
        >
          <option value="" disabled>
            Assign…
          </option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {/* Languages, not just the name: the roster is five near-identical
                  "Ben"s, and the coach's languages are what decide whether the
                  submission needs translating (QA 5.9.17). */}
              {`${c.name}${c.languages.length ? ` (${c.languages.join(", ")})` : ""}`}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || !coachId}
          className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-accent hover:text-ink disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {/*
        The address under the control, so the reader can tell which "Ben" this
        is (QA 5.9.17). It renders for whoever is already assigned without opening
        the dropdown — the state that would have shown a misassignment at a glance.
        Under the control rather than in the option, so a long address can't push
        Save out of reach.
      */}
      {chosen && (
        <p className="text-[12px] text-ink-muted">{chosen.email}</p>
      )}
      {failed(state) && (
        <p className="text-[13px] text-rose-700">{state.error}</p>
      )}
    </form>
  );
}
