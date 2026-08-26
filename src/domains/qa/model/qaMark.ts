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

/** One row of the itinerary, as the build emits it. */
export interface Check {
  id: string;
  what: string;
  expect: string;
  flag?: "flag" | "done";
}

export interface Group {
  head: string | null;
  checks: Check[];
}

export interface Phase {
  n: string;
  title: string;
  id: string;
  note: string | null;
  groups: Group[];
}
