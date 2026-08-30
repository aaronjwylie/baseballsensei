"use client";

import { useActionState } from "react";
import { Button, Field, PasswordInput, SavedBadge, inputClass } from "@/shared/ui";
import { updateOperatorIdentityAction } from "../api/operatorProfileActions";
import type { OperatorProfileFormState } from "../api/operatorProfileActions";
import type { OperatorProfile } from "../model/operatorProfile";

/**
 * Who someone is, independent of what they do.
 *
 * Name, email and password are true of the person whichever roles they hold, so
 * they sit outside the three role cards. Putting them inside any one of them
 * would make that card claim a scope it does not have — and would beg the
 * question of what happens to a name when the role is removed.
 *
 * Split out of `OperatorProfileForm` on 2026-08-30. That form was one component
 * covering identity *and* every role's settings, deciding between them with
 * `holds("coach")`-style conditionals in four places. The settings moved to the
 * role cards; this is what was genuinely shared, and it needs no conditionals
 * at all.
 */
export function OperatorIdentityForm({
  operatorId,
  existing,
}: {
  operatorId: string;
  existing: OperatorProfile;
}) {
  const [state, action, pending] = useActionState<
    OperatorProfileFormState,
    FormData
  >(updateOperatorIdentityAction, undefined);

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {state.error}
        </p>
      )}

      <input type="hidden" name="operatorId" value={operatorId} />

      <Field label="Name">
        <input
          name="name"
          defaultValue={existing.name}
          required
          className={inputClass}
        />
      </Field>

      <Field label="Email" hint="Their login">
        <input
          name="email"
          type="email"
          defaultValue={existing.email}
          required
          className={inputClass}
        />
      </Field>

      <Field
        label="New password"
        hint="Leave blank to keep the current one. An admin setting this needs no current password — the admin's authority is the guard."
      >
        <PasswordInput name="password" autoComplete="new-password" />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save sign-in"}
        </Button>
        {state && "ok" in state && <SavedBadge>Saved</SavedBadge>}
      </div>
    </form>
  );
}
