import type { ReactNode } from "react";

/** Shared input styling — one home for what a text input looks like. */
export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/30";

/**
 * A labelled form field.
 *
 * The label wraps the control so it's clickable without needing matching ids.
 * When `error` is set it replaces the hint rather than stacking beneath it —
 * two lines of small text under one input is noise, and the error is the more
 * urgent of the two.
 *
 * **The three text colours are variables, not fixed tokens.** The checkout flow
 * and the contact form put these fields on a dark photograph, where `text-ink`
 * is invisible; every other use is on paper, where it is correct. A `tone` prop
 * would have to be threaded through `PlayerInfoForm`, `VerifyPanel`,
 * `UploadPanel` and `PaymentPanel` — four components that have no opinion about
 * the colour — so instead a dark wrapper sets `--field-label`, `--field-hint`
 * and `--field-error` once and every field inside inherits them. The fallbacks
 * are the paper values, so nothing that exists today changes.
 */
export function Field({
  label,
  hint,
  optional,
  error,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-[color:var(--field-label,var(--color-ink))]">
        {label}
        {optional && (
          <span className="text-xs font-normal text-[color:var(--field-hint,var(--color-ink-muted))]">
            (optional)
          </span>
        )}
      </span>
      {children}
      {error ? (
        // role="alert" so a screen reader announces it when it appears, rather
        // than the user finding it only on a re-read of the whole form.
        <span
          role="alert"
          className="mt-1.5 block text-xs text-[color:var(--field-error,var(--color-rose-600,#e11d48))]"
        >
          {error}
        </span>
      ) : (
        hint && (
          <span className="mt-1.5 block text-xs text-[color:var(--field-hint,var(--color-ink-muted))]">
            {hint}
          </span>
        )
      )}
    </label>
  );
}
