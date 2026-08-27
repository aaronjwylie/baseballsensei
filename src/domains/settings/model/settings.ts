/**
 * Platform settings — the limits the admin tunes without a deploy.
 *
 * These are deliberately **not** in `shared/config/env.ts`. Env vars are the
 * developer's configuration, set once at deploy time; these are the operator's,
 * changed from the admin portal while the site runs. Different owner, different
 * lifetime, different home.
 *
 * Knows nothing about storage — the row↔domain mapping is in
 * `api/settingsRow.ts`.
 */
import { z } from "zod";

export interface PlatformSettings {
  /** What the customer pays per review, in cents (e.g. 8000 = $80.00). */
  priceCents: number;
  /** Largest single upload the customer may send, in megabytes. */
  maxFileSizeMb: number;
  /** How many files one submission may carry. */
  maxFilesPerSubmission: number;
  /**
   * Days after the **customer collects** before their files are deleted.
   *
   * The clock starts on collection, not on delivery, so nothing is ever purged
   * before the customer has it in hand.
   */
  retainCollectedDays: number;
  /**
   * The backstop, in days from delivery.
   *
   * A customer who never downloads has no collection clock, so without this
   * their files live forever. Whichever window expires **later** wins, so
   * someone who collects on day 80 still gets their full retention.
   */
  retainDeliveredDays: number;
  /** Days of warning before deletion. The ⑨ email fires this far out. */
  warnBeforeDeletionDays: number;
  /** Hours after an unpaid submission goes quiet before its uploads go. */
  retainUnpaidHours: number;
}

/**
 * What a fresh install gets, and what the app falls back to if the settings row
 * is somehow missing. Mirrors the column defaults in the Drizzle schema — the
 * two are asserted equal by `settingsApi`'s upsert, which writes these values
 * when it creates the row.
 */
export const DEFAULT_SETTINGS: PlatformSettings = {
  priceCents: 8000,
  maxFileSizeMb: 50,
  maxFilesPerSubmission: 5,
  retainCollectedDays: 30,
  retainDeliveredDays: 90,
  warnBeforeDeletionDays: 7,
  retainUnpaidHours: 24,
};

/**
 * Bounds on the knobs themselves.
 *
 * The ceilings are not arbitrary. 2000 MB is well past any phone clip and stops
 * a typo from turning one upload into a storage bill; 20 files is past what a
 * coach can usefully review in one sitting. The retention floor of 1 hour keeps
 * an operator from setting a sweep so aggressive it deletes files out from under
 * a coach who is still working.
 */
export const settingsSchema = z.object({
  // Cents. Floor $1 so a typo can't set the review free; ceiling $10,000 stops
  // a fat-fingered charge. The form collects dollars and converts.
  priceCents: z.coerce.number().int().min(100).max(1_000_000),
  maxFileSizeMb: z.coerce.number().int().min(1).max(2000),
  maxFilesPerSubmission: z.coerce.number().int().min(1).max(20),
  // Floor of 1 day on the collected clock, so a purge can never land on the
  // same day the customer downloaded. The warning must fit inside both windows
  // — enforced by the cross-field `.refine` below, not just per-field bounds.
  retainCollectedDays: z.coerce.number().int().min(1).max(3650),
  retainDeliveredDays: z.coerce.number().int().min(1).max(3650),
  warnBeforeDeletionDays: z.coerce.number().int().min(0).max(365),
  retainUnpaidHours: z.coerce.number().int().min(1).max(8760),
}).refine(
  (s) =>
    s.warnBeforeDeletionDays <=
    Math.min(s.retainCollectedDays, s.retainDeliveredDays),
  {
    /*
      The warning has to fit inside both retention windows. Per-field bounds
      allow, say, a 100-day warning against a 90-day delivered window — and the
      sweep computes its warn cutoff as `retain - warn`, which then goes
      negative and lands in the *future*, warning every just-delivered
      submission that a deletion is imminent. Tie the fields together here so
      that state is unreachable from the form.
    */
    path: ["warnBeforeDeletionDays"],
    message:
      "The deletion warning must be no longer than the shorter of the two retention windows.",
  },
);

/** Bytes, for comparing against a file size. */
export function maxFileSizeBytes(settings: PlatformSettings): number {
  return settings.maxFileSizeMb * 1024 * 1024;
}
