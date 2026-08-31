"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/shared/ui";
import {
  requestResetAction,
  type RequestResetState,
} from "../api/passwordResetActions";

export function RequestResetForm() {
  const [state, action, pending] = useActionState<RequestResetState, FormData>(
    requestResetAction,
    undefined,
  );

  if (state && "sent" in state) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        If that email has an operator account, a reset link is on its way. It
        works for one hour. Check your inbox (and spam).
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      )}
      <Field label="Email address">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
