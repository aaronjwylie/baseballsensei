/**
 * What the probe sends. Client-safe — no server imports, so the browser half
 * and the route half agree on one shape.
 */
export type QaEventKind =
  | "click"
  | "nav"
  | "submit"
  | "field"
  | "error"
  | "console"
  | "fetch";

export interface QaEventInput {
  session: string;
  seq: number;
  kind: QaEventKind;
  path: string;
  target?: string;
  field?: string;
  detail?: string;
}

/** The cookie the probe's presence is decided by. Holds no secret. */
export const QA_FLAG_COOKIE = "qa_on";
/** The cookie that authorises writing. httpOnly; holds the token. */
export const QA_AUTH_COOKIE = "qa_auth";

/**
 * Field names whose *existence* is recorded but which are never described
 * further, and whose values are never sent under any setting.
 *
 * Matching is on the name, lowercased, as a substring — `confirmPassword` and
 * `new_password` both contain `password`. A miss here would put a secret in a
 * database row, so it errs wide.
 */
export const NEVER_RECORD = [
  "password",
  "card",
  "cvc",
  "cvv",
  "expiry",
  "code",
  "token",
  "secret",
];

export function isSensitiveField(name: string): boolean {
  const n = name.toLowerCase();
  return NEVER_RECORD.some((s) => n.includes(s));
}

/** Cap on a single batch, so one runaway page can't write unbounded rows. */
export const MAX_BATCH = 50;
