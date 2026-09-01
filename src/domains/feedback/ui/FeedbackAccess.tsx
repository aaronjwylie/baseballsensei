"use client";

import { useState } from "react";
import { Button, Field, buttonClasses, inputClass } from "@/shared/ui";
import { formatFileSize } from "@/domains/submission/model/submissionFile";

interface FeedbackGroup {
  playerName: string;
  files: { id: string; filename: string; sizeBytes?: number }[];
}

type State =
  | { step: "idle" }
  | { step: "sending" }
  | { step: "codeSent" }
  | { step: "verifying" }
  | { step: "done"; groups: FeedbackGroup[] };

/**
 * The status-page route to feedback, for a customer who lost the emailed link.
 *
 * Entering an email on `/status` proves nothing — anyone could type it — so the
 * files stay behind a code sent to that inbox. Enter email → get a code → read
 * it back → download. Same guarantee as the emailed link: you must control the
 * inbox.
 */
export function FeedbackAccess({ email }: { email: string }) {
  const [state, setState] = useState<State>({ step: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setState({ step: "sending" });
    setError(null);
    try {
      const res = await fetch("/api/status/feedback/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail: email }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Something went wrong.");
        setState({ step: "idle" });
        return;
      }
      setState({ step: "codeSent" });
    } catch {
      setError("Network error. Please try again.");
      setState({ step: "idle" });
    }
  }

  async function verify() {
    setState({ step: "verifying" });
    setError(null);
    try {
      const res = await fetch("/api/status/feedback/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail: email, code }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        groups?: FeedbackGroup[];
        error?: string;
      };
      if (!res.ok || !json.groups) {
        setError(json.error ?? "That code didn't match.");
        setState({ step: "codeSent" });
        return;
      }
      setState({ step: "done", groups: json.groups });
    } catch {
      setError("Network error. Please try again.");
      setState({ step: "codeSent" });
    }
  }

  if (state.step === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
        <h3 className="font-semibold text-ink">Your feedback</h3>
        <div className="mt-4 space-y-4">
          {state.groups.map((group, i) => (
            <div key={i}>
              <div className="text-sm font-medium text-ink">
                {group.playerName}
              </div>
              <ul className="mt-2 space-y-2">
                {group.files.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">
                      {file.filename}
                      {file.sizeBytes ? (
                        <span className="ml-2 text-xs text-ink-muted">
                          {formatFileSize(file.sizeBytes)}
                        </span>
                      ) : null}
                    </span>
                    {/*
                      Same tab, deliberately. `target="_blank"` opened a window
                      that flashed and closed itself on every download (Ben,
                      2026-08-31) — the tab had nothing to show, because the
                      route answers with `Content-Disposition: attachment` and
                      the browser downloads rather than navigating.

                      That header is why dropping it is safe: both storage
                      drivers stream through this route, so the response is
                      always an attachment and the status page is never
                      navigated away from.

                      **A plain `<a>`, not `ButtonLink`.** That wraps
                      `next/link`, which intercepts internal hrefs for
                      client-side navigation and was skipping this one *only*
                      because `target` was set. Dropping the target without
                      dropping the Link would have handed `/api/feedback/[id]`
                      to the router as if it were a page. The sibling
                      `SubmissionFileList` uses a bare anchor for the same
                      reason.
                    */}
                    <a
                      href={`/api/feedback/${file.id}`}
                      download={file.filename}
                      className={buttonClasses("primary", "md")}
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <h3 className="font-semibold text-ink">Download your feedback</h3>
      <p className="mt-1 text-sm text-ink-muted">
        For your privacy, we&apos;ll email a 6-digit code to{" "}
        <span className="font-medium text-ink">{email}</span>{" "}to confirm
        it&apos;s you.
      </p>

      {state.step === "idle" || state.step === "sending" ? (
        <div className="mt-4">
          <Button
            type="button"
            onClick={requestCode}
            disabled={state.step === "sending"}
          >
            {state.step === "sending" ? "Sending…" : "Email me a code"}
          </Button>
        </div>
      ) : (
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <div className="flex-1">
            <Field label="6-digit code">
              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className={inputClass}
              />
            </Field>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={code.length !== 6 || state.step === "verifying"}
            className="shrink-0 sm:mt-7"
          >
            {state.step === "verifying" ? "Checking…" : "View feedback"}
          </Button>
        </form>
      )}

      {state.step === "codeSent" && !error && (
        <p className="mt-3 text-sm text-emerald-700">
          We emailed a code to {email}. It expires in 10 minutes.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
