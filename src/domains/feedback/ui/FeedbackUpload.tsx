"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, FileButton } from "@/shared/ui";
import {
  uploadFile,
  type UploadEndpoints,
  type UploadMode,
} from "@/shared/upload";
// A client component imports the slice's client-safe model directly, not the
// barrel — the barrel re-exports Postgres code that can't reach the browser.
import { formatFileSize } from "@/domains/submission/model/submissionFile";
import {
  removeFeedbackFileAction,
  sendFeedbackForApprovalAction,
} from "../api/feedbackActions";

/** What the coach has attached so far — the same shape the routes echo back. */
interface FeedbackFile {
  id: string;
  filename: string;
  sizeBytes: number;
}

/**
 * A coach attaches one or more feedback files to a submission, then hands the set
 * to the admin for approval.
 *
 * Uploads reuse the customer's transport (`uploadFile`) with the operator-gated
 * feedback endpoints — direct-to-Blob in prod, proxied to disk in dev — so a
 * coach's video isn't capped by the serverless body limit either. Files upload
 * one at a time so a failure names the file it happened on.
 */
export function FeedbackUpload({
  submissionId,
  uploadMode,
  existingFiles,
}: {
  submissionId: string;
  uploadMode: UploadMode;
  existingFiles: FeedbackFile[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<FeedbackFile[]>(existingFiles);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const endpoints: UploadEndpoints = {
    blobToken: "/api/feedback/blob",
    complete: "/api/feedback/complete",
    // The dev proxy needs to know which submission; blob mode reads it from the
    // pathname instead.
    proxy: `/api/feedback/upload?submission=${encodeURIComponent(submissionId)}`,
  };

  async function onSelect(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow re-picking the same file after a failure
    if (chosen.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      for (const file of chosen) {
        setProgress({ name: file.name, pct: 0 });
        const uploaded = await uploadFile({
          mode: uploadMode,
          folder: `submissions/${submissionId}/feedback`,
          file,
          endpoints,
          onProgress: (pct) => setProgress({ name: file.name, pct }),
        });
        setFiles((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove(fileId: string) {
    setRemoving(fileId);
    setError(null);
    const result = await removeFeedbackFileAction(fileId);
    setRemoving(null);
    if (!result.ok) {
      setError(result.error ?? "Couldn't remove that file.");
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    router.refresh();
  }

  async function send() {
    setBusy(true);
    setError(null);
    const result = await sendFeedbackForApprovalAction(submissionId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't send for approval.");
      return;
    }
    setSent(true);
    router.refresh();
  }

  if (sent) {
    return (
      <p className="text-sm font-semibold text-purple-600">
        Sent for approval ✓
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-ink">
                {file.filename}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {formatFileSize(file.sizeBytes)}
              </span>
              {/*
                Named "Remove", not an unlabelled ✕. The word is what tells a
                screen reader — and anyone who has just uploaded three
                similarly-named takes — which file this button belongs to, so
                the accessible name carries the filename too.

                No confirm step: the file is still on their own machine, so the
                cost of a mistaken click is one re-upload. A dialogue guarding
                that would be asked more often than it saved anyone.
              */}
              <button
                type="button"
                onClick={() => void remove(file.id)}
                disabled={busy || removing !== null}
                aria-label={`Remove ${file.filename}`}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
              >
                {removing === file.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {progress && (
        <div className="text-xs text-ink-muted">
          Uploading {progress.name}… {progress.pct}%
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <FileButton
          label={progress ? "Uploading…" : "Upload"}
          multiple
          disabled={busy}
          onSelect={onSelect}
        />
        <Button
          type="button"
          disabled={busy || files.length === 0}
          onClick={send}
          className="shrink-0 whitespace-nowrap sm:ml-auto"
        >
          {busy && !progress ? "Sending…" : "Send for approval"}
        </Button>
      </div>

      {/* What the button sets in motion, so it isn't a leap of faith — the coach
          is handing work to someone they can't see. The translator's card has
          carried this since it was built; the coach's had not. */}
      <p className="text-xs text-ink-muted">
        The admin reviews it and releases it to the customer.
      </p>

      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
