import type { ReactNode } from "react";

/** Shared input styling — one home for what a text input looks like. */
export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/30";

/**
 * Shared `<select>` styling — a text input's twin, but sized by an explicit
 * height rather than vertical padding.
 *
 * A native select does not honour `py-*` the way a text input does — WebKit in
 * particular lays the control out to its own intrinsic height and the padding
 * barely moves it, so a select wearing `inputClass` came out visibly thinner
 * than the inputs beside it (Ben, QA 5.13.4). A fixed height is the one thing
 * every engine renders the same, so this pins it to the input's 42px (`py-2.5`
 * + `text-sm` + border) and the two finally line up. The native menu and arrow
 * are kept — only the box height is taken into our own hands.
 */
export const selectClass =
  "w-full rounded-lg border border-line bg-white px-3.5 h-[2.625rem] text-sm text-ink shadow-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30";

/**
 * Shared `<input type="file">` styling — specifically, the browser's own
 * "Choose file" button inside it.
 *
 * That button is a shadow-DOM control reachable only through the `file:`
 * variant, which means it inherits nothing and has to be styled deliberately.
 * Left alone it renders with no hover and no pointer cursor, and a button that
 * doesn't respond to the mouse reads as **broken** rather than plain — which is
 * exactly how it read in the translator portal (Ben, 2026-08-31).
 *
 * So the three things that make a button feel like one: `file:cursor-pointer`,
 * a `hover:file:` colour change, and `file:transition-colors` so the change is
 * a response rather than a flicker.
 *
 * One home because there are three file inputs — the coach's, the translator's
 * and the operator photo — and they had already drifted into three different
 * treatments, only one of which had ever been fixed.
 */
export const fileInputClass =
  "block w-full text-sm text-ink-muted file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-xs file:font-semibold file:text-surface file:transition-colors hover:file:bg-accent focus-visible:outline-none";

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
