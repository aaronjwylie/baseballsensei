import { describe, expect, it } from "vitest";
import { deletionDueAt, daysUntil } from "@/domains/submission/model/submission";

/**
 * QA 8.9.37–8.9.42 — the end-of-ladder countdown, and the two clocks under it.
 *
 * The rule is "30 days from collection **or** 90 from delivery, whichever falls
 * later", read forwards. The sweep reads the same rule backwards, so these two
 * have to agree or a submission gets warned about a date that isn't the one it
 * is deleted on.
 */
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

describe("deletionDueAt — the later of the two clocks", () => {
  it("8.9.39 has no date before either clock starts", () => {
    expect(deletionDueAt({ collectedAt: undefined, completedAt: undefined }, 30, 90)).toBeNull();
  });

  it("counts from delivery when only that has happened", () => {
    const due = deletionDueAt({ collectedAt: undefined, completedAt: ago(0) }, 30, 90);
    expect(daysUntil(due)).toBe(90);
  });

  /*
    8.9.42 — the *later*, not the sooner. A submission collected the day it was
    delivered is held for the delivery window, because that is the one that runs
    out last; taking the sooner would delete files the backstop still covers.
  */
  it("8.9.42 takes the later date when both clocks are running", () => {
    const due = deletionDueAt({ collectedAt: ago(0), completedAt: ago(0) }, 30, 90);
    expect(daysUntil(due)).toBe(90);
  });

  it("and it is the collection clock when that one lands later", () => {
    // Delivered 89 days ago, collected today: 30 from now beats 1 from now.
    const due = deletionDueAt({ collectedAt: ago(0), completedAt: ago(89) }, 30, 90);
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
