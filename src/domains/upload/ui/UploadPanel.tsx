"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/shared/ui";
// Models, not barrels — both of these slices reach the database from theirs.
import { formatFileSize } from "@/domains/submission/model/submissionFile";
import {
  ACCEPT_ATTRIBUTE,
  describeAllowedTypes,
  isAllowedFilename,
} from "../model/fileTypes";
import { uploadFile, type UploadMode, type UploadedFile } from "@/shared/upload";

/**
 * Step three — the customer's files.
 *
 * **One dropzone, always present, does every add.** It was a chain of cards —
 * an empty card that turned into an upload, then a separate "+" that spawned the
 * next empty card — which meant adding a second file took two clicks on two
 * elements. Now a single dropzone (click or drag) starts each upload and stays
 * put for the next, up to the limit.
 *
 * A file is checked for type and size **before** a byte is sent, so a wrong type
 * or an oversized file is refused on the spot rather than after a full upload.
 * Every entry — uploading, uploaded, refused — shares one height so the column
 * doesn't jump as a file moves between them.
 *
 * The server re-checks type, size, and count on every single upload; nothing
 * here is a security boundary.
 */

type CardState =
  | { status: "uploading"; file: File; progress: number }
  | { status: "done"; uploaded: UploadedFile }
  | { status: "error"; file: File; message: string; retriable: boolean };

interface Card {
  key: string;
  state: CardState;
}

/** One row of a server action that reports success or a reason. */
type RemoveResult = { ok: true } | { ok: false; error: string };

/*
  One height for every entry and the dropzone, so a file completing or being
  refused doesn't resize its row and shove the rest of the page (QA 2.3.9.1). It
  clears the tallest state — an upload in progress, which carries a name, a
  progress bar, and a caption.
*/
const ENTRY = "flex min-h-[100px] w-full flex-col justify-center";

let cardSeq = 0;
function nextKey(): string {
  cardSeq += 1;
  return `card-${cardSeq}`;
}

/** A person-facing reason an upload didn't finish — including our own guards. */
function describeUploadFailure(signal: AbortSignal, err: unknown): string {
  // We aborted it ourselves (there's no user-facing cancel in this flow).
  if (signal.aborted) {
    const reason = signal.reason;
    if (reason instanceof DOMException && reason.name === "TimeoutError") {
      return "The upload stalled and didn't finish. Check your connection and try again.";
    }
    return "The upload kept restarting and couldn't complete — usually a setup issue on our side, not your file. Please try again shortly.";
  }
  const message = err instanceof Error ? err.message : "";
  // The Blob client can't get an upload token when the flow session has lapsed;
  // it reports that as an opaque "client token" error. Name the real cause.
  if (/client token|session (has )?expired|verify your email/i.test(message)) {
    return "Your session timed out. Choose “Start over” below and run through the steps again.";
  }
  return message || "That upload didn't finish. Please try again.";
}

export function UploadPanel({
  mode,
  folder,
  maxFileSizeMb,
  maxFiles,
  initialFiles,
  onRemoveFile,
  onDone,
}: {
  mode: UploadMode;
  folder: string;
  maxFileSizeMb: number;
  maxFiles: number;
  /** Files already attached — a reload must not pretend they're gone. */
  initialFiles: UploadedFile[];
  /** Deletes an uploaded file server-side; the row leaves the submission. */
  onRemoveFile: (fileId: string) => Promise<RemoveResult>;
  onDone: () => void;
}) {
  const [cards, setCards] = useState<Card[]>(() =>
    initialFiles.map((uploaded) => ({
      key: uploaded.id,
      state: { status: "done", uploaded } as CardState,
    })),
  );
  // Keys whose uploaded file is being deleted server-side — their remove control
  // is disabled until the round trip returns.
  const [removing, setRemoving] = useState<Set<string>>(() => new Set());
  const [removeError, setRemoveError] = useState<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((key: string, state: CardState) => {
    setCards((current) =>
      current.map((card) => (card.key === key ? { ...card, state } : card)),
    );
  }, []);

  const doneCount = cards.filter((c) => c.state.status === "done").length;
  const uploadingCount = cards.filter((c) => c.state.status === "uploading").length;
  // Only files that count against the limit — a refused card holds no slot.
  const activeCount = doneCount + uploadingCount;
  const busy = uploadingCount > 0 || removing.size > 0;
  const atLimit = activeCount >= maxFiles;

  const startUpload = useCallback(
    async (key: string, file: File) => {
      patch(key, { status: "uploading", file, progress: 0 });

      // Some failures make the transport re-send the whole file on every error —
      // a misconfigured store is the one we hit — so the bar loops 0→99→0 forever
      // and never throws. Give up on a full restart after real progress (a retry
      // loop) or on a stall (no progress for a while), and report it rather than
      // spin. Removing the card also aborts through this controller.
      const controller = new AbortController();
      controllers.current.set(key, controller);
      let lastProgress = 0;
      let restarts = 0;
      let stall: ReturnType<typeof setTimeout> | undefined;
      const armStall = () => {
        clearTimeout(stall);
        stall = setTimeout(
          () => controller.abort(new DOMException("stalled", "TimeoutError")),
          45_000,
        );
      };
      armStall();

      try {
        const uploaded = await uploadFile({
          mode,
          folder,
          file,
          signal: controller.signal,
          onProgress: (progress) => {
            armStall();
            const restarted = lastProgress >= 50 && progress <= 5;
            lastProgress = progress;
            if (restarted && ++restarts >= 2) {
              controller.abort(new DOMException("retry-loop", "AbortError"));
              return;
            }
            patch(key, { status: "uploading", file, progress });
          },
        });
        patch(key, { status: "done", uploaded });
      } catch (err) {
        // A removed card is gone from the list; patching it is a harmless no-op.
        patch(key, {
          status: "error",
          file,
          message: describeUploadFailure(controller.signal, err),
          retriable: true,
        });
      } finally {
        clearTimeout(stall);
        controllers.current.delete(key);
      }
    },
    [mode, folder, patch],
  );

  const addFile = useCallback(
    (file: File) => {
      const key = nextKey();
      // Refuse type and size here, before any byte leaves the browser (QA 2.3.6,
      // 2.3.8). These are the same checks the picker's `accept` makes, for the
      // files a drag-and-drop lets through it.
      if (!isAllowedFilename(file.name)) {
        setCards((cur) => [
          ...cur,
          {
            key,
            state: {
              status: "error",
              file,
              message: `That file type isn't supported. Accepted: ${describeAllowedTypes()}.`,
              retriable: false,
            },
          },
        ]);
        return;
      }
      if (file.size > maxFileSizeMb * 1024 * 1024) {
        setCards((cur) => [
          ...cur,
          {
            key,
            state: {
              status: "error",
              file,
              message: `That file is ${formatFileSize(file.size)} — the limit is ${maxFileSizeMb} MB.`,
              retriable: false,
            },
          },
        ]);
        return;
      }
      // Add the card first, then upload into it. `startUpload` only patches an
      // existing card, so without this the file uploaded invisibly and the panel
      // never showed progress or let the customer continue.
      setCards((cur) => [
        ...cur,
        { key, state: { status: "uploading", file, progress: 0 } },
      ]);
      void startUpload(key, file);
    },
    [maxFileSizeMb, startUpload],
  );

  function handleFiles(files: File[]) {
    setRemoveError(null);
    // A drag can carry several files; take only what still fits under the limit.
    const room = maxFiles - activeCount;
    files.slice(0, Math.max(0, room)).forEach(addFile);
  }

  async function remove(key: string) {
    setRemoveError(null);
    const card = cards.find((c) => c.key === key);
    if (!card) return;

    // Abort an upload still in flight; nothing reached the server to clean up.
    controllers.current.get(key)?.abort(new DOMException("removed", "AbortError"));

    if (card.state.status === "done") {
      // The file is on the server and part of the submission — delete it there
      // before dropping the row, or "continue" would still carry it.
      setRemoving((prev) => new Set(prev).add(key));
      const result = await onRemoveFile(card.state.uploaded.id);
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (!result.ok) {
        setRemoveError(result.error);
        return;
      }
    }

    setCards((current) => current.filter((c) => c.key !== key));
  }

  return (
    <div className="space-y-6">
      {/* Count and size only — the accepted types live once, in the dropzone
          below, rather than being repeated here (QA 2.3.2). */}
      <p className="text-center text-sm text-band">
        {`Up to ${maxFiles} file${maxFiles === 1 ? "" : "s"}, ${maxFileSizeMb} MB each`}
      </p>

      {removeError && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {removeError}
        </p>
      )}

      {cards.length > 0 && (
        <ul className="space-y-3">
          {cards.map((card) => (
            <li key={card.key}>
              <FileCard
                state={card.state}
                removing={removing.has(card.key)}
                onRetry={(file) => startUpload(card.key, file)}
                onRemove={() => remove(card.key)}
              />
            </li>
          ))}
        </ul>
      )}

      {!atLimit && <Dropzone maxFileSizeMb={maxFileSizeMb} onFiles={handleFiles} />}

      {atLimit && (
        <p className="text-center text-sm text-band">
          {`That’s the maximum of ${maxFiles} file${maxFiles === 1 ? "" : "s"}.`}
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={doneCount === 0 || busy}
        onClick={onDone}
      >
        {busy
          ? "Waiting for uploads to finish…"
          : doneCount === 0
            ? "Add a file to continue"
            : `Continue to payment (${doneCount} file${doneCount === 1 ? "" : "s"})`}
      </Button>
    </div>
  );
}

/**
 * The one add control — click to open the picker, or drop files onto it. Its
 * dashed border and lime hover are the styling the old "add another" button
 * wore; the whole panel is unified on it now (QA 2.3.3).
 */
function Dropzone({
  maxFileSizeMb,
  onFiles,
}: {
  maxFileSizeMb: number;
  onFiles: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`${ENTRY} cursor-pointer items-center gap-1 rounded-lg border-2 border-dashed px-4 py-3 text-center transition-colors ${
        dragging
          ? "border-highlight text-highlight"
          : "border-paper/40 text-paper hover:border-highlight hover:text-highlight"
      }`}
    >
      <span aria-hidden className="text-xl font-light leading-none">
        +
      </span>
      <span className="text-sm font-semibold">Click to upload or drag and drop</span>
      <span className="text-xs opacity-70">
        {`${describeAllowedTypes()} · up to ${maxFileSizeMb} MB`}
      </span>
      <input
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so choosing the same file twice still fires a change event.
          event.target.value = "";
          if (file) onFiles([file]);
        }}
      />
    </label>
  );
}

function FileCard({
  state,
  removing,
  onRetry,
  onRemove,
}: {
  state: CardState;
  removing: boolean;
  onRetry: (file: File) => void;
  onRemove: () => void;
}) {
  if (state.status === "uploading") {
    return (
      <div className={`${ENTRY} rounded-2xl border border-line bg-surface px-5 py-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-4">
              <span className="truncate text-sm font-medium text-ink">
                {state.file.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                {state.progress}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={state.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Uploading ${state.file.name}`}
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-paper-alt"
            >
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-200"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {formatFileSize(state.file.size)} · uploading
            </p>
          </div>
          <RemoveButton onRemove={onRemove} label="Cancel upload" />
        </div>
      </div>
    );
  }

  if (state.status === "done") {
    return (
      <div className={`${ENTRY} rounded-2xl border border-line bg-surface px-5 py-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-emerald-600">
                ✓
              </span>
              <span className="truncate text-sm font-medium text-ink">
                {state.uploaded.filename}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {formatFileSize(state.uploaded.sizeBytes)} · uploaded
            </p>
          </div>
          <RemoveButton onRemove={onRemove} busy={removing} label="Remove file" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${ENTRY} rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-rose-900">
            {state.file.name}
          </div>
          <p role="alert" className="mt-1 text-sm text-rose-700">
            {state.message}
          </p>
          {state.retriable && (
            <button
              type="button"
              onClick={() => onRetry(state.file)}
              className="mt-2 text-sm font-semibold text-rose-900 underline"
            >
              Try again
            </button>
          )}
        </div>
        <RemoveButton onRemove={onRemove} label="Dismiss" tone="rose" />
      </div>
    </div>
  );
}

function RemoveButton({
  onRemove,
  busy = false,
  label,
  tone = "ink",
}: {
  onRemove: () => void;
  busy?: boolean;
  label: string;
  tone?: "ink" | "rose";
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={busy}
      aria-label={label}
      className={`-mr-1 shrink-0 self-start rounded-md p-1.5 transition-colors disabled:opacity-50 ${
        tone === "rose"
          ? "text-rose-400 hover:bg-rose-100 hover:text-rose-700"
          : "text-ink-muted hover:bg-paper-alt hover:text-ink"
      }`}
    >
      {busy ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="animate-spin"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
    </button>
  );
}
