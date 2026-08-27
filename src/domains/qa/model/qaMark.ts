/** Client-safe shapes for the shared record. No server imports. */
export { QA_AUTH_COOKIE, QA_FLAG_COOKIE } from "./qaEvent";

export const MARK_VALUES = ["pass", "fail", "skip"] as const;
export type MarkValue = (typeof MARK_VALUES)[number];

export interface Mark {
  checkId: string;
  value: MarkValue;
  note: string | null;
  actor: string | null;
  updatedAt: string;
}

/** What a check used to say, kept when its wording changes. */
export interface Edit {
  at: string;
  what: string;
  expect: string;
}

/** One row of the itinerary, as the build emits it. */
export interface Check {
  id: string;
  what: string;
  expect: string;
  flag?: "flag" | "done";
  /** Struck through in the source. Its verdicts stay attached to it. */
  retired?: boolean;
  /** Previous wordings, oldest first. A verdict given under an older one
      means something slightly different, so the page shows them. */
  history?: Edit[];
}

export interface Group {
  head: string | null;
  checks: Check[];
}

/** Stamped by the build so the page can say which itinerary it is showing. */
export interface ItineraryMeta {
  build: number;
  generatedAt: string;
  checks: number;
  live: number;
  retired: number;
  edited: number;
}

export interface Phase {
  n: string;
  title: string;
  id: string;
  note: string | null;
  groups: Group[];
}

/**
 * What became of a finding.
 *
 * `blocked` is the fourth because the other three could only describe findings
 * somebody could act on today. A finding can be real, agreed, and still not
 * addressable — 1.1.7 needs photography and copy from the client, and no patch
 * will produce either. Left pending it sits in a fixer's queue being skipped
 * every time; called fixed it claims work nobody did; called resolved it claims
 * a re-test nobody ran.
 *
 * **It is deliberately not a terminal state.** `resolved` says the matter is
 * closed; `blocked` says it is open and waiting on someone. The end-of-pass
 * report needs that difference most of all — the blocked list is the handover,
 * the one set of findings that outlives the pass.
 *
 * It is also the switch that takes a note out of a fixer's queue: `qa:notes`
 * lists pending work, so a blocked note stops appearing there while remaining
 * plainly visible on the board.
 */
export const NOTE_STATUSES = ["pending", "fixed", "resolved", "blocked"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/** One finding written against a check. Append-only — see `qaNoteTable`. */
export interface Note {
  id: string;
  checkId: string;
  body: string;
  browser: string | null;
  author: string | null;
  status: NoteStatus;
  statusBy: string | null;
  statusAt: string | null;
  at: string;
}

/**
 * A check added from the board and not yet in the markdown.
 *
 * `provisional` on a `Check` is what the board badges; this is the shape the
 * add-form posts and the reconcile step reads.
 */
export interface FieldCheck {
  id: string;
  what: string;
  expect: string;
  author: string | null;
  at: string;
}

/**
 * The browsers on this pass, as the probe reports them.
 *
 * A note has to say which browser, and typing it produces "chrome", "Chrome",
 * "google chrome" — three spellings of one fact, in the field a fix is chosen
 * by. The probe already knows the real list, so the form offers it.
 */
export const BROWSERS = [
  "Chrome · macOS",
  "Chrome · Windows",
  "Chrome · Android",
  "Safari · macOS",
  "Safari · iOS",
  "Firefox · Windows",
  "Edge · Windows",
  "Brave · Windows",
  "Opera · Windows",
  "all browsers",
  "not browser-specific",
] as const;

/** Digits and dots, at least two levels — "1.1", "1.1.15", "3.4.2.1". */
export function isCheckId(id: string): boolean {
  return /^\d+(\.\d+){1,4}$/.test(id);
}

/**
 * Componentwise numeric ordering, so "1.1.10" follows "1.1.9" and the inserted
 * "1.1.3.1" lands between "1.1.3" and "1.1.4".
 *
 * The generated checks never need this — their order is the markdown's own
 * document order. It exists for the provisional ones, which arrive out of band
 * and have to be placed.
 */
export function compareCheckIds(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}
