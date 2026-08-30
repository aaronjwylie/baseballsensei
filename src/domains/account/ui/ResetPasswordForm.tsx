"use client";

import { useActionState } from "react";
import { Button, ButtonLink, Field, PasswordInput } from "@/shared/ui";
import {
  resetPasswordAction,
  type ResetPasswordFormState,
} from "../api/passwordResetActions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<
    ResetPasswordFormState,
    FormData
  >(resetPasswordAction, undefined);

  if (state && "done" in state) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Your password has been updated. You can sign in with it now.
        </p>
        <ButtonLink href="/login" className="w-full">
          Go to sign in
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" hint="At least 8 characters.">
        <PasswordInput
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm new password">
        <PasswordInput
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}
