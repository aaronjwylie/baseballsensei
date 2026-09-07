"use client";

import { useActionState, useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { failed, succeeded, type ActionResult } from "@/shared/lib/actionResult";
import { FileButton } from "@/shared/ui";
import {
  type FileKind,
  type SubmissionFile,
} from "@/domains/submission/model/submissionFile";
import { formatFileSize } from "@/shared/lib";
import {
  refuseFile,
  uploadFile,
  type UploadEndpoints,
  type UploadMode,
} from "@/shared/upload";

/**
 * The four folders, as the admin sees them.
 *
 * **All four take uploads and all four give them back** (Ben, 2026-08-31). The
 * two originals were read-only, on the reasoning that they are the customer's
 * and the coach's own and an admin writing to them would destroy the record of
 * what was submitted. But adding a file is not overwriting one, and the cases
 * are ordinary — an upload that failed and got emailed instead, a coach who
 * replies rather than using the portal. Refusing them just moves the work
 * outside the system. What the rule protected is kept in the trail instead:
 * writing into somebody else's folder records who did it.
 *
 * Empty folders are rendered rather than hidden. "No Japanese version yet" is
 * information the admin acts on; a folder that vanishes when empty makes its absence
 * look like a bug in the page instead of a state of the work.
 *
 * Imports the *model* directly rather than the domain barrel: this is a
 * `"use client"` file, and the barrel re-exports database code (CLAUDE.md §12).
 */

/*
  The hints name the folder's *provenance*, never a language. Two of them read
  "the Japanese version" and "the English version" until 2026-08-31, which the
  system has no way to know and which is backwards the moment the customer is
  the Japanese one — the same mistake the send radio was making (Ben).
*/
const FOLDERS: {
  kind: FileKind;
  label: string;
  hint: string;
}[] = [
  { kind: "intake", label: "Client", hint: "What the customer sent" },
  {
    kind: "intake_translation",
    label: "Client (translated)",
    hint: "The client's files, translated for the coach",
  },
  { kind: "feedback", label: "Coach", hint: "What the coach wrote back" },
  {
    kind: "feedback_translation",
    label: "Coach (translated)",
    hint: "The coach's response, translated for the client",
  },
];

export function FileFolders({
  submissionId,
  folders,
  maxFileSizeMb,
  uploadMode,
  removeAction,
}: {
  submissionId: string;
  folders: Record<FileKind, SubmissionFile[]>;
  maxFileSizeMb: number;
  uploadMode: UploadMode;
  removeAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FOLDERS.map((folder) => (
        <Folder
          key={folder.kind}
          submissionId={submissionId}
          files={folders[folder.kind] ?? []}
          maxFileSizeMb={maxFileSizeMb}
          uploadMode={uploadMode}
          removeAction={removeAction}
          {...folder}
        />
      ))}
    </div>
  );
}

/**
 * Pull every file in a folder down, one click.
 *
 * A hidden anchor per file rather than a zip: zipping means a server route that
 * streams and buffers whole videos, and the thing actually wanted here is the
 * files on disk. Staggered because browsers throttle a burst of downloads from
 * one gesture and silently drop the tail.
 */
function downloadAll(files: SubmissionFile[]) {
  files.forEach((file, i) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = `/api/files/${file.id}`;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 400);
  });
}

function Folder({
  submissionId,
  kind,
  label,
  hint,
  files,
  maxFileSizeMb,
  uploadMode,
  removeAction,
}: {
  submissionId: string;
  kind: FileKind;
  label: string;
  hint: string;
  files: SubmissionFile[];
  maxFileSizeMb: number;
  uploadMode: UploadMode;
  removeAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number } | null>(null);
  const [removeState, removeSubmit, removing] = useActionState<
    ActionResult,
    FormData
  >(removeAction, undefined);
  /** A refusal raised in the browser, before a byte moves. */
  const [preflight, setPreflight] = useState<string | null>(null);

  /*
    Straight to storage, like the other three surfaces (Ben, QA 6.6.5).

    This posted to a Server Action until 2026-09-06, so the bytes came through
    us — and a serverless request body is capped near 4.5 MB on Vercel. An admin
    could not attach a real video at all, and an oversize one blew the limit and
    got Next's own error page instead of ours. It was the last upload path still
    routed through the server.
  */
  const endpoints: UploadEndpoints = {
    blobToken: "/api/folder/blob",
    complete: "/api/folder/complete",
    // The dev proxy is told the submission and the folder; blob mode reads both
    // off the pathname instead.
    proxy: `/api/folder/upload?submission=${encodeURIComponent(submissionId)}&kind=${encodeURIComponent(kind)}`,
  };

  async function onSelect(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow re-picking the same file after a failure
    if (chosen.length === 0) return;

    setPreflight(null);
    setBusy(true);
    try {
      for (const file of chosen) {
        const refusal = refuseFile(file, maxFileSizeMb);
        if (refusal) {
          setPreflight(refusal);
          break;
        }
        setProgress({ pct: 0 });
        await uploadFile({
          mode: uploadMode,
          folder: `submissions/${submissionId}/${kind}`,
          file,
          endpoints,
          onProgress: (pct) => setProgress({ pct }),
        });
      }
      router.refresh();
    } catch (err) {
      setPreflight(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  useEffect(() => {
    if (succeeded(removeState)) router.refresh();
  }, [removeState, router]);

  // Swept files keep their row but lose their bytes, so they're listed and not
  // fetchable — counting them would promise a download that 410s.
  const downloadable = files.filter((f) => f.fileUrl);

  return (
    <section className="rounded-lg border border-line bg-paper p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </h4>
        <span className="text-[11px] text-ink-muted">
          {files.length || "empty"}
        </span>
      </header>

      {files.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {files.map((file) => (
            <li key={file.id} className="flex items-baseline gap-1.5 text-xs">
              {file.fileUrl ? (
                <a
                  href={`/api/files/${file.id}`}
                  className="min-w-0 flex-1 truncate text-accent underline underline-offset-2"
                >
                  {file.filename}
                </a>
              ) : (
                // The record outliving the bytes is deliberate — the portal can
                // still say what was sent after the retention sweep.
                <span className="min-w-0 flex-1 truncate text-ink-muted line-through">
                  {file.filename}
                </span>
              )}
              <span className="shrink-0 text-ink-muted">
                {formatFileSize(file.sizeBytes)}
              </span>
              {/*
                Per file, because a folder-wide purge is the wrong instrument
                for one wrong take (Ben, 2026-08-31) — and the admin is often
                looking at four files of which exactly one is a mistake.

                Its own form rather than a button in the folder's upload form:
                nesting forms is invalid HTML and the browser silently drops the
                inner one, so a Remove inside the upload form would have posted
                an upload.
              */}
              <form action={removeSubmit} className="shrink-0">
                <input type="hidden" name="fileId" value={file.id} />
                <button
                  type="submit"
                  disabled={removing}
                  aria-label={`Remove ${file.filename}`}
                  className="rounded px-1 py-0.5 text-[11px] font-semibold text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">{hint}</p>
      )}

      {/*
        Take everything out, or put something back — both, on every folder.
        Individual filenames stay clickable, which is how you fetch just the one
        you want, but a folder you have to click through four times to collect
        isn't a folder.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {downloadable.length > 0 && (
          <button
            type="button"
            onClick={() => downloadAll(downloadable)}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-ink hover:text-ink"
          >
            {`Download${downloadable.length > 1 ? ` all ${downloadable.length}` : ""}`}
          </button>
        )}

        {/*
          One button, not two. This was a file input and a separate Upload
          button, so choosing a file left it sitting there until you found the
          second control — and the native input announced "No file selected"
          beside it the whole time (Ben, 2026-08-31).

          Picking the files *is* the confirmation: the browser's own picker
          already has a Cancel, and it is the only dialogue in the sequence
          anyone reads. So the button opens the picker and the choice submits
          the form.
        */}
        {/*
          One button, not two. This was a file input and a separate Upload
          button, so choosing a file left it sitting there until you found the
          second control — and the native input announced "No file selected"
          beside it the whole time (Ben, 2026-08-31).

          Picking the files *is* the confirmation: the browser's own picker
          already has a Cancel, and it is the only dialogue in the sequence
          anyone reads.
        */}
        <FileButton
          label={progress ? `${progress.pct}%` : busy ? "Uploading…" : "Upload"}
          multiple
          size="sm"
          disabled={busy}
          onSelect={onSelect}
        />      </div>

      {preflight && (
        <p className="mt-1 text-[13px] text-rose-700">{preflight}</p>
      )}
      {failed(removeState) && (
        <p className="mt-1 text-[13px] text-rose-700">{removeState.error}</p>
      )}
    </section>
  );
}
