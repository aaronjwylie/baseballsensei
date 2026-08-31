"use client";

import { useActionState, useState } from "react";
import { Button } from "@/shared/ui";
import { deleteOperatorAction } from "../api/operatorProfileActions";
import type { OperatorProfileFormState } from "../api/operatorProfileActions";

/**
 * The one irreversible operator action, behind a deliberate second step.
 *
 * Revoking a role or pausing an account is reversible and lives on the cards
 * above; this wipes the person from the platform, so it asks once before it
 * does — a plain button that turns into "yes, delete <name>" plus a way out,
 * rather than firing on the first click. The refusals it can hit (the last
 * admin, your own account) come back from the action as text.
 */
export function DeleteOperatorButton({
  operatorId,
  name,
}: {
  operatorId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState<
    OperatorProfileFormState,
    FormData
  >(deleteOperatorAction, undefined);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action}>
      <input type="hidden" name="operatorId" value={operatorId} />

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Deleting…" : `Yes, delete ${name}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="danger"
          onClick={() => setConfirming(true)}
        >
          Delete operator
        </Button>
      )}

      {state && "error" in state && (
        <p role="alert" className="mt-2 text-[13px] text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
