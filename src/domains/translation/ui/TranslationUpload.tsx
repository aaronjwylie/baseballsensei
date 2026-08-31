"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, FileButton } from "@/shared/ui";
import { failed, succeeded } from "@/shared/lib/actionResult";
import {
  uploadFile,
  type UploadEndpoints,
  type UploadMode,
} from "@/shared/upload";
// A client component imports the slice's client-safe model directly, not the
// barrel — the barrel re-exports Postgres code that can't reach the browser.
import { formatFileSize } from "@/domains/submission/model/submissionFile";
import {
  handBackTranslationAction,
  removeTranslationFileAction,
} from "../api/translationActions";
import type { TranslationKind } from "../model/translationLeg";

/** What the translator has handed over so far — the shape the routes echo back. */
interface TranslationFile {
  id: string;
  filename: string;
  sizeBytes: number;
}

/**
 * A translator uploads one or more files for a leg, then hands the leg back.
 *
 * The mirror of `FeedbackUpload`, and it differs in exactly one way: every
 * request carries the **leg**. A coach writes to one folder and never has to
 * say which; a translator writes to either, so the kind rides in the pathname
 * (prod) and the query string (dev) and is re-checked against the assignment on
 * the server both times.
 *
 * Files upload one at a time so a failure names the file it happened on, and
 * the transport is the customer's own `uploadFile` — direct-to-Blob in prod,
 * proxied to disk in dev — so a translator's video isn't capped by the
 * serverless body limit either.
 */
export function TranslationUpload({
  submissionId,
  produces,
  uploadMode,
  existingFiles,
  handBackLabel,
  hint,
}: {
  submissionId: string;
  produces: TranslationKind;
  uploadMode: UploadMode;
  existingFiles: TranslationFile[];
  handBackLabel: string;
  hint: string;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<TranslationFile[]>(existingFiles);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const endpoints: UploadEndpoints = {
    blobToken: "/api/translation/blob",
    complete: "/api/translation/complete",
    // The dev proxy is told the submission and the leg; blob mode reads both
    // from the pathname instead.
    proxy: `/api/translation/upload?submission=${encodeURIComponent(submissionId)}&kind=${encodeURIComponent(produces)}`,
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
          folder: `submissions/${submissionId}/${produces}`,
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
    const result = await removeTranslationFileAction(fileId);
    setRemoving(null);
    if (!succeeded(result)) {
      setError(failed(result) ? result.error : "Couldn't remove that file.");
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    router.refresh();
  }

  async function handBack() {
    setBusy(true);
    setError(null);
    const result = await handBackTranslationAction(submissionId, produces);
    setBusy(false);
    if (!succeeded(result)) {
      setError(failed(result) ? result.error : "Couldn't hand it back.");
      return;
    }
    setSent(true);
    router.refresh();
  }

  if (sent) {
    return (
      <p className="text-sm font-semibold text-purple-600">Handed back ✓</p>
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
                similarly-named files — which file this button belongs to, so
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
          {`Uploading ${progress.name}… ${progress.pct}%`}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <FileButton
          label="Choose files"
          multiple
          disabled={busy}
          onSelect={onSelect}
        />
        {/* `whitespace-nowrap` so the label can never break across two lines
            when the row gets tight — "Hand back" wrapping to "Hand" over
            "back" doubled the button's height (Ben, 2026-08-31). */}
        <Button
          type="button"
          disabled={busy || files.length === 0}
          onClick={handBack}
          className="shrink-0 whitespace-nowrap"
        >
          {busy ? "Working…" : handBackLabel}
        </Button>
      </div>

      {/* What the button sets in motion, so it isn't a leap of faith — the
          translator is handing work to someone they can't see. */}
      <p className="text-xs text-ink-muted">{hint}</p>

      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
