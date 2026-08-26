import { describe, it, expect } from "vitest";
// Model file, not the domain barrel — the barrel re-exports DB code; the model
// is the pure layer these tests exist to lock down.
import {
  SUBMISSION_STATUSES,
  PAID_STATUSES,
  RUNG_LABEL,
  isPaid,
  isReleased,
  hasResponse,
  whoseCourt,
  numberedRungLabel,
  type SubmissionStatus,
} from "@/domains/submission/model/submission";

const at = (status: SubmissionStatus) => ({ status });

describe("ladder predicates", () => {
  it("isPaid is false before payment, true from 'new' onward", () => {
    expect(isPaid(at("draft"))).toBe(false);
    expect(isPaid(at("awaiting_payment"))).toBe(false);
    expect(isPaid(at("new"))).toBe(true);
    // The regression that started this: a paid submission on the admin's desk
    // must not read as unpaid.
    expect(isPaid(at("awaiting_approval"))).toBe(true);
    expect(isPaid(at("purged"))).toBe(true);
  });

  it("PAID_STATUSES agrees with isPaid across the whole ladder", () => {
    for (const s of SUBMISSION_STATUSES) {
      expect(PAID_STATUSES.includes(s)).toBe(isPaid(at(s)));
    }
  });

  it("isReleased is NOT 'status === complete' — collecting must not revoke access", () => {
    expect(isReleased(at("awaiting_approval"))).toBe(false);
    expect(isReleased(at("feedback_translated"))).toBe(false);
    expect(isReleased(at("complete"))).toBe(true);
    expect(isReleased(at("collected"))).toBe(true); // the exact bug
    expect(isReleased(at("purged"))).toBe(true); // released is permission, not availability
  });

  it("hasResponse is true from awaiting_approval, false before", () => {
    expect(hasResponse(at("in_review"))).toBe(false);
    expect(hasResponse(at("awaiting_approval"))).toBe(true);
    expect(hasResponse(at("complete"))).toBe(true);
  });
});

describe("ladder predicates are monotone suffixes", () => {
  // Each of these becomes true at some rung and stays true. A gap — true, then
  // false, then true again — would mean a status silently losing a property a
  // later one has, which is exactly how isPaid's earlier list-form broke.
  const isSuffix = (p: (s: { status: SubmissionStatus }) => boolean): boolean => {
    const flags = SUBMISSION_STATUSES.map((s) => p(at(s)));
    const first = flags.indexOf(true);
    return first === -1 || flags.slice(first).every(Boolean);
  };

  it("isPaid, isReleased, and hasResponse never flip back off", () => {
    expect(isSuffix(isPaid)).toBe(true);
    expect(isSuffix(isReleased)).toBe(true);
    expect(isSuffix(hasResponse)).toBe(true);
  });
});

describe("court and labels are total over the ladder", () => {
  it("whoseCourt returns a valid court for every status", () => {
    const courts = new Set(["customer", "admin", "coach", "translator", "system"]);
    for (const s of SUBMISSION_STATUSES) {
      expect(courts.has(whoseCourt(at(s)))).toBe(true);
    }
  });

  it("every status has a rung label, and the numbered label carries its position", () => {
    for (const s of SUBMISSION_STATUSES) expect(RUNG_LABEL[s]).toBeTruthy();
    const i = SUBMISSION_STATUSES.indexOf("new");
    expect(numberedRungLabel("new")).toBe(`${i + 1} · ${RUNG_LABEL.new}`);
  });
});
