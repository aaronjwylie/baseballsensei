"use client";

import { useState } from "react";
import {
  BROWSERS,
  MARK_VALUES,
  type Check,
  type Mark,
  type MarkValue,
  type Note,
  type NoteStatus,
} from "../model/qaMark";

/**
 * One check: its verdict and its findings.
 *
 * Split out of `QaBoard` when notes arrived — the row grew interactive regions
 * of its own and the board was becoming a file where a change to the notes
 * panel risked the polling loop.
 *
 * **Adding a check is not here.** It briefly was, as a "+" per row that
 * inserted beneath that check — which quietly meant a finding could only be
 * written down somewhere an existing check already was. The board owns that
 * control now, and the id decides where the new check lands.
 */
export function QaCheckRow({
  check,
  provisional,
  value,
  mark,
  notes,
  busy,
  onMark,
  onNote,
  onNoteStatus,
  actorName,
}: {
  check: Check;
  provisional?: boolean;
  value: MarkValue | null;
  mark: Mark | undefined;
  notes: Note[];
  busy: boolean;
  onMark: (id: string, v: MarkValue) => void;
  onNote: (checkId: string, body: string, browser: string | null) => Promise<void>;
  onNoteStatus: (id: string, status: NoteStatus) => Promise<void>;
  actorName: () => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [browser, setBrowser] = useState<string>(BROWSERS[0]);
  const [saving, setSaving] = useState(false);

  const pending = notes.filter((n) => n.status === "pending").length;
  const fixed = notes.filter((n) => n.status === "fixed").length;
  const blocked = notes.filter((n) => n.status === "blocked").length;

  async function submitNote() {
    if (!body.trim() || saving) return;
    setSaving(true);
    await onNote(check.id, body, browser);
    setBody("");
    setSaving(false);
  }

  return (
    <div
      className={`border-b border-line px-2 py-2.5 ${
        value === "pass"
          ? "bg-emerald-50"
          : value === "fail"
            ? "bg-rose-50"
            : value === "skip"
              ? "bg-amber-50"
              : ""
      }`}
    >
      <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-start gap-3 sm:grid-cols-[56px_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
        <span className="pt-0.5 font-display text-[12px] font-semibold tabular-nums text-accent">
          {check.id}
        </span>
        <span
          className={`text-sm ${check.retired ? "text-ink-muted line-through" : "text-ink"}`}
        >
          {check.what}
          {check.retired && (
            <span className="ml-2 border border-line px-1.5 py-0.5 align-[2px] font-display text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted no-underline">
              Retired
            </span>
          )}
          {check.flag === "flag" && (
            <span className="ml-2 bg-highlight px-1.5 py-0.5 align-[2px] font-display text-[9px] font-semibold uppercase tracking-[0.1em] text-ink">
              Watch
            </span>
          )}
          {provisional && (
            /* Badged because it exists only in the database until it is folded
               into the markdown. Without the badge it is indistinguishable from
               a generated check, and a staging area you cannot see is just a
               second source of truth. */
            <span className="ml-2 border-2 border-dashed border-accent px-1.5 py-0.5 align-[2px] font-display text-[9px] font-semibold uppercase tracking-[0.1em] text-accent no-underline">
              Added here
            </span>
          )}
        </span>
        <span className="hidden text-[13px] text-ink-muted sm:block">{check.expect}</span>
        <span className="flex gap-1">
          {MARK_VALUES.map((mv) => (
            <button
              key={mv}
              type="button"
              disabled={busy || (check.retired && value !== mv)}
              onClick={() => onMark(check.id, mv)}
              aria-pressed={value === mv}
              aria-label={`${check.id} ${mv}`}
              className={`grid h-7 w-7 place-items-center border-2 text-sm disabled:opacity-40 ${
                value === mv
                  ? mv === "pass"
                    ? "border-success bg-success text-white"
                    : mv === "fail"
                      ? "border-rose-700 bg-rose-700 text-white"
                      : "border-amber-600 bg-amber-600 text-white"
                  : "border-line text-ink-muted hover:border-ink hover:text-ink"
              }`}
            >
              {mv === "pass" ? "✓" : mv === "fail" ? "✕" : "–"}
            </button>
          ))}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-3 pl-[68px]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Notes on ${check.id}`}
          className="font-display text-[11px] uppercase tracking-[0.08em] text-ink-muted underline-offset-2 hover:text-accent hover:underline"
        >
          {notes.length === 0
            ? "+ note"
            : `${notes.length} note${notes.length > 1 ? "s" : ""}`}
          {pending > 0 && <span className="ml-1 text-rose-700">· {pending} pending</span>}
          {fixed > 0 && <span className="ml-1 text-amber-700">· {fixed} awaiting re-test</span>}
          {/* Collapsed rows have to carry this too. A blocked finding that is
              only visible once you expand the note is a finding nobody scanning
              the board will see, which is the whole problem it was raised to
              avoid. */}
          {blocked > 0 && <span className="ml-1 text-violet-700">· {blocked} blocked</span>}
        </button>
        {mark?.actor && value && (
          <span className="text-[11px] text-ink-muted">{mark.actor}</span>
        )}
      </div>

      {check.history && check.history.length > 0 && (
        <details className="mt-1 pl-[68px] text-[11px] text-ink-muted">
          <summary className="cursor-pointer">
            Reworded {check.history.length}× — a verdict given earlier was against
            different words
          </summary>
          <ul className="mt-1 space-y-1 border-l-2 border-line pl-3">
            {check.history.map((h, hi) => (
              <li key={hi}>
                <span className="tabular-nums">{h.at.slice(0, 10)}</span> — “{h.what}”
              </li>
            ))}
          </ul>
        </details>
      )}

      {open && (
        <div className="mt-2 space-y-3 border-l-[3px] border-line py-2 pl-3 md:ml-[68px]">
          {notes.map((n) => (
            <div key={n.id} className="text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={n.status} />
                <span className="text-[11px] text-ink-muted">
                  {n.author ?? "—"}
                  {n.browser ? ` · ${n.browser}` : ""} ·{" "}
                  <span className="tabular-nums">{n.at.slice(11, 16)}Z</span>
                </span>
                {n.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => void onNoteStatus(n.id, "fixed")}
                    className="border border-line px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.08em] text-ink-muted hover:border-ink hover:text-ink"
                  >
                    Mark fixed
                  </button>
                )}
                {n.status === "fixed" && (
                  <button
                    type="button"
                    onClick={() => void onNoteStatus(n.id, "resolved")}
                    className="border border-success px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.08em] text-success hover:bg-success hover:text-white"
                  >
                    Re-tested — resolve
                  </button>
                )}
                {n.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => void onNoteStatus(n.id, "blocked")}
                    title="Real, but not addressable yet — waiting on someone. Leaves the fixer's queue, stays on the board."
                    className="border border-line px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.08em] text-ink-muted hover:border-accent hover:text-accent"
                  >
                    Needs input
                  </button>
                )}
                {n.status !== "pending" && (
                  <button
                    type="button"
                    onClick={() => void onNoteStatus(n.id, "pending")}
                    className="border border-line px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.08em] text-ink-muted hover:border-rose-700 hover:text-rose-700"
                  >
                    Reopen
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-ink">{n.body}</p>
              {n.statusBy && n.status !== "pending" && (
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {n.status} by {n.statusBy}
                </p>
              )}
            </div>
          ))}

          <div className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="What did you see? Include what you expected if it differs from the check."
              aria-label={`New note on ${check.id}`}
              className="w-full border-2 border-line bg-paper px-2 py-1 text-[13px] text-ink outline-none focus:border-accent"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={browser}
                onChange={(e) => setBrowser(e.target.value)}
                aria-label="Which browser you saw it in"
                className="border-2 border-line bg-paper px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
              >
                {BROWSERS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!body.trim() || saving}
                onClick={() => void submitNote()}
                className="border-2 border-ink bg-ink px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-paper disabled:opacity-40"
              >
                {saving ? "Saving…" : "Add note"}
              </button>
              <span className="text-[11px] text-ink-muted">
                as {actorName() ?? "—"} · notes are never edited, only added to
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: NoteStatus }) {
  const style =
    status === "pending"
      ? "border-rose-700 text-rose-700"
      : status === "fixed"
        ? "border-amber-600 text-amber-700"
        : status === "blocked"
          ? "border-violet-700 text-violet-700"
          : "border-success text-success";
  const label =
    status === "fixed"
      ? "fixed · awaiting re-test"
      : status === "blocked"
        ? "blocked · waiting on input"
        : status;
  return (
    <span
      className={`border px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em] ${style}`}
    >
      {label}
    </span>
  );
}
