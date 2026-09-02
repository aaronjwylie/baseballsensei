"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, FieldSelect, inputClass } from "@/shared/ui";
// Client-safe imports from the slice's model, not its barrel — the barrel pulls
// in Postgres-backed queries that can't ship to the browser.
import { FOCUS_OPTIONS } from "../model/submission";
import { LanguageChoiceField } from "./LanguageChoiceField";
import {
  submissionInputSchema,
  type SubmissionInput,
  type SubmissionInputDraft,
} from "../model/submissionInput";

// Radix Select rejects an empty-string item value, but the schema's "not sure"
// state is exactly "". The general option carries this sentinel inside the
// widget and is mapped back to "" at the form boundary.
const FOCUS_GENERAL = "general";
const FOCUS_ITEMS = [
  { value: FOCUS_GENERAL, label: "Not sure / general" },
  ...FOCUS_OPTIONS.map((option) => ({ value: option, label: option })),
];

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
    control,
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
          <Controller
            name="focus"
            control={control}
            render={({ field }) => (
              <FieldSelect
                ariaLabel="Focus"
                items={FOCUS_ITEMS}
                // The schema's "none" state is "", which Radix won't accept as an
                // item value, so the general option rides a sentinel and is
                // mapped back to "" at the form boundary.
                value={field.value ? field.value : FOCUS_GENERAL}
                onValueChange={(next) =>
                  field.onChange(next === FOCUS_GENERAL ? "" : next)
                }
              />
            )}
          />
        </Field>
      </div>

      {/*
        Half of the translation rule, asked with the same component and the same
        three options the coach form uses — a shared vocabulary is what lets the
        two halves intersect at all.

        **It asks what they understand, not what they want back** (Ben,
        2026-08-31). It read "What language should your feedback be in?", which
        described a delivery format this field does not control — and made
        "Both" a promise of two versions. Nobody was ever going to receive two.

        "Understand" rather than "speak" or "read": the review is a coach
        talking over video, so reading is too narrow, and someone can understand
        a language they would not claim to speak. It is also the word the admin
        panel already uses on both halves of this same rule, so all three
        surfaces now ask one question in one vocabulary — which is exactly what
        `LanguageChoiceField` exists to protect and was not getting.
      */}
      <LanguageChoiceField
        label="What language do you understand?"
        hint="Choose Both if either works for you. You'll get one review either way; this just tells us whether your coach needs a translator."
        error={errors.languages?.message}
        inputProps={register("languages")}
      />

      <Field
        label="Notes for your coach"
        hint="Tell your coach what to look at: a specific issue, a recent change, a goal."
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
