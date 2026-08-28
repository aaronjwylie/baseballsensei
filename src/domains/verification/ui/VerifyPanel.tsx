"use client";

import { useEffect, useRef, useState } from "react";
import { Button, inputClass } from "@/shared/ui";
// The model, not the barrel: the barrel reaches the database.
import { CODE_LENGTH, CODE_TTL_MINUTES } from "../model/verification";

/**
 * Step two — the customer proves they can read the address they typed.
 *
 * The flow pauses here by design. Everything after this point costs us
 * something: storage for their files, and then a charge. Verification is the
 * cheapest possible check that the address is real, and it's also the address
 * the feedback has to arrive at, so getting it wrong is the one mistake a
 * customer can't fix on their own afterwards.
 *
 * The parent owns the verbs; this owns the input.
 */
/**
 * How long to wait before asking whether the code bounced.
 *
 * Bounces observed at ~2s. Five gives the webhook room without leaving someone
 * staring at a dead form, and lands while they're still opening their mail app.
 */
const DELIVERY_CHECK_MS = 5000;

export function VerifyPanel({
  email,
  onVerify,
  onResend,
  onCheckDelivery,
  onBack,
}: {
  email: string;
  onVerify: (
    code: string,
  ) => Promise<{ error: string; locked?: boolean } | null>;
  onResend: () => Promise<string | null>;
  /** Asked once, a few seconds in, in case the address bounced. */
  onCheckDelivery?: () => Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  // Out of guesses. The input is retired until a fresh code resets the count.
  const [locked, setLocked] = useState(false);

  /*
    A single delayed look for a bounce.

    Not a poll: a bounce arrives about two seconds after the send, so one check
    a few seconds in catches it while the customer is still switching to their
    mail app. Cleared on unmount so a customer who moves on isn't yanked back by
    a timer that outlived the step.
  */
  useEffect(() => {
    if (!onCheckDelivery) return;
    const timer = setTimeout(() => {
      void onCheckDelivery();
    }, DELIVERY_CHECK_MS);
    return () => clearTimeout(timer);
  }, [onCheckDelivery]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const ready = code.length === CODE_LENGTH;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy || locked) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    // A failed verify returns the sentence to show (and whether the guesses are
    // spent); success returns null and the parent has already moved us on.
    const result = await onVerify(code);
    if (result) {
      setError(result.error);
      setCode("");
      if (result.locked) setLocked(true);
      else inputRef.current?.focus();
    }
    setBusy(false);
  }

  async function resend() {
    setResending(true);
    setError(null);
    setNotice(null);

    const message = await onResend();
    if (message) setError(message);
    else {
      setNotice("We've sent a new code.");
      // A new code resets the attempt count on the server, so the input comes
      // back to life.
      setLocked(false);
    }

    setResending(false);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/*
        Just the specifics the heading above doesn't carry — the address it went
        to and how long it lasts. The heading already says a code was sent and to
        enter it below; repeating that here was the doubling (QA 2.2.1). White,
        not the muted ink that vanished against the dark panel.

        The space before "minutes" is explicit. Written as plain JSX text it gets
        swallowed: this text node contains an HTML entity, which sends it down a
        whitespace-collapsing path in the compiler that strips the leading space,
        and it shipped once as "expires in 10minutes".
      */}
      <p className="text-sm text-[color:var(--field-label,var(--color-ink))]">
        Sent to <strong>{email}</strong>. It expires in {CODE_TTL_MINUTES}{" "}
        minutes &mdash; check your spam folder if it hasn&rsquo;t arrived.
      </p>

      <div>
        <label htmlFor="verification-code" className="sr-only">
          Verification code
        </label>
        <input
          id="verification-code"
          ref={inputRef}
          value={code}
          // Strip non-digits as they type: pasting from a mail client routinely
          // brings a trailing space or a stray character with it.
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
          }
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          aria-invalid={!!error}
          disabled={locked}
          className={`${inputClass} text-center text-2xl font-semibold tracking-[0.4em] disabled:cursor-not-allowed disabled:opacity-50`}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={!ready || busy || locked}
        className="w-full"
      >
        {busy ? "Checking…" : "Verify and continue"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="text-[color:var(--field-label,var(--color-ink))] underline transition-opacity hover:opacity-70 disabled:opacity-50"
        >
          Wrong email? Go back
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={resending || busy}
          className="text-[color:var(--field-label,var(--color-ink))] underline transition-opacity hover:opacity-70 disabled:opacity-50"
        >
          {resending ? "Sending…" : "Send a new code"}
        </button>
      </div>
    </form>
  );
}
