"use client";

import * as Select from "@radix-ui/react-select";
import { inputClass } from "./Field";

/**
 * A dropdown that looks like {@link inputClass} but is **not** a native
 * `<select>`.
 *
 * The native control's option popup is drawn by the OS, and Chrome and Safari on
 * macOS position it detached from the field — floating hundreds of pixels away —
 * whenever an ancestor establishes a containing/stacking context, which the
 * checkout's photographic ground does. No CSS reaches an OS-drawn popup, so the
 * options here are real DOM, portalled to `document.body` (clear of every
 * ancestor) and positioned by Radix. That is the whole reason this exists rather
 * than a styled `<select>` (QA 2.1.5).
 *
 * The trigger reuses `inputClass`, so it sits at the same height as the text
 * inputs beside it and inherits the dark-wrapper field colours; the chevron is
 * drawn rather than the OS one.
 *
 * Controlled only — Radix Select owns no form value, so the caller wires it to
 * React Hook Form with a `Controller`. Radix forbids an empty-string item value,
 * so a caller whose "none" option is `""` maps it to a sentinel on the way in
 * and back out.
 */
export function FieldSelect({
  value,
  onValueChange,
  items,
  ariaLabel,
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string }[];
  /** The field's label, for the trigger's accessible name. */
  ariaLabel?: string;
  id?: string;
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className={`${inputClass} flex items-center justify-between gap-2 text-left`}
      >
        <Select.Value />
        <Select.Icon>
          <ChevronDown />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-white text-ink shadow-lg"
        >
          <Select.Viewport className="p-1">
            {items.map((item) => (
              <Select.Item
                key={item.value}
                value={item.value}
                className="relative flex cursor-pointer select-none items-center rounded-md py-2 pl-3 pr-8 text-sm text-ink outline-none data-[highlighted]:bg-paper-alt data-[state=checked]:font-medium"
              >
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-2.5 inline-flex">
                  <Check />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function ChevronDown() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-ink-muted"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-accent"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
