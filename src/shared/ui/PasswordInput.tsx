"use client";

import { useId, useState } from "react";
import { inputClass } from "./Field";

/**
 * A password field you can look at.
 *
 * Every password input on the site is this one component, so the reveal
 * behaves identically in all eight places rather than being reimplemented per
 * form — and so a change to how it works is one change.
 *
 * ── Why bother ──────────────────────────────────────────────────────────────
 *
 * A masked field is protection against someone reading over your shoulder, and
 * that is worth having by default. But it is also the reason people pick weaker
 * passwords they can type without error, and the reason an admin setting
 * someone else's password cannot check what they just typed before sending it
 * to them. The eye is the escape hatch: masked unless you ask, revealed when
 * the risk is yours to judge.
 *
 * ── The details that matter ─────────────────────────────────────────────────
 *
 * `type="button"` — inside a form, a button without it submits, and a reveal
 * toggle that saves the form is worse than no toggle.
 *
 * The accessible name changes with the state ("Show password" / "Hide
 * password") rather than staying a static "Toggle", because a screen-reader
 * user needs to know which way it will go, and `aria-pressed` alone does not
 * say what is pressed.
 *
 * Revealing is per field and per mount. It is never remembered — not in state
 * that outlives the form, not in storage. Someone who reveals a password on a
 * shared machine should not find it revealed again tomorrow.
 *
 * The value is never read, logged or lifted: this component only flips a `type`
 * attribute. The QA probe records that a password field was interacted with and
 * never its contents (`isSensitiveField`), and that stays true here — a click
 * on the toggle is a click on a button whose label is "Show password".
 */
export function PasswordInput({
  name,
  id,
  required,
  minLength,
  autoComplete,
  defaultValue,
  placeholder,
  className,
}: {
  name: string;
  id?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        id={fieldId}
        name={name}
        type={revealed ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
        /* Room for the button, so a long password does not run underneath it. */
        className={`${className ?? inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-pressed={revealed}
        aria-controls={fieldId}
        title={revealed ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        {revealed ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

/* `aria-hidden` on both: the button already carries the name, and an unlabelled
   graphic announced beside it would be noise. */
function Eye() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-2.6 3.6M6.2 6.2A18.5 18.5 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.2-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
