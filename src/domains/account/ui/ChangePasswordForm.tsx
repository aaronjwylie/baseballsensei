"use client";

import { useActionState } from "react";
import { Button, Field, PasswordInput, SavedBadge } from "@/shared/ui";
import { changePasswordAction } from "../api/auth";
import type { ChangePasswordState } from "../model/session";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <Field label="Current password">
        <PasswordInput
          name="current"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="New password" hint="At least 8 characters">
        <PasswordInput
          name="next"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm new password">
        <PasswordInput
          name="confirm"
          required
          autoComplete="new-password"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
        {state && "ok" in state && <SavedBadge>Password changed</SavedBadge>}
      </div>
    </form>
  );
}
