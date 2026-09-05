"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Button, Field, inputClass } from "@/shared/ui";
// Client-safe import from the slice's model, not its barrel — the barrel
// re-exports the server action's module graph, which can't ship to the browser.
import {
  contactInputSchema,
  HONEYPOT_FIELD,
  type ContactInput,
} from "../model/contactInput";

/**
 * The contact form, on the dark ground the design puts it on.
 *
 * Validates with the **same schema the action re-validates with**, so the two
 * can't drift into disagreeing about what's acceptable. The server still
 * re-checks: this is a courtesy to honest visitors, not a security boundary.
 *
 * **The success state replaces the form rather than sitting above it.** There
 * is nothing useful to do with the fields once the message is gone, and leaving
 * a filled form under a "sent!" banner invites a second identical send.
 *
 * The honeypot is positioned off-screen rather than `display: none` — some
 * bots skip hidden inputs specifically — and is marked `aria-hidden` with
 * `tabIndex={-1}` so no keyboard or screen-reader user can reach it by accident.
 */
export function ContactForm({
  onSubmit,
}: {
  onSubmit: (values: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactInputSchema),
    defaultValues: { firstName: "", lastName: "", email: "", message: "" },
  });

  if (sent) {
    return (
      <div className="mx-auto max-w-[465px] text-center">
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-highlight text-2xl text-accent"
        >
          ✓
        </div>
        <h2 className="mt-6 font-display text-[26px] font-medium uppercase tracking-[-0.01em] text-highlight">
          Message sent
        </h2>
        <p className="mt-3 text-[15px] leading-[1.5] text-paper">
          Thanks. A person will read it and reply to the address you gave us.
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (values) => {
        setError(null);
        const result = await onSubmit(values);
        if (result.ok) {
          setSent(true);
          return;
        }
        setError(result.error ?? "Something went wrong. Please try again.");
      })}
      className="mx-auto flex max-w-[465px] flex-col gap-5 [--field-error:var(--color-highlight)] [--field-hint:var(--color-band)] [--field-label:var(--color-paper)]"
    >
      <Field label="First Name" error={errors.firstName?.message}>
        <input
          {...register("firstName")}
          autoComplete="given-name"
          placeholder="Enter your first name"
          className={inputClass}
        />
      </Field>

      <Field label="Last Name" error={errors.lastName?.message}>
        <input
          {...register("lastName")}
          autoComplete="family-name"
          placeholder="Enter your last name"
          className={inputClass}
        />
      </Field>

      <Field label="Email" error={errors.email?.message}>
        <input
          {...register("email")}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          className={inputClass}
        />
      </Field>

      <Field label="Message" error={errors.message?.message}>
        <textarea
          {...register("message")}
          rows={7}
          placeholder="Leave us a message..."
          className={`${inputClass} resize-y`}
        />
      </Field>

      <input
        {...register(HONEYPOT_FIELD as keyof ContactInput)}
        type="text"
        tabIndex={-1}
        aria-hidden
        autoComplete="off"
        className="absolute left-[-9999px] h-px w-px opacity-0"
      />

      <label className="flex items-start justify-center gap-3 text-[11px] text-paper">
        <input
          {...register("consent")}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        />
        <span>
          You agree to our friendly{" "}
          <Link href="/privacy" className="text-highlight underline underline-offset-2">
            privacy policy
          </Link>
          .
        </span>
      </label>
      {errors.consent && (
        <p role="alert" className="text-center text-xs text-highlight">
          {errors.consent.message}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="border-2 border-highlight px-4 py-3 text-center text-sm text-paper"
        >
          {error}
        </p>
      )}

      <div className="flex justify-center">
        <Button type="submit" variant="primaryLime" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send message"}{" "}
          <span aria-hidden>→</span>
        </Button>
      </div>
    </form>
  );
}
