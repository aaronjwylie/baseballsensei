"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { failed, succeeded, type ActionResult } from "@/shared/lib/actionResult";
import {
  formatFileSize,
  type FileKind,
  type SubmissionFile,
} from "@/domains/submission/model/submissionFile";

/**
 * The four folders, as the admin sees them.
 *
 * `intake` and `response` are read-only — they're the customer's and the coach's
 * own uploads, and the record of what was actually submitted. The two
 * translation folders take uploads, which is steps 6–7 and 11–12: download the
 * originals, translate off-platform, put the result back.
 *
 * Empty folders are rendered rather than hidden. "No Japanese version yet" is
 * information the admin acts on; a folder that vanishes when empty makes its absence
 * look like a bug in the page instead of a state of the work.
 *
 * Imports the *model* directly rather than the domain barrel: this is a
 * `"use client"` file, and the barrel re-exports database code (CLAUDE.md §12).
 */

const FOLDERS: {
  kind: FileKind;
  label: string;
  hint: string;
  writable: boolean;
}[] = [
  {
    kind: "intake",
    label: "Client",
    hint: "What the customer sent",
    writable: false,
  },
  {
    kind: "intake_translation",
    label: "Client (translated)",
    hint: "Upload the Japanese version for the coach",
    writable: true,
  },
  {
    kind: "feedback",
    label: "Coach",
    hint: "What the coach wrote back",
    writable: false,
  },
  {
    kind: "feedback_translation",
    label: "Coach (translated)",
    hint: "Upload the English version for the customer",
    writable: true,
  },
];

export function FileFolders({
  submissionId,
  folders,
  uploadAction,
}: {
  submissionId: string;
  folders: Record<FileKind, SubmissionFile[]>;
  uploadAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FOLDERS.map((folder) => (
        <Folder
          key={folder.kind}
          submissionId={submissionId}
          files={folders[folder.kind] ?? []}
          uploadAction={uploadAction}
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
  writable,
  files,
  uploadAction,
}: {
  submissionId: string;
  kind: FileKind;
  label: string;
  hint: string;
  writable: boolean;
  files: SubmissionFile[];
  uploadAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [state, submit, busy] = useActionState<ActionResult, FormData>(
    uploadAction,
    undefined,
  );

  useEffect(() => {
    if (succeeded(state)) router.refresh();
  }, [state, router]);

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
            <li key={file.id} className="text-xs">
              {file.fileUrl ? (
                <a
                  href={`/api/files/${file.id}`}
                  className="text-accent underline underline-offset-2"
                >
                  {file.filename}
                </a>
              ) : (
                // The record outliving the bytes is deliberate — the portal can
                // still say what was sent after the retention sweep.
                <span className="text-ink-muted line-through">
                  {file.filename}
                </span>
              )}
              <span className="ml-1.5 text-ink-muted">
                {formatFileSize(file.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">{hint}</p>
      )}

      {/*
        One button per folder, and only the one that folder is for: take
        everything out, or put something back. Individual filenames stay
        clickable — that's how you fetch just the one you want — but a folder
        you have to click through four times to collect isn't a folder.
      */}
      {downloadable.length > 0 && (
        <button
          type="button"
          onClick={() => downloadAll(downloadable)}
          className="mt-3 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
        >
          Download {downloadable.length > 1 ? `all ${downloadable.length}` : ""}
        </button>
      )}

      {writable && (
        <form
          className="mt-3"
          action={submit}
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="kind" value={kind} />
          <input
            type="file"
            name="files"
            multiple
            disabled={busy}
            className="block w-full text-[11px] text-ink-muted file:mr-2 file:rounded file:border file:border-line file:bg-white file:px-2 file:py-1 file:text-[11px] file:font-semibold"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
          {failed(state) && (
            <p className="mt-1 text-[13px] text-rose-700">{state.error}</p>
          )}
        </form>
      )}
    </section>
  );
}
