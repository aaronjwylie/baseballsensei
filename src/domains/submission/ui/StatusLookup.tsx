"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, inputClass } from "@/shared/ui";
// A client component imports the slice's own client-safe model directly, not
// the barrel — the barrel re-exports submissionApi (Postgres), which can't be
// bundled for the browser.
import { lookupSchema, type LookupInput } from "../model/submissionInput";
import type { PublicSubmission } from "../model/publicSubmission";
import { StatusList } from "./StatusList";

type Result =
  | { state: "idle" }
  | { state: "codeSent"; email: string }
  | { state: "error"; message: string }
  | { state: "loaded"; email: string; submissions: PublicSubmission[] };

/**
 * Status lookup by email — **and a code, because typing an address proves
 * nothing.**
 *
 * The two doors into this page are deliberately asymmetric:
 *
 * - **The link in a receipt goes straight in.** It was mailed to an address that
 *   verified itself at step 2 and paid at step 4, so holding it is stronger
 *   evidence than anything a form could ask for afterwards.
 * - **A typed address gets a code.** Anyone can type anyone's email, and the
 *   list carries a child's name, a focus and a date. That is not catastrophic to
 *   leak, but it is somebody's child, and it costs one email to stop.
 *
 * The same code then covers the downloads — one act of proof, one grant.
 */
export function StatusLookup() {
  const [result, setResult] = useState<Result>({ state: "idle" });
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LookupInput, unknown, { customerEmail: string }>({
    resolver: zodResolver(lookupSchema),
    mode: "onBlur",
  });

  const onSubmit = handleSubmit(async ({ customerEmail }) => {
    try {
      const res = await fetch("/api/status/feedback/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setResult({
          state: "error",
          message: json.error ?? "Something went wrong.",
        });
        return;
      }

      /*
        Always "we've sent a code", even for an address we've never seen.

        The route answers ok either way, on purpose: a different message for a
        known address turns this form into a way to test whether someone is a
        customer. The cost is that a mistyped address looks like a slow email,
        which is why the panel says so.
      */
      // A fresh code means a fresh field — clear anything typed against the last
      // one, so requesting a new code never shows a stale entry (Ben, QA 3.1).
      setCode("");
      setResult({ state: "codeSent", email: customerEmail });
    } catch {
      setResult({ state: "error", message: "Network error. Please try again." });
    }
  });

  async function submitCode() {
    if (result.state !== "codeSent") return;
    setChecking(true);
    try {
      const res = await fetch("/api/status/feedback/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail: result.email, code }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        submissions?: PublicSubmission[];
        error?: string;
      };
      if (!res.ok) {
        setResult({
          state: "error",
          message: json.error ?? "That code didn't match.",
        });
        return;
      }
      setResult({
        state: "loaded",
        email: result.email,
        submissions: json.submissions ?? [],
      });
    } catch {
      setResult({ state: "error", message: "Network error. Please try again." });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6 sm:flex-row sm:items-start"
        noValidate
      >
        <div className="flex-1">
          <Field label="Email address" error={errors.customerEmail?.message}>
            <input
              {...register("customerEmail")}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full shrink-0 sm:mt-7 sm:w-[13rem]"
        >
          {isSubmitting ? "Sending…" : "Email me a code"}
        </Button>
      </form>

      <div className="mt-6">
        {result.state === "error" && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {result.message}
          </p>
        )}

        {result.state === "codeSent" && (
          <div className="rounded-2xl border border-line bg-white p-6">
            <p className="text-ink">
              If <span className="font-medium">{result.email}</span> has
              submissions with us, a 6-digit code is on its way.
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">
              Check your spam folder if it hasn&rsquo;t arrived.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Same two columns as the email row above — a flex-1 field and a
                  fixed-width button — so the input edges and the buttons line up
                  down the card (Ben, QA 3.1). */}
              <div className="flex-1">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  aria-label="6-digit code"
                  className={`${inputClass} tracking-[0.3em]`}
                />
              </div>
              <Button
                type="button"
                disabled={checking || code.length !== 6}
                onClick={submitCode}
                className="w-full shrink-0 sm:w-[13rem]"
              >
                {checking ? "Checking…" : "See my submissions"}
              </Button>
            </div>
          </div>
        )}

        {result.state === "loaded" && (
          <StatusList
            submissions={result.submissions}
            email={result.email}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Customer-facing labels for each status.
 *
 * "New" and "Assigned" are queue states that exist for the admin, not the customer —
 * telling a parent their video is "unassigned" is alarming and not actionable.
 * They collapse into honest, calm language about where the submission actually is.
 */
