"use client";

import { useState, type ReactNode } from "react";
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
  | {
      state: "loaded";
      email: string;
      submissions: PublicSubmission[];
      /*
        Kept, not discarded (Ben, 2026-08-31). `verifyFeedbackViewCode` returns
        the list *and* the downloads under one grant — "one code, one grant: the
        customer's whole view". This dropped the second half and let a separate
        panel ask for a fresh code to fetch what the server had already sent.
      */
      groups: DownloadGroup[];
    };

/*
  The shape of `FeedbackGroup`, declared rather than imported.

  Only the file half is structural now: `PublicSubmission` lives in this slice,
  so it can be named outright, and the security-vetted projection is the same
  object on both sides of the boundary rather than two descriptions of it.

  `domains/feedback` imports this slice, so importing it back would close a
  cycle the structure check refuses — and the rendering genuinely belongs over
  there, which is why it arrives as `renderDownloads` instead. This lookup only
  needs to carry the value across, so it describes it rather than owning it.
*/
export interface DownloadGroup {
  submission: PublicSubmission;
  files: { id: string; filename: string; sizeBytes: number }[];
}

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
export function StatusLookup({
  renderDownloads,
}: {
  /**
   * How to render the downloads that came back with the list.
   *
   * A prop rather than an import: the component that draws them lives in
   * `domains/feedback`, which already depends on this slice. Supplied by a
   * client parent over there, so the function crosses a client-to-client
   * boundary rather than a server one.
   */
  renderDownloads?: (groups: DownloadGroup[]) => ReactNode;
} = {}) {
  const [result, setResult] = useState<Result>({ state: "idle" });
  const [code, setCode] = useState("");
  // A wrong code stays on the code card and shows here, with the tries left —
  // switching to the error state used to hide the card, so a single miss ended
  // the attempt instead of counting down like the flow's email step (Ben, QA 3.2).
  const [codeError, setCodeError] = useState<string | null>(null);
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
      setCodeError(null);
      setResult({ state: "codeSent", email: customerEmail });
    } catch {
      setResult({ state: "error", message: "Network error. Please try again." });
    }
  });

  async function submitCode() {
    if (result.state !== "codeSent") return;
    setChecking(true);
    setCodeError(null);
    try {
      const res = await fetch("/api/status/feedback/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail: result.email, code }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        submissions?: PublicSubmission[];
        groups?: DownloadGroup[];
        error?: string;
      };
      if (!res.ok) {
        // Stay on the code card and show the miss inline — the route allows five
        // tries and its message carries the count left. Clear the field for the
        // next attempt (Ben, QA 3.2).
        setCodeError(json.error ?? "That code didn't match.");
        setCode("");
        return;
      }
      setResult({
        state: "loaded",
        email: result.email,
        submissions: json.submissions ?? [],
        groups: json.groups ?? [],
      });
    } catch {
      // A network blip is a retry too — keep them on the card.
      setCodeError("Network error. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      {/*
        The form goes away once they are in (Ben, 2026-09-03).

        It rendered unconditionally, so "Email me a code" sat above the page it
        had just unlocked — offering to send a code to someone already reading
        the thing the code was for. Worse than clutter: codes are single-use, so
        the most prominent control on the page was one that would mail them a
        second code they had no use for.

        Replaced by a quiet way to look up a different address, which is the
        only reason anyone would still want the form here.
      */}
      {result.state === "loaded" ? (
        <p className="text-sm text-ink-muted">
          {`Showing everything sent from ${result.email}. `}
          <button
            type="button"
            onClick={() => {
              setResult({ state: "idle" });
              setCode("");
              setCodeError(null);
            }}
            className="font-medium text-accent underline underline-offset-2 hover:text-ink"
          >
            Use a different email
          </button>
        </p>
      ) : (
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
      )}

      <div className="mt-6">
        {result.state === "error" && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {result.message}
          </p>
        )}

        {result.state === "codeSent" && (
          <div className="rounded-2xl border border-line bg-white p-6">
            <p className="text-ink">
              If <span className="font-medium">{result.email}</span>{" "}
              has submissions with us, a 6-digit code is on its way. Enter
              it below.
            </p>
            {/*
              Deliberately ambiguous — no submissions, a typo, and slow mail all
              read the same here (Ben, QA 3.5). Telling a no-submission address
              "nothing for you" would turn this form into a way to check whether
              any email is a customer, which is the enumeration the "send a code
              either way" design exists to prevent. So it explains why a code
              might not come without confirming which reason it is.
            */}
            <p className="mt-1.5 text-sm text-ink-muted">
              Nothing after a few minutes? This email may have no submissions, or
              it may be mistyped. Check your spam folder, then try a
              different address above.
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
            {codeError && (
              <p className="mt-3 text-sm text-rose-700">{codeError}</p>
            )}
          </div>
        )}

        {result.state === "loaded" && (
          <StatusList
            submissions={result.submissions}
            email={result.email}
            feedbackAccess={renderDownloads?.(result.groups)}
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
