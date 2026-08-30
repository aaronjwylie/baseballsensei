"use server";

import { requireRole } from "@/domains/account";
import { releaseAssignments } from "@/domains/submission";
import { storage, coachImageKey } from "@/shared/storage";
import {
  FOCUS_OPTIONS,
  LANGUAGE_CHOICES,
  languagesForChoice,
  type Focus,
  type LanguageChoice,
} from "@/domains/submission";
import { type Role } from "../model/operatorRoleEnum";
import {
  DEFAULT_LANGUAGE_CHOICE,
  TRANSLATOR_DIRECTIONS,
  type TranslatorDirection,
} from "../model/operatorProfile";
import {
  grantRole,
  grantsFor,
  isEligibleAdmin,
  otherActiveAdminExists,
  revokeRole,
  setGrantActive,
  setRoleSettings,
  type RoleGrant,
} from "./operatorRoleApi";
import { revalidateOperatorPages } from "./operatorPages";

/**
 * One role, saved by itself.
 *
 * ── Why per role rather than all three together ─────────────────────────────
 *
 * The previous form submitted every role as a set, and `setGrants` deleted any
 * role absent from what arrived. That made a stale or partial submission
 * *destructive*: a form which had drifted by a single checkbox removed the two
 * roles it forgot to mention. It is also what made the QA 4.7 chase costly —
 * the damage was never in the save that went wrong, but in the next one.
 *
 * A card that owns one role cannot express "and remove the others". The blast
 * radius of a bad save is the role you were editing, which is the role you were
 * looking at.
 *
 * ── Why membership and settings save together ───────────────────────────────
 *
 * They are the same decision from the operator's side: "make them a coach who
 * reads Japanese and covers Hitting" is one thought and should be one button.
 * The half-applied state — a coach with no languages, briefly assignable to
 * work they cannot read — is worth not having.
 */
export type RoleCardState =
  | { error: string; grant?: undefined }
  | { error?: undefined; grant: RoleGrant | null }
  | undefined;

const isLanguageChoice = (value: string): value is LanguageChoice =>
  (LANGUAGE_CHOICES as readonly string[]).includes(value);
const isTranslatorDirection = (value: string): value is TranslatorDirection =>
  (TRANSLATOR_DIRECTIONS as readonly string[]).includes(value);

const isFocus = (value: string): value is Focus =>
  (FOCUS_OPTIONS as readonly string[]).includes(value);

export async function saveRoleAction(
  operatorId: string,
  role: Role,
  formData: FormData,
): Promise<RoleCardState> {
  const session = await requireRole("admin");
  if (!operatorId) return { error: "No operator was named — reload and try again." };

  const held = formData.get("held") !== null;

  /*
    Never strip the last admin. Checked before anything is written, and only
    when this save would actually remove it — a zero-admin state has no in-app
    recovery, only a database re-seed.
  */
  if (
    role === "admin" &&
    !held &&
    (await isEligibleAdmin(operatorId)) &&
    !(await otherActiveAdminExists(operatorId))
  ) {
    return {
      error:
        "This is the only active admin — grant admin to someone else before removing it, or the portal locks everyone out.",
    };
  }

  if (!held) {
    await revokeRole(operatorId, role);
    /*
      A revoked role takes its holder off the work it owed — the submissions go
      back to the queue for an admin to reassign. Without this the assignment
      outlives the role, and someone who kept another role could still pull the
      files, because `isAssignedToSubmission` does not re-check the role.

      Carried over from `setRolesAction` (Aaron, #49), which this replaced. A
      pause deliberately does NOT do this: the grant survives, so the work they
      already hold is still theirs to finish.
    */
    await releaseAssignments(operatorId, [role]);
    revalidateOperatorPages();
    return { grant: null };
  }

  // Idempotent: granting a role someone already holds keeps its `grantedAt`.
  await grantRole(operatorId, role, session.operatorId);

  /*
    A fixed choice from the dropdown, not free text (Ben, QA 5.13.4 / 5.13.6).

    The two roles answer different questions with the same field, so it's parsed
    by role: a coach picks a language set (English / Japanese / both), mapped
    through `languagesForChoice`; a translator picks a *direction*, stored
    verbatim as the grant's single language value — only ever displayed, never
    intersected. A value that isn't one of the offered options (a hand-made
    request) falls back to the safe default rather than being trusted in.
  */
  const langValue = String(formData.get("languages") ?? "").trim();
  const languages =
    role === "coach"
      ? languagesForChoice(
          isLanguageChoice(langValue) ? langValue : DEFAULT_LANGUAGE_CHOICE,
        )
      : isTranslatorDirection(langValue)
        ? [langValue]
        : [];
  const specialties = formData.getAll("specialties").map(String).filter(isFocus);
  /*
    `admin` is available by definition — holding it is being it — so its card
    asks no availability question and the answer is not read from the form.
  */
  const isActive = role === "admin" ? true : formData.get("available") !== null;

  const bioRaw = formData.get("bio");
  const imageUrl = await savePhoto(operatorId, formData);

  await setRoleSettings(operatorId, role, {
    languages,
    specialties,
    ...(bioRaw !== null ? { bio: String(bioRaw).trim() || null } : {}),
    // Absent means "keep the current one", which is what an empty file input
    // means to the person who left it alone.
    ...(imageUrl ? { imageUrl } : {}),
  });
  await setGrantActive(operatorId, role, isActive);

  revalidateOperatorPages();
  const grants = await grantsFor(operatorId);
  return { grant: grants.find((g) => g.role === role) ?? null };
}

/** Save an uploaded photo, returning its locator — or null if none was chosen. */
async function savePhoto(id: string, formData: FormData): Promise<string | null> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return storage.save(
    coachImageKey(id, file.name),
    bytes,
    file.type || "application/octet-stream",
  );
}
