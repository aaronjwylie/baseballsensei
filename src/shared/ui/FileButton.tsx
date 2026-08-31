"use client";

import type { ChangeEvent } from "react";

/**
 * A button that opens the file picker — and nothing else.
 *
 * ── Why not style the native input ──────────────────────────────────────────
 *
 * A bare `<input type="file">` renders two things: the browser's "Choose file"
 * button and, beside it, a readout that says "No file selected". Only the
 * button is reachable from CSS (through the `file:` variant), and the readout
 * cannot be removed at all — so styling the input in place always leaves that
 * sentence sitting next to it (Ben, 2026-08-31).
 *
 * In the upload panels the readout is worse than redundant: files upload the
 * instant they are chosen and appear in the list directly above, so the input
 * permanently reads "No file selected" *while the files sit visibly above it*.
 * It is not neutral chrome, it contradicts the page.
 *
 * So the input is visually hidden and a `<label>` wrapping it becomes the
 * button. The label is the standard way to do this: clicking it activates the
 * input without any JavaScript, and the input keeps its accessible role rather
 * than being replaced by a `<div>` pretending to be a control.
 *
 * **The operator photo field deliberately does not use this.** There the
 * filename beside the button is the only confirmation anything was chosen —
 * nothing lists it afterwards — so that one keeps the native readout, which is
 * the call made in QA 5.13.6.9.
 *
 * ── The details that matter ─────────────────────────────────────────────────
 *
 * `sr-only`, not `display:none` or `hidden` — a hidden input is not focusable,
 * which would put the control out of reach of the keyboard entirely. This keeps
 * it in the tab order and `focus-within` draws the ring on the label, so
 * focus is visible even though the input is not.
 *
 * `disabled` is set on the input *and* reflected on the label, because a label
 * has no disabled state of its own: without `pointer-events-none` a click
 * during an upload would still open the picker.
 */
export function FileButton({
  label,
  multiple = false,
  disabled = false,
  accept,
  onSelect,
}: {
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  accept?: string;
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      className={`inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-accent/40 ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
    >
      {label}
      <input
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
    </label>
  );
}
