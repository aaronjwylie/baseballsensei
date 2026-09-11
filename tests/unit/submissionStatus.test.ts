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
  isWithCoach,
  isHandedToCoach,
  isHandedOverFor,
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

  /*
    The read gate is monotone too, and that is the whole reason it is a separate
    predicate from the write gates: once the admin has handed work over, the
    person it went to may always reopen it. A gate that closed again would take
    a coach's own finished review away from them the moment the admin approved
    it — which is the `status === "complete"` mistake, one role over.
  */
  it("isHandedOverFor never flips back off, for any kind", () => {
    for (const kind of [
      "feedback",
      "intake_translation",
      "feedback_translation",
    ] as const) {
      expect(isSuffix((s) => isHandedOverFor(s, kind))).toBe(true);
    }
  });
});

/**
 * QA 6.18 — assignment is not hand-off.
 *
 * Every door was asking "are they assigned", which is true from the moment the
 * admin picks someone. These pin the gap between picking and sending, on both
 * sides of it (Ben, 2026-09-11).
 */
describe("6.18 — picked is not sent", () => {
  const PICKED_NOT_SENT = [
    "assigned",
    "intake_translator_assigned",
    "sent_to_intake_translator",
    "intake_translating",
    "intake_translated",
  ] as const;

  it("the row is the coach's from `assigned`, the work is not", () => {
    for (const status of PICKED_NOT_SENT) {
      expect(isWithCoach(at(status))).toBe(true);
      expect(isHandedToCoach(at(status))).toBe(false);
    }
  });

  it("the coach's turn opens at sent_to_coach and closes at the hand-back", () => {
    const theirTurn = (status: SubmissionStatus) =>
      isWithCoach(at(status)) && isHandedToCoach(at(status));
    expect(SUBMISSION_STATUSES.filter(theirTurn)).toEqual([
      "sent_to_coach",
      "in_review",
    ]);
  });

  it("a translator's leg is not handed over at its own picked rung", () => {
    expect(
      isHandedOverFor(at("intake_translator_assigned"), "intake_translation"),
    ).toBe(false);
    expect(
      isHandedOverFor(at("sent_to_intake_translator"), "intake_translation"),
    ).toBe(true);
    expect(
      isHandedOverFor(at("feedback_translator_assigned"), "feedback_translation"),
    ).toBe(false);
    expect(
      isHandedOverFor(at("sent_to_feedback_translator"), "feedback_translation"),
    ).toBe(true);
  });

  /*
    Nobody is ever assigned to produce the customer's own uploads, so the kind
    that can't be assigned can never open a door.
  */
  it("intake is never handed over to anybody", () => {
    for (const status of SUBMISSION_STATUSES) {
      expect(isHandedOverFor(at(status), "intake")).toBe(false);
    }
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
