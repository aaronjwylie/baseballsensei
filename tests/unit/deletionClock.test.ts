import { describe, expect, it } from "vitest";
import { deletionDueAt, daysUntil } from "@/domains/submission/model/submission";

/**
 * QA 8.9.37–8.9.42 — the end-of-ladder countdown, and the two clocks under it.
 *
 * The rule is the one `/admin/settings` states in the operator's own words:
 * **30 days from the customer's download, or 90 from delivery if they never
 * download.** One clock at a time — collection supersedes the backstop rather
 * than extending it. The sweep reads the same rule backwards, so these two have
 * to agree or a submission gets warned about a date that isn't the one it is
 * deleted on. That is exactly what "whichever is later" caused until
 * 2026-09-10, since the ⑨ warning always mailed this date.
 */
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

describe("deletionDueAt — collection supersedes the backstop", () => {
  it("8.9.39 has no date before either clock starts", () => {
    expect(deletionDueAt({ collectedAt: undefined, completedAt: undefined }, 30, 90)).toBeNull();
  });

  it("counts from delivery when only that has happened", () => {
    const due = deletionDueAt({ collectedAt: undefined, completedAt: ago(0) }, 30, 90);
    expect(daysUntil(due)).toBe(90);
  });

  /*
    8.9.42 — downloading *replaces* the window, it does not add to it. A
    submission collected the day it was delivered is held 30 days, not 90: the
    backstop exists for the customer who never comes for their feedback, and the
    moment they do it stops applying (Ben, 2026-09-10).

    Both directions are asserted here on purpose. This is the pair of cases that
    tells the rule apart from "whichever is later" — under that form the first
    would be 90 and the second unchanged — so a regression to it fails here
    rather than silently in the sweep three months later.
  */
  it("8.9.42 restarts at 30 days once the customer downloads", () => {
    const due = deletionDueAt({ collectedAt: ago(0), completedAt: ago(0) }, 30, 90);
    expect(daysUntil(due)).toBe(30);
  });

  it("and a late download still gets its own full window", () => {
    // Delivered 89 days ago, collected today: 30 from now, not 1.
    const due = deletionDueAt({ collectedAt: ago(0), completedAt: ago(89) }, 30, 90);
    expect(daysUntil(due)).toBe(30);
  });

  /*
    The backstop is untouched for the customer who never downloads — the case it
    exists for, and the one that used to be purged with no warning at all.
  */
  it("ignores the collection clock entirely when nothing was collected", () => {
    const due = deletionDueAt({ collectedAt: undefined, completedAt: ago(60) }, 30, 90);
    expect(daysUntil(due)).toBe(30);
  });

  /*
    8.9.38 — a negative count is kept, not clamped. A stopped cron reading
    "0 days to deletion" forever is indistinguishable from one merely due today.
  */
  it("8.9.38 goes negative when the sweep is behind", () => {
    const due = deletionDueAt({ collectedAt: ago(120), completedAt: ago(120) }, 30, 90);
    expect(daysUntil(due)).toBeLessThan(0);
  });

  it("8.9.41 has nothing to count once there is no date", () => {
    expect(daysUntil(null)).toBeNull();
  });
});
