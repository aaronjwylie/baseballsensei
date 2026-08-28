import type { ComponentProps } from "react";
import { Field } from "@/shared/ui";
import { LANGUAGE_CHOICES, type LanguageChoice } from "../model/submission";

/**
 * Which languages someone reads — asked identically of the customer and the coach.
 *
 * One component for both sides, because they feed one rule: a question asked
 * two different ways invites two different vocabularies, and the halves of an
 * intersection have to be spelled the same to ever meet.
 *
 * Radios rather than the free entry this replaces. Text and checkboxes can both
 * end up empty, and empty is the one input `needsTranslation` can't answer — it
 * returns `null` and the queue reports a missing declaration instead of routing.
 * With radios that isn't a validation error to handle; it's a state that can't
 * be reached.
 *
 * No state of its own, so a server component can render it. The two forms drive
 * it differently: the coach forms are plain `<form action>` and set
 * `defaultChoice`, while the customer's is React Hook Form and passes
 * `register()` through `inputProps`, keeping its default in `useForm` where RHF
 * expects it.
 */
export function LanguageChoiceField({
  label,
  hint,
  defaultChoice,
  error,
  inputProps,
}: {
  label: string;
  hint?: string;
  /** Omit under React Hook Form — its `defaultValues` owns the selection. */
  defaultChoice?: LanguageChoice;
  error?: string;
  inputProps?: ComponentProps<"input">;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="flex flex-wrap gap-4 pt-1.5 pb-2">
        {LANGUAGE_CHOICES.map((choice) => (
          <label
            key={choice}
            className="flex items-center gap-1.5 text-sm text-[color:var(--field-label,var(--color-ink))]"
          >
            <input
              type="radio"
              name="languages"
              value={choice}
              {...inputProps}
              {...(defaultChoice ? { defaultChecked: choice === defaultChoice } : {})}
              className="h-4 w-4"
            />
            {/* "both" is lowercase in the data because it isn't a language. */}
            {choice === "both" ? "Both" : choice}
          </label>
        ))}
      </div>
    </Field>
  );
}
