"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/shared/ui";
import { FeedbackDownloadRow } from "./FeedbackDownloadRow";

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
                  <FeedbackDownloadRow
                    key={file.id}
                    fileId={file.id}
                    filename={file.filename}
                    sizeBytes={file.sizeBytes}
                  />
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
