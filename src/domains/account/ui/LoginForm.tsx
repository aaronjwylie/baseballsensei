"use client";
/**
 * Operator sign-in form. Posts to the `login` server action via
 * `useActionState`, showing a single form-level error (we don't tell an
 * attacker which of email/password was wrong).
 */
import { useActionState } from "react";
import { login } from "../api/auth";
import type { LoginState } from "../model/session";
import { Button, Field, PasswordInput, inputClass } from "@/shared/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </Field>

      <Field label="Password">
        <PasswordInput
          name="password"
          required
          autoComplete="current-password"
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
