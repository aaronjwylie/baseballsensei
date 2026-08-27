"use server";
/**
 * The form verbs shared by every role that can be given work.
 *
 * Creating a coach and creating a translator are the same act with a different
 * `role`: the same fields, the same validation, the same photo handling, the
 * same duplicate-email failure. Both used to live in `coachActions.ts`, which
 * meant a translator form could only ever have been a wrapper around a coach
 * action — the shape `_StructureLaw.md` §3b exists to refuse.
 *
 * **The role reaches the copy, not just the query.** Error messages say "coach"
 * or "translator" because an admin reading *"Could not create the coach"* after
 * submitting the translator form learns the wrong thing about what failed.
 *
 * Admin-only. The guard is re-checked here rather than trusted from the UI,
 * because a Server Action is a public endpoint with a nice-looking call site.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/domains/account";
import { storage, coachImageKey } from "@/shared/storage";
import { FOCUS_OPTIONS, type Focus } from "@/domains/submission";
import {
  languagesForChoice,
  readLanguageChoice,
} from "@/domains/submission";
import { DEFAULT_LANGUAGE_CHOICE } from "../model/operatorProfile";
import {
  createProfiledOperator,
  updateProfiledOperator,
  getByRole,
} from "./operatorProfileApi";
import { isEligibleAdmin, otherActiveAdminExists } from "./operatorRoleApi";
import type { Role } from "../model/operatorRoleEnum";

export type OperatorProfileFormState = { error: string } | { ok: true } | undefined;

function isFocus(value: string): value is Focus {
  return (FOCUS_OPTIONS as readonly string[]).includes(value);
}

/**
 * Save an uploaded photo, returning its locator — or null if none was chosen.
 * Optional on both forms, for both roles.
 */
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

/** Which pages show this role, so a save is reflected without a hard reload. */
function pathsFor(role: Role, id?: string): string[] {
  const kind = role === "coach" ? "coaches" : `${role}s`;
  const roots = ["all", kind].map((k) => `/admin/operators/${k}`);
  return id ? [...roots, ...roots.map((r) => `${r}/${id}`)] : roots;
}

export async function createProfiledOperatorAction(
  role: Role,
  _prev: OperatorProfileFormState,
  formData: FormData,
): Promise<OperatorProfileFormState> {
  await requireRole("admin");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const specialties = formData.getAll("specialties").map(String).filter(isFocus);
  const languages = languagesForChoice(
    readLanguageChoice(formData.get("languages"), DEFAULT_LANGUAGE_CHOICE),
  );
  const bio = String(formData.get("bio") ?? "").trim();

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return { error: "Enter a name, a valid email, and a password of at least 8 characters." };
  }

  let id: string;
  try {
    const created = await createProfiledOperator(role, {
      name, email, password, specialties, languages, bio,
    });
    id = created.id;
  } catch {
    return { error: `Could not create the ${role} — is that email already in use?` };
  }

  // The photo needs the new id, so it is saved after creation. A photo failure
  // is not fatal — the person exists and it can be added on the edit form.
  try {
    const imageUrl = await savePhoto(id, formData);
    if (imageUrl) await updateProfiledOperator(id, role, { imageUrl });
  } catch (err) {
    console.error(`[${role} create] photo failed:`, err);
  }

  for (const path of pathsFor(role)) revalidatePath(path);
  return { ok: true };
}

export async function updateProfiledOperatorAction(
  role: Role,
  _prev: OperatorProfileFormState,
  formData: FormData,
): Promise<OperatorProfileFormState> {
  await requireRole("admin");

  const id = String(formData.get("operatorId") ?? formData.get("coachId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const specialties = formData.getAll("specialties").map(String).filter(isFocus);
  const languages = languagesForChoice(
    readLanguageChoice(formData.get("languages"), DEFAULT_LANGUAGE_CHOICE),
  );
  // The edit form has no "active" toggle, so an absent field must mean "leave it
  // as it is", not "deactivate". Reading it as `=== "on"` set isActive=false on
  // every save — which, now that login enforces `operator.isActive`, silently
  // locked operators out. Only touch it when the form actually carries it.
  const activeField = formData.get("isActive");
  const password = String(formData.get("password") ?? "");
  const bio = String(formData.get("bio") ?? "").trim();

  if (!id || !name) return { error: "A name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password && password.length < 8) {
    return { error: "A new password must be at least 8 characters (or leave it blank)." };
  }

  // Deactivating an account blocks its login (loginApi enforces `isActive`), so
  // deactivating the only eligible admin is a lockout by another door. Refuse it
  // for the same reason `setRolesAction` refuses stripping the admin grant.
  if (
    activeField !== null &&
    activeField !== "on" &&
    (await isEligibleAdmin(id)) &&
    !(await otherActiveAdminExists(id))
  ) {
    return {
      error:
        "This is the only active admin — you can't deactivate them. Grant admin to someone else first.",
    };
  }

  // A new photo replaces the old one; the old object is removed so it does not
  // orphan in storage.
  let imageUrl: string | undefined;
  try {
    const url = await savePhoto(id, formData);
    if (url) {
      imageUrl = url;
      const existing = await getByRole(id, role);
      if (existing?.imageUrl) void storage.remove(existing.imageUrl).catch(() => {});
    }
  } catch (err) {
    console.error(`[${role} edit] photo failed:`, err);
    return { error: "Could not save the photo. Please try again." };
  }

  try {
    await updateProfiledOperator(id, role, {
      name, email, specialties, languages, bio,
      ...(activeField !== null ? { isActive: activeField === "on" } : {}),
      ...(password ? { password } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    });
  } catch {
    return { error: `Could not update the ${role} — is that email already in use?` };
  }

  for (const path of pathsFor(role, id)) revalidatePath(path);
  return { ok: true };
}
