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
import { QaAddCheck } from "./QaAddCheck";

/** A field-added check, in the shape the row renders. */
const asCheck = (f: FieldCheck): Check => ({
  id: f.id,
  what: f.what,
  expect: f.expect,
});

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
  onEditNote,
  onDeleteNote,
  onNoteStatus,
  onAddCheck,
  onWithdrawCheck,
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
  onEditNote: (id: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteNote: (id: string) => Promise<{ ok: boolean; error?: string }>;
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
  onWithdrawCheck: (id: string) => Promise<{ ok: boolean; error?: string }>;
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

  /* Where a field-added check goes, decided entirely by its id.

     A group's checks all share a prefix — 1.1.1, 1.1.2 … are group "1.1" — so
     an added id belongs to the group whose prefix it starts with. Inside that
     group it is placed by comparing against the generated checks in the order
     the markdown gives them, rather than by sorting the whole group: document
     order is the source's own statement of sequence, and re-sorting it here
     would let the board silently disagree with the itinerary.

     An id whose group does not exist — a new group, or a phase that has none —
     is not rejected. It collects at the end under its own heading, because a
     tester in the middle of a run should be able to write down what they found
     without first negotiating where it belongs. */
  const groupPrefix = (checks: Check[]): string | null => {
    const first = checks[0]?.id;
    if (!first) return null;
    const parts = first.split(".");
    return parts.slice(0, parts.length - 1).join(".");
  };

  const placedIds = new Set<string>();

  const interleave = (checks: Check[]): { check: Check; provisional: boolean }[] => {
    const prefix = groupPrefix(checks);
    if (!prefix) return [];
    const mine = initialFieldChecks
      .filter((f) => f.id.startsWith(`${prefix}.`))
      .sort((a, b) => compareCheckIds(a.id, b.id));
    for (const f of mine) placedIds.add(f.id);

    const out: { check: Check; provisional: boolean }[] = [];
    let i = 0;
    for (const check of checks) {
      while (i < mine.length && compareCheckIds(mine[i].id, check.id) < 0) {
        out.push({ check: asCheck(mine[i]), provisional: true });
        i++;
      }
      out.push({ check, provisional: false });
    }
    for (; i < mine.length; i++) out.push({ check: asCheck(mine[i]), provisional: true });
    return out;
  };

  const actorName = () => nameRef.current?.value.trim() || null;

  async function note(checkId: string, body: string, browser: string | null) {
    await onNote(checkId, body, browser, actorName());
    startTransition(() => router.refresh());
  }

  async function editNote(id: string, body: string) {
    const res = await onEditNote(id, body);
    startTransition(() => router.refresh());
    return res;
  }

  async function deleteNote(id: string) {
    const res = await onDeleteNote(id);
    startTransition(() => router.refresh());
    return res;
  }

  async function noteStatus(id: string, status: NoteStatus) {
    await onNoteStatus(id, status, actorName());
    startTransition(() => router.refresh());
  }

  async function withdrawCheck(id: string) {
    const res = await onWithdrawCheck(id);
    startTransition(() => router.refresh());
    return res;
  }

  async function addCheck(id: string, what: string, expect: string) {
    const res = await onAddCheck(id, what, expect, actorName());
    startTransition(() => router.refresh());
    return res;
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

      <QaAddCheck onAdd={addCheck} />

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
                  {interleave(visible).map(({ check, provisional }) => (
                    <QaCheckRow
                      key={check.id}
                      check={check}
                      provisional={provisional}
                      onWithdraw={provisional ? withdrawCheck : undefined}
                      value={valueOf(check.id)}
                      mark={byId.get(check.id)}
                      notes={notesFor(check.id)}
                      busy={busy === check.id}
                      onMark={(id, mv) => void mark(id, mv)}
                      onNote={note}
                      onEditNote={editNote}
                      onDeleteNote={deleteNote}
                      onNoteStatus={noteStatus}
                      actorName={actorName}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}
      {(() => {
        /* Read after every phase has rendered, so `placedIds` is complete.

           A check whose group does not exist cannot be interleaved anywhere,
           and dropping it would be the worst option available: the tester saw
           "Added 4.9.1", the board agreed, and the row is nowhere. It lands
           here instead, and reconciliation moves it into the markdown along
           with the rest. */
        const unplaced = initialFieldChecks
          .filter((f) => !placedIds.has(f.id))
          .sort((a, b) => compareCheckIds(a.id, b.id));
        if (unplaced.length === 0) return null;
        return (
          <section className="scroll-mt-20">
            <div className="flex items-baseline gap-3 border-b-2 border-dashed border-accent pb-2">
              <span className="border-2 border-dashed border-accent px-2 py-0.5 font-display text-[12px] font-semibold tracking-[0.1em] text-accent">
                +
              </span>
              <h2 className="font-display text-[20px] font-medium uppercase text-ink">
                Added mid-pass
              </h2>
              <span className="ml-auto text-[11px] text-ink-muted">
                ids outside any existing group
              </span>
            </div>
            {unplaced.map((f) => (
              <QaCheckRow
                key={f.id}
                check={asCheck(f)}
                provisional
                onWithdraw={withdrawCheck}
                value={valueOf(f.id)}
                mark={byId.get(f.id)}
                notes={notesFor(f.id)}
                busy={busy === f.id}
                onMark={(id, mv) => void mark(id, mv)}
                onNote={note}
                onEditNote={editNote}
                onDeleteNote={deleteNote}
                onNoteStatus={noteStatus}
                actorName={actorName}
              />
            ))}
          </section>
        );
      })()}
    </div>
  );
}
