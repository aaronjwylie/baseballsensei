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
