/**
 * Coaches — the reviewers in Japan.
 *
 * A coach is an **operator with a profile** (ADR 018), which is a shape
 * `translatorApi` also has. Everything both roles share lives in
 * `operatorProfileApi`; what is left here is only what is a *coach's* alone.
 *
 * **This file used to hold the shared machinery**, which made `translatorApi` a
 * wrapper around coach functions and stated a hierarchy between two peers that
 * does not exist. `_StructureLaw.md` §3b — the third file, not the thin
 * wrapper. Read the two files side by side: they should be about the same size,
 * and §3a says so out loud.
 */
import { listAssignable, getByRole, createProfiledOperator, updateProfiledOperator } from "./operatorProfileApi";
import { listAdminEmails } from "./operatorApi";
import { isAssignedTo, markCoachCollected, noteEmailSent } from "@/domains/submission";
import { env } from "@/shared/config/env";
import { sendCollectedEmail } from "./handoffEmail";
import type { OperatorProfile, NewOperatorProfile } from "../model/operatorProfile";
import type { OperatorProfilePatch } from "./operatorProfileApi";

export function listCoaches(): Promise<OperatorProfile[]> {
  // Assignable, not merely holding the role — a paused coach is off this
  // list and still on the admin's roster.
  return listAssignable("coach");
}

export function getCoach(id: string): Promise<OperatorProfile | null> {
  return getByRole(id, "coach");
}

/**
 * Kept for the callers that hold a session's operator id.
 *
 * It is the same lookup — an `OperatorProfile.id` *is* the operator id — but the
 * name still says which id the caller has in hand, which is worth more than
 * removing one line.
 */
export function getCoachByOperatorId(operatorId: string): Promise<OperatorProfile | null> {
  return getCoach(operatorId);
}

export function createCoach(input: NewOperatorProfile): Promise<OperatorProfile> {
  return createProfiledOperator("coach", input);
}

export function updateCoach(
  id: string,
  patch: OperatorProfilePatch,
): Promise<OperatorProfile> {
  return updateProfiledOperator(id, "coach", patch);
}

/**
 * Step 9 — the coach has collected the intake. Stamp it and tell the admin.
 *
 * **Coach-specific, and the asymmetry here is real rather than an oversight.**
 * A translator's collection moves a rung too (`markTranslatorCollected`), but
 * announces nothing: the admin is waiting on a *coach* to start, and a
 * translation leg is short enough that a notification per hand-off would be
 * noise. If that stops being true, the counterpart belongs beside this one, not
 * folded into it.
 *
 * **The submission must be this coach's**, not merely any coach's: the download
 * route can only see that *a* coach is logged in, and someone opening a
 * colleague's work must not close a hand-off they aren't part of.
 *
 * Idempotent via `markCoachCollected`, which only moves a submission we actually
 * sent — so a re-download does nothing and the email fires exactly once.
 *
 * Swallows its own failures. It is called without awaiting, from a route whose
 * real job is delivering bytes; a rejected promise there would be an unhandled
 * one, and a notification is never worth a failed download.
 */
export async function noteCoachCollected(
  submissionId: string,
  operatorId: string,
): Promise<void> {
  try {
    if (!(await isAssignedTo(submissionId, operatorId, "feedback"))) return;

    const coach = await getCoachByOperatorId(operatorId);
    if (!coach) return;

    const collected = await markCoachCollected(submissionId);
    if (!collected) return;

    const result = await sendCollectedEmail({
      to: await listAdminEmails(),
      collectorName: coach.name,
      role: "coach",
      playerName: collected.playerName,
      submissionUrl: `${env.siteUrl}/admin`,
    });
    await noteEmailSent(submissionId, "④ picked up → Admin", result);
  } catch (err) {
    console.error("[coach] recording a collection failed:", err);
  }
}
