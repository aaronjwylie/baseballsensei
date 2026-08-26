"use client";

import { useCallback, useState } from "react";
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
 * One card per file, added one at a time: a card starts empty, becomes a live
 * upload the moment a file is chosen, and only then does "Add another file"
 * appear. That sequence is deliberate — a multi-select picker would let someone
 * queue six files, blow past the limit, and be told so only afterwards. This way
 * the limit is visible as it's approached and every card reports its own fate.
 *
 * The server re-checks type, size, and count on every single upload; nothing
 * here is a security boundary.
 */

type CardState =
  | { status: "empty" }
  | { status: "uploading"; file: File; progress: number }
  | { status: "done"; uploaded: UploadedFile }
  | { status: "error"; file: File; message: string };

interface Card {
  key: string;
  state: CardState;
}

let cardSeq = 0;
function emptyCard(): Card {
  cardSeq += 1;
  return { key: `card-${cardSeq}`, state: { status: "empty" } };
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
  onDone,
}: {
  mode: UploadMode;
  folder: string;
  maxFileSizeMb: number;
  maxFiles: number;
  /** Files already attached — a reload must not pretend they're gone. */
  initialFiles: UploadedFile[];
  onDone: () => void;
}) {
  const [cards, setCards] = useState<Card[]>(() =>
    initialFiles.length > 0
      ? initialFiles.map((uploaded) => ({
          key: uploaded.id,
          state: { status: "done", uploaded } as CardState,
        }))
      : [emptyCard()],
  );

  const patch = useCallback((key: string, state: CardState) => {
    setCards((current) =>
      current.map((card) => (card.key === key ? { ...card, state } : card)),
    );
  }, []);

  const doneCount = cards.filter((c) => c.state.status === "done").length;
  const busy = cards.some((c) => c.state.status === "uploading");
  const hasEmptyCard = cards.some((c) => c.state.status === "empty");
  const atLimit = doneCount >= maxFiles;

  async function start(key: string, file: File) {
    if (!isAllowedFilename(file.name)) {
      patch(key, {
        status: "error",
        file,
        message: `That file type isn't supported. Accepted: ${describeAllowedTypes()}.`,
      });
      return;
    }
    if (file.size > maxFileSizeMb * 1024 * 1024) {
      patch(key, {
        status: "error",
        file,
        message: `That file is ${formatFileSize(file.size)} — the limit is ${maxFileSizeMb} MB.`,
      });
      return;
    }

    patch(key, { status: "uploading", file, progress: 0 });

    // Some failures make the transport re-send the whole file on every error —
    // a misconfigured store is the one we hit — so the bar loops 0→99→0 forever
    // and never throws. Give up on a full restart after real progress (a retry
    // loop) or on a stall (no progress for a while), and report it rather than
    // spin. There's no user-facing cancel in this flow, so any abort is ours.
    const controller = new AbortController();
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
          // One restart can be a transient retry that then succeeds; a second
          // is a loop that won't.
          if (restarted && ++restarts >= 2) {
            controller.abort(new DOMException("retry-loop", "AbortError"));
            return;
          }
          patch(key, { status: "uploading", file, progress });
        },
      });
      patch(key, { status: "done", uploaded });
    } catch (err) {
      patch(key, {
        status: "error",
        file,
        message: describeUploadFailure(controller.signal, err),
      });
    } finally {
      clearTimeout(stall);
    }
  }

  function removeCard(key: string) {
    setCards((current) => {
      const next = current.filter((card) => card.key !== key);
      return next.length > 0 ? next : [emptyCard()];
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-center text-sm text-band">
        Up to {maxFiles} file{maxFiles === 1 ? "" : "s"}, {maxFileSizeMb} MB each
        · {describeAllowedTypes()}
      </p>

      <ul className="space-y-3">
        {cards.map((card) => (
          <li key={card.key}>
            <FileCard
              state={card.state}
              maxFileSizeMb={maxFileSizeMb}
              onChoose={(file) => start(card.key, file)}
              onRetry={(file) => start(card.key, file)}
              onRemove={() => removeCard(card.key)}
            />
          </li>
        ))}
      </ul>

      {/*
        The plus only appears once every card is spoken for and there's room —
        offering "add another" beside an empty card would just be two ways to do
        the same thing.
      */}
      {!hasEmptyCard && !atLimit && (
        <button
          type="button"
          onClick={() => setCards((current) => [...current, emptyCard()])}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-paper/40 px-4 py-3 text-sm font-semibold text-paper transition-colors hover:border-highlight hover:text-highlight"
        >
          <span aria-hidden className="text-lg leading-none">
            +
          </span>
          Upload another file
        </button>
      )}

      {atLimit && (
        <p className="text-center text-sm text-band">
          That&rsquo;s the maximum of {maxFiles} file
          {maxFiles === 1 ? "" : "s"}.
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

function FileCard({
  state,
  maxFileSizeMb,
  onChoose,
  onRetry,
  onRemove,
}: {
  state: CardState;
  maxFileSizeMb: number;
  onChoose: (file: File) => void;
  onRetry: (file: File) => void;
  onRemove: () => void;
}) {
  if (state.status === "empty") {
    return (
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line bg-surface px-4 py-10 text-center transition-colors hover:border-accent">
        <span aria-hidden className="text-2xl leading-none text-accent">
          ⤒
        </span>
        <span className="text-sm text-ink">
          <span className="font-semibold text-accent">Click to upload</span> or
          drag and drop
        </span>
        <span className="text-xs text-ink-muted">
          {describeAllowedTypes()} · up to {maxFileSizeMb} MB
        </span>
        <input
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so choosing the same file twice still fires a change event.
            event.target.value = "";
            if (file) onChoose(file);
          }}
        />
      </label>
    );
  }

  if (state.status === "uploading") {
    return (
      <div className="rounded-2xl border border-line bg-surface px-5 py-4">
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
    );
  }

  if (state.status === "done") {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
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
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
      <div className="truncate text-sm font-medium text-rose-900">
        {state.file.name}
      </div>
      <p role="alert" className="mt-1 text-sm text-rose-700">
        {state.message}
      </p>
      <div className="mt-3 flex gap-4 text-sm">
        <button
          type="button"
          onClick={() => onRetry(state.file)}
          className="font-semibold text-rose-900 underline"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-rose-700 underline"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
