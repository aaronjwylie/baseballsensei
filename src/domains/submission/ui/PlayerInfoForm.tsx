"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, inputClass } from "@/shared/ui";
// Client-safe imports from the slice's model, not its barrel — the barrel pulls
// in Postgres-backed queries that can't ship to the browser.
import { FOCUS_OPTIONS } from "../model/submission";
import { LanguageChoiceField } from "./LanguageChoiceField";
import {
  submissionInputSchema,
  type SubmissionInput,
  type SubmissionInputDraft,
} from "../model/submissionInput";

/**
 * Step one — everything we collect before anything else happens.
 *
 * Validates with the **same schema the server re-validates with**, so the two
 * can't drift into disagreeing about what's acceptable. The server still
 * re-checks: this is a courtesy to honest operators, not a security boundary.
 *
 * It doesn't submit anything itself. The parent owns what "continue" means,
 * which is what lets one form serve both the first visit and the customer
 * coming back from step 2 to fix a typo in their email.
 */
export function PlayerInfoForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  error,
  onSubmit,
}: {
  defaultValues?: Partial<SubmissionInputDraft>;
  submitLabel: string;
  pendingLabel: string;
  error?: string | null;
  onSubmit: (values: SubmissionInput) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    // Three generics because the schema transforms: the form holds raw strings
    // (the Draft), while handleSubmit receives the parsed output.
  } = useForm<SubmissionInputDraft, unknown, SubmissionInput>({
    resolver: zodResolver(submissionInputSchema),
    // Validate on blur rather than on every keystroke — flagging an email as
    // invalid while it's still being typed is hostile.
    mode: "onBlur",
    // English unless the caller says otherwise: RHF owns the radio selection,
    // so the field itself sets no `defaultChoice`.
    defaultValues: { languages: "English", ...defaultValues },
  });

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      await onSubmit(values);
    } finally {
      setBusy(false);
    }
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Field
        label="Your email"
        hint="We'll send your verification code, receipt, and feedback here."
        error={errors.customerEmail?.message}
      >
        <input
          {...register("customerEmail")}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass}
        />
      </Field>

      <Field
        label="Player's name"
        hint="If the player is a minor, a parent or guardian should submit."
        error={errors.playerName?.message}
      >
        <input
          {...register("playerName")}
          type="text"
          placeholder="e.g. Alex Tanaka"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Player's age" optional error={errors.playerAge?.message}>
          <input
            {...register("playerAge")}
            type="text"
            inputMode="numeric"
            maxLength={2}
            placeholder="e.g. 14"
            className={inputClass}
          />
        </Field>

        <Field label="Focus" optional error={errors.focus?.message}>
          <select {...register("focus")} defaultValue="" className={inputClass}>
            <option value="">Not sure / general</option>
            {FOCUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/*
        Half of the translation rule, asked with the same component and the same
        three options the coach form uses — a shared vocabulary is what lets the
        two halves intersect at all.
      */}
      <LanguageChoiceField
        label="What language should your feedback be in?"
        hint="Choose Both if either works. If your coach doesn't share one, we'll have the review translated."
        error={errors.languages?.message}
        inputProps={register("languages")}
      />

      <Field
        label="Notes for your coach"
        optional
        hint="Optional — a specific issue, a recent change, a goal."
        error={errors.customerNotes?.message}
      >
        <textarea
          {...register("customerNotes")}
          rows={3}
          placeholder="Example: I’m having trouble making consistent contact and feel like I’m late on faster pitches. What should I work on?"
          className={`${inputClass} resize-none`}
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
