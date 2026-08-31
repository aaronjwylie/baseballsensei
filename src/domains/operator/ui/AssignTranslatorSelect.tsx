"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { failed, succeeded, type ActionResult } from "@/shared/lib/actionResult";
// The model directly, not the domain barrel — this is a `"use client"` file and
// the barrel re-exports database code.
import {
  coversDirection,
  describeDirection,
  type Direction,
} from "@/domains/submission/model/submission";
import { directionsOf } from "../model/operatorProfile";
import { assignTranslatorAction } from "../api/translatorActions";

/**
 * The translator-assignment control on the admin queue.
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
 */
export function AssignTranslatorSelect({
  submissionId,
  leg,
  direction,
  assignedOperatorId,
  translators,
}: {
  submissionId: string;
  leg: "intake_translation" | "feedback_translation";
  /**
   * The way this leg must run — passed, not derived from `leg`, so the component
   * never has to know which leg means which direction (QA 5.9). Only translators
   * who cover it are offered; a wrong-way pick makes a file nobody can read.
   */
  direction: Direction | null;
  assignedOperatorId?: string | null;
  translators: { id: string; name: string; email: string; languages: string[] }[];
}) {
  const [operatorId, setOperatorId] = useState(assignedOperatorId ?? "");
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    assignTranslatorAction,
    undefined,
  );
  const router = useRouter();

  useEffect(() => {
    if (succeeded(state)) router.refresh();
  }, [state, router]);

  // Eligibility is a capability test, not a name match: a translator may take
  // this leg iff their covered directions include it (QA 5.9.9). "both
  // directions" covers it too, by carrying both pairs.
  const eligible = direction
    ? translators.filter((t) => coversDirection(directionsOf(t.languages), direction))
    : translators;

  // A filtered list can be empty — one paused grant away (QA 5.9.12). Say which
  // direction is unstaffed rather than showing an empty select beside a dead
  // Save; the sentence names the leg to go staff, or the grant to un-pause.
  if (direction && eligible.length === 0) {
    return (
      <p className="text-[13px] text-amber-700">
        No active translator covers {describeDirection(direction)}.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input type="hidden" name="submissionId" value={submissionId} />
        <input type="hidden" name="leg" value={leg} />
        <select
          name="operatorId"
          value={operatorId}
          onChange={(e) => setOperatorId(e.target.value)}
          disabled={pending}
          className="rounded-md border border-line bg-white px-2 py-1.5 text-sm disabled:opacity-60"
        >
          {/* Disabled and unselected on purpose — an admin picks a person, they
              don't confirm a default, even when the filtered list is one long. */}
          <option value="" disabled>
            Pick a translator…
          </option>
          {eligible.map((t) => (
            <option key={t.id} value={t.id}>
              {/* Every option covers the leg now, so its direction reads as a
                  confirmation the filter did its job, not a warning.

                  The address is here because the direction alone does not
                  identify anyone (Ben, QA 5.9.17). Five translators on the
                  current roster are all called some variation of "Ben" and
                  three of them share one direction, so name-plus-direction
                  still picked out a set rather than a person — which is how a
                  hand-off went to the wrong inbox. This control's entire
                  effect is to send mail to that address, so it is the one fact
                  that makes an option unambiguous. */}
              {`${t.name}${t.languages[0] ? ` (${t.languages[0]})` : ""} — ${t.email}`}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || !operatorId}
          className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-accent hover:text-ink disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {failed(state) && (
        <p className="text-[13px] text-rose-700">{state.error}</p>
      )}
    </form>
  );
}
