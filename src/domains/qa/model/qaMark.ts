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
 * `pending → claimed → fixed → resolved`, with `blocked` off to one side.
 *
 * **`claimed` is what makes editing safe.** A note can be edited or deleted
 * while pending, because nobody has acted on it — but *pending* never meant
 * *unread*: a fixer could list the queue and start work while the note still
 * said pending, and the wording could then change underneath them. So a fixer
 * claims a note before working on it, and claiming locks it. The window where
 * a note is editable is now exactly the window where nobody has picked it up,
 * rather than merely a window where nobody has finished.
 *
 * `fixed` is the strongest thing the person who wrote the patch may claim;
 * `resolved` belongs to whoever re-ran the check. Collapsing those two lets the
 * board go green on one person's say-so, which is the distinction the
 * submission ladder already draws between `complete` and `collected`.
 *
 * **`blocked` is deliberately not terminal.** `resolved` says the matter is
 * closed; `blocked` says it is open and waiting on someone — client copy, a
 * photograph, a decision. The end-of-pass report needs that difference most,
 * because the blocked list is the handover: the findings that outlive the pass.
 */
export const NOTE_STATUSES = [
  "pending",
  "claimed",
  "fixed",
  "resolved",
  "blocked",
] as const;

/** Only an unclaimed note may be reworded or removed — see `NOTE_STATUSES`. */
export const EDITABLE_STATUS = "pending";

export type NoteStatus = (typeof NOTE_STATUSES)[number];

/** One finding written against a check. Append-only — see `qaNoteTable`. */
/** A note's earlier wording, kept when it is edited while pending. */
export interface NoteRevision {
  body: string;
  at: string;
}

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
  revisions: NoteRevision[];
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
  /* The two width-of-the-roster answers lead, because they are the common ones:
     most findings are either everywhere or nowhere in particular, and burying
     them under nine specific browsers made the honest answer the hardest to
     pick.

     "Not browser-specific" is first, and therefore the default, because it is
     the only entry that claims nothing. A default of "all browsers" asserts the
     finding was reproduced on nine browsers, which a tester who forgot to
     change the field has not done — turning a Safari-only bug into a false
     everywhere-bug, in the field a fix is chosen by. A default should be the
     answer that is hardest to be wrong about.

     The nine follow, grouped by engine rather than alphabetically — the
     question a fix asks is usually "which engine", and Blink spellings sitting
     together makes that readable at a glance. */
  "not browser-specific",
  "all browsers",
  "Chrome · macOS",
  "Chrome · Windows",
  "Chrome · Android",
  "Edge · Windows",
  "Brave · Windows",
  "Opera · Windows",
  "Safari · macOS",
  "Safari · iOS",
  "Firefox · Windows",
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
