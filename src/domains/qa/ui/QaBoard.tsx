"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  compareCheckIds,
  type Check,
  type FieldCheck,
  type Mark,
  type MarkValue,
  type Note,
  type NoteStatus,
  type Phase,
} from "../model/qaMark";
import { QaCheckRow } from "./QaCheckRow";

/**
 * The shared record, on the site.
 *
 * **Why this is not the artifact.** A record two people write to at once needs
 * shared authenticated state, and a document that republishes itself is the
 * wrong shape for it — the artifact version cost a stylesheet, a lost verdict,
 * and a sharing puzzle before that became clear. Here the state is a table, the
 * writers are whoever armed a browser for the pass, and there is no publish,
 * no reload, and no version to match.
 *
 * **It polls rather than pushes.** Every four seconds, `router.refresh()` pulls
 * the server component's marks again. Not elegant, and entirely sufficient: two
 * people ticking a list need to see each other within a few seconds, not within
 * a frame, and a socket would be machinery for a page that exists to be deleted.
 *
 * Its own clicks are instrumented by the site probe like every other page —
 * nothing here reports separately, which is the whole point of moving it.
 */
export function QaBoard({
  phases,
  initialMarks,
  initialNotes,
  initialFieldChecks,
  initialName,
  onMark,
  onNote,
  onNoteStatus,
  onAddCheck,
}: {
  phases: Phase[];
  initialMarks: Mark[];
  initialNotes: Note[];
  initialFieldChecks: FieldCheck[];
  initialName: string;
  onMark: (
    id: string,
    v: MarkValue | null,
    note: string | null,
    actor: string | null,
  ) => Promise<{ ok: boolean }>;
  onNote: (
    checkId: string,
    body: string,
    browser: string | null,
    actor: string | null,
  ) => Promise<{ ok: boolean }>;
  onNoteStatus: (
    id: string,
    status: NoteStatus,
    actor: string | null,
  ) => Promise<{ ok: boolean }>;
  onAddCheck: (
    afterId: string,
    what: string,
    expect: string,
    actor: string | null,
  ) => Promise<{ ok: boolean; id?: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "todo" | "fail">("all");
  const [busy, setBusy] = useState<string | null>(null);
  /* Who is ticking.

     Every mark landed with an empty actor, so the record could say a check
     passed but not who decided that — most of what you want from a shared
     record when two people work one list and one of them later disagrees.

     Deliberately NOT React state. The name is remembered per browser, and
     initialising state from localStorage either renders differently on the
     server than the client, or needs an effect that sets state during commit —
     which cascades renders and which the lint rule is right to refuse. An
     uncontrolled input sidesteps both: the server renders it empty, an effect
     fills the DOM node (an external system, which is what effects are for),
     and a click reads whatever is in it. */
  const nameRef = useRef<HTMLInputElement>(null);
  /* Optimistic overlay: the server is the truth, but a tick has to look
     instant or a tester clicks it again — which is exactly how a verdict got
     lost in the artifact version. */
  const [pendingMarks, setPendingMarks] = useState<Record<string, MarkValue | null>>({});

  const byId = new Map(initialMarks.map((m) => [m.checkId, m]));

  const notesFor = (id: string) => initialNotes.filter((n) => n.checkId === id);

  /* Provisional checks hang off the check they were added after, so they
     render in the position their id claims rather than at the end of a phase.
     Sorted, because "1.1.3.10" must follow "1.1.3.9" and string order does not
     agree. */
  const childrenOf = (id: string): Check[] =>
    initialFieldChecks
      .filter((f) => f.afterId === id)
      .sort((a, b) => compareCheckIds(a.id, b.id))
      .map((f) => ({ id: f.id, what: f.what, expect: f.expect }));

  const actorName = () => nameRef.current?.value.trim() || null;

  async function note(checkId: string, body: string, browser: string | null) {
    await onNote(checkId, body, browser, actorName());
    startTransition(() => router.refresh());
  }

  async function noteStatus(id: string, status: NoteStatus) {
    await onNoteStatus(id, status, actorName());
    startTransition(() => router.refresh());
  }

  async function addCheck(afterId: string, what: string, expect: string) {
    await onAddCheck(afterId, what, expect, actorName());
    startTransition(() => router.refresh());
  }

  /* Reconciled at render, not in an effect.

     The optimistic value only matters while the server disagrees with it; the
     moment a refresh brings back the same answer, the server's is used and the
     stale entry is inert. Clearing it in an effect instead would set state
     during render's commit and cascade — which the lint rule is right about,
     and which this avoids by never needing the clear at all. */
  const valueOf = (id: string): MarkValue | null => {
    const server = (byId.get(id)?.value as MarkValue) ?? null;
    if (!(id in pendingMarks)) return server;
    return pendingMarks[id] === server ? server : pendingMarks[id];
  };

  /* Poll for the other person's ticks. Paused while the tab is hidden — a
     background tab refreshing every four seconds all afternoon is rude. */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("qa-actor");
      if (saved && nameRef.current) nameRef.current.value = saved;
    } catch { /* private mode — the field still works for this session */ }
  }, []);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    timer.current = setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  async function mark(id: string, v: MarkValue) {
    const next = valueOf(id) === v ? null : v;
    setPendingMarks((p) => {
      const kept: Record<string, MarkValue | null> = {};
      for (const [k, val] of Object.entries(p)) {
        const server = (byId.get(k)?.value as MarkValue) ?? null;
        if (val !== server) kept[k] = val;
      }
      kept[id] = next;
      return kept;
    });
    setBusy(id);
    const existing = byId.get(id)?.note ?? null;
    await onMark(id, next, next ? existing : null, nameRef.current?.value.trim() || null);
    setBusy(null);
    startTransition(() => router.refresh());
  }

  const generated = phases.flatMap((p) => p.groups.flatMap((g) => g.checks));
  const all: Check[] = [
    ...generated,
    ...initialFieldChecks.map((f) => ({ id: f.id, what: f.what, expect: f.expect })),
  ];
  const count = (v: MarkValue) => all.filter((c) => valueOf(c.id) === v).length;
  const done = all.filter((c) => valueOf(c.id)).length;

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b-2 border-ink bg-paper py-4">
        {(["all", "todo", "fail"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`border-2 px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.06em] ${
              filter === f
                ? "border-accent bg-accent text-paper"
                : "border-line text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {f === "all" ? "All" : f === "todo" ? "To go" : "Failures"}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-ink-muted">
          <span className="font-display">You are</span>
          <input
            ref={nameRef}
            defaultValue={initialName}
            onChange={(e) => {
              try { localStorage.setItem("qa-actor", e.target.value); } catch { /* ignore */ }
            }}
            placeholder="name"
            aria-label="Your name, shown beside marks you make"
            className="w-24 border-2 border-line bg-paper px-2 py-1 text-[12px] normal-case tracking-normal text-ink outline-none focus:border-accent"
          />
        </label>
        <p className="font-display text-[11px] uppercase tracking-[0.08em] text-ink-muted">
          <span className="text-success">{count("pass")} pass</span>
          {" · "}
          <span className="text-rose-700">{count("fail")} fail</span>
          {" · "}
          {count("skip")} skip {" · "} {all.length - done} to go
        </p>
      </div>

      {phases.map((phase) => {
        const rows = phase.groups.flatMap((g) =>
          g.checks.filter((c) => {
            const v = valueOf(c.id);
            return filter === "all" || (filter === "todo" && !v) || (filter === "fail" && v === "fail");
          }),
        );
        if (rows.length === 0) return null;

        return (
          <section key={phase.id} id={phase.id} className="scroll-mt-20">
            <div className="flex items-baseline gap-3 border-b-2 border-ink pb-2">
              <span className="bg-ink px-2 py-0.5 font-display text-[12px] font-semibold tracking-[0.1em] text-paper">
                {phase.n}
              </span>
              <h2 className="font-display text-[20px] font-medium uppercase text-ink">
                {phase.title}
              </h2>
              <span className="ml-auto text-[11px] tabular-nums text-ink-muted">
                {phase.groups.flatMap((g) => g.checks).filter((c) => valueOf(c.id)).length}
                {" / "}
                {phase.groups.flatMap((g) => g.checks).length}
              </span>
            </div>

            {phase.note && (
              <p className="my-4 border-l-[3px] border-highlight pl-3 text-[13.5px] text-ink-soft">
                {phase.note}
              </p>
            )}

            {phase.groups.map((group, gi) => {
              const visible = group.checks.filter((c) => rows.includes(c));
              if (visible.length === 0) return null;
              return (
                <div key={gi}>
                  {group.head && (
                    <h3 className="mt-6 mb-2 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
                      {group.head}
                    </h3>
                  )}
                  {visible.flatMap((check) => [
                    <QaCheckRow
                      key={check.id}
                      check={check}
                      value={valueOf(check.id)}
                      mark={byId.get(check.id)}
                      notes={notesFor(check.id)}
                      busy={busy === check.id}
                      onMark={(id, mv) => void mark(id, mv)}
                      onNote={note}
                      onNoteStatus={noteStatus}
                      onAddCheck={addCheck}
                      actorName={actorName}
                    />,
                    ...childrenOf(check.id).map((kid) => (
                      <QaCheckRow
                        key={kid.id}
                        check={kid}
                        provisional
                        value={valueOf(kid.id)}
                        mark={byId.get(kid.id)}
                        notes={notesFor(kid.id)}
                        busy={busy === kid.id}
                        onMark={(id, mv) => void mark(id, mv)}
                        onNote={note}
                        onNoteStatus={noteStatus}
                        onAddCheck={addCheck}
                        actorName={actorName}
                      />
                    )),
                  ])}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
