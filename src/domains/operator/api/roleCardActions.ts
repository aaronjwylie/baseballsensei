"use server";

import { requireRole } from "@/domains/account";
import { storage, coachImageKey } from "@/shared/storage";
import { FOCUS_OPTIONS, type Focus } from "@/domains/submission";
import { type Role } from "../model/operatorRoleEnum";
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
    revalidateOperatorPages();
    return { grant: null };
  }

  // Idempotent: granting a role someone already holds keeps its `grantedAt`.
  await grantRole(operatorId, role, session.operatorId);

  /*
    One free-text field, split on commas, rather than a fixed set of tickboxes.

    The languages a coach reads are not a closed list the way the coaching
    focuses are — the roster already spans English and Japanese and will not
    stop there, and a dropdown of two would have to be edited in code every time
    someone is hired. Trimmed and de-duplicated so "English, english " is one
    language rather than two.
  */
  const languages = [
    ...new Set(
      String(formData.get("languages") ?? "")
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ];
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
