import { describe, expect, it, vi, beforeEach } from "vitest";
import { sendCustomerCollectedEmail } from "@/domains/feedback/api/feedbackEmail";

/**
 * QA 1.2.14 / 1.2.25 — the two rules that only show when something goes wrong.
 */
const calls: string[] = [];
vi.mock("@/domains/contact/api/contactEmail", () => ({
  sendContactMessage: async () => {
    calls.push("admins");
    return { ok: true };
  },
  // The courtesy fails. The form must not notice.
  sendContactReceipt: async () => {
    calls.push("receipt");
    return { ok: false, error: "Resend 500" };
  },
}));

const { sendContactAction } = await import("@/domains/contact/api/contactActions");

const form = {
  firstName: "Norman",
  lastName: "Norms",
  email: "norman@example.com",
  message: "Do you review from side-on footage?",
  consent: true,
};

beforeEach(() => (calls.length = 0));

describe("1.2.14 — a failed receipt cannot fail the form", () => {
  it("still succeeds, and only after the admins were told", async () => {
    const result = await sendContactAction(form);
    expect(result.ok).toBe(true);
    // Order is the design: the courtesy runs after the send that matters, so a
    // failure here costs a receipt and nothing else.
    expect(calls).toEqual(["admins", "receipt"]);
  });

  /*
    The opposite case, to prove the first is a decision and not an accident: the
    send that IS the work fails the form, because there is no row, no queue and
    no retry — telling someone "we'll be in touch" would be a lie they wait on.
  */
  it("but a failed admin send does fail it", async () => {
    const mod = await import("@/domains/contact/api/contactEmail");
    vi.spyOn(mod, "sendContactMessage").mockResolvedValueOnce({
      ok: false,
      error: "Resend 500",
    });
    const result = await sendContactAction(form);
    expect(result.ok).toBe(false);
  });
});

/*
  1.2.25 — a message addressed to more than one person cannot be written without
  saying where the people went. `@ts-expect-error` is the assertion: if `bcc`
  ever stops being required, this line stops erroring and the line itself
  becomes the error. A test that fails when the guard is removed, without
  needing to run.
*/
describe("1.2.25 — bcc is required, not optional", () => {
  it("will not compile a multi-recipient send that omits it", () => {
    const call = () =>
      // @ts-expect-error — `bcc` is required. If that requirement is ever
      // relaxed this call compiles, the directive becomes unused, and TS2578
      // fails the build. The guard is the error, not the call.
      sendCustomerCollectedEmail({
        to: ["a@example.com", "b@example.com"],
        playerName: "P",
        submissionUrl: "u",
      });
    expect(typeof call).toBe("function");
  });
});
