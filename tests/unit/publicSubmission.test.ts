import { describe, it, expect } from "vitest";
import { toPublicSubmission } from "@/domains/submission/model/publicSubmission";
import type { Submission } from "@/domains/submission/model/submission";

// A submission whose internal fields are distinctive strings, so a leak into the
// public projection is a substring the test can catch.
function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "SECRET-internal-uuid",
    customerEmail: "SECRET-parent@example.com",
    playerName: "Player One",
    status: "new",
    internalNotes: "SECRET-ops-note",
    stripePaymentId: "SECRET-pi_123",
    feedbackUrl: "SECRET-blob://locator",
    ...overrides,
  } as Submission;
}

describe("toPublicSubmission is a safe projection", () => {
  it("carries none of the internal fields — id, email, notes, Stripe, locators", () => {
    const pub = toPublicSubmission(submission({ status: "complete" }));
    const json = JSON.stringify(pub);
    for (const secret of [
      "SECRET-internal-uuid",
      "SECRET-parent@example.com",
      "SECRET-ops-note",
      "SECRET-pi_123",
      "SECRET-blob://locator",
    ]) {
      expect(json).not.toContain(secret);
    }
    // Structurally: the id and email keys are simply not there.
    expect("id" in pub).toBe(false);
    expect("customerEmail" in pub).toBe(false);
  });

  it("hasFeedback follows isReleased, not 'status === complete'", () => {
    expect(toPublicSubmission(submission({ status: "awaiting_approval" })).hasFeedback).toBe(false);
    expect(toPublicSubmission(submission({ status: "complete" })).hasFeedback).toBe(true);
    // Collecting must keep it readable, not revoke it.
    expect(toPublicSubmission(submission({ status: "collected" })).hasFeedback).toBe(true);
  });

  it("passes through what a customer is meant to see", () => {
    const pub = toPublicSubmission(submission({ playerName: "Aki", focus: "Hitting" }));
    expect(pub.playerName).toBe("Aki");
    expect(pub.focus).toBe("Hitting");
  });
});
