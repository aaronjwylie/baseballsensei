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
import { requireRole, setOperatorPassword } from "@/domains/account";
import { eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { operatorTable } from "../model/operatorTable";
import { revalidateOperatorPages } from "./operatorPages";
import { storage, coachImageKey } from "@/shared/storage";
import { FOCUS_OPTIONS, type Focus } from "@/domains/submission";
import {
  LANGUAGE_CHOICES,
  languagesForChoice,
  readLanguageChoice,
  type LanguageChoice,
} from "@/domains/submission";
import {
  DEFAULT_LANGUAGE_CHOICE,
  TRANSLATOR_DIRECTIONS,
  type TranslatorDirection,
} from "../model/operatorProfile";
import {
  createProfiledOperator,
  updateProfiledOperator,
  deleteOperator,
  getByRole,
} from "./operatorProfileApi";
import { isEligibleAdmin, otherActiveAdminExists } from "./operatorRoleApi";
import { ROLES, type Role } from "../model/operatorRoleEnum";
import { redirect } from "next/navigation";

export type OperatorProfileFormState = { error: string } | { ok: true } | undefined;

/** Guards the `role` field on a form whose page did not bind one. */
const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

function isFocus(value: string): value is Focus {
  return (FOCUS_OPTIONS as readonly string[]).includes(value);
}

const isLanguageChoice = (value: string): value is LanguageChoice =>
  (LANGUAGE_CHOICES as readonly string[]).includes(value);
const isTranslatorDirection = (value: string): value is TranslatorDirection =>
  (TRANSLATOR_DIRECTIONS as readonly string[]).includes(value);

/**
 * The languages field, parsed by role — the same split the edit card's
 * `saveRoleAction` makes (Ben, QA 5.13.4). A coach picks a language set, mapped
 * through `languagesForChoice`; a translator picks a *direction*, stored
 * verbatim as its single value; an admin has none. A value that isn't one of the
 * offered options falls back to the safe default rather than being trusted in.
 */
function languagesFromForm(role: Role, formData: FormData): string[] {
  const value = String(formData.get("languages") ?? "").trim();
  if (role === "coach") {
    return languagesForChoice(
      isLanguageChoice(value) ? value : DEFAULT_LANGUAGE_CHOICE,
    );
  }
  if (role === "translator") {
    return isTranslatorDirection(value) ? [value] : [];
  }
  return [];
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

export async function createProfiledOperatorAction(
  /**
   * The kind to create when the page already knows it — the Coaches tab makes
   * coaches. Pass `null` from a page that does not, and the form says which
   * through a `role` field instead.
   *
   * Reading it from the form rather than always binding it is what the "All"
   * tab needed: it had no kind to bind, fell back to "admin", and so offered
   * admin's fields and silently created admins whatever the operator meant.
   */
  bound: Role | null,
  _prev: OperatorProfileFormState,
  formData: FormData,
): Promise<OperatorProfileFormState> {
  await requireRole("admin");

  const asked = String(formData.get("role") ?? "");
  const role: Role = bound ?? (isRole(asked) ? asked : "coach");
  /*
    A bound page wins over the form. Trusting the field on a page that already
    knows its kind would let a stale or hand-made request create a role the
    operator never chose — and there is no reason for the two to disagree.

    Where nothing is bound, the field is validated against ROLES rather than
    cast. An admin may create any kind anyway, so this is about not writing a
    nonsense value, not about privilege.
  */

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const specialties = formData.getAll("specialties").map(String).filter(isFocus);
  const languages = languagesFromForm(role, formData);
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

  revalidateOperatorPages();
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
  // for the same reason `saveRoleAction` refuses stripping the admin grant.
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

  revalidateOperatorPages();
  return { ok: true };
}

/**
 * Change who someone is — name, email, password. **No role involved.**
 *
 * Split from `updateProfiledOperatorAction` on 2026-08-30, after that one broke
 * this exact case. It takes a `Role` because it once edited role settings too,
 * and the identity form had nothing meaningful to pass, so it passed "admin".
 * Harmless until the same rebuild made the function read its result back
 * through that role — at which point saving a COACH's password wrote the
 * password, then failed reading a coach back as an admin, and told the operator
 * "Could not update the admin". The change had landed; the page said it had not.
 *
 * A dummy argument is a lie the type system cannot see. Identity does not have
 * a role, so this does not take one.
 */
/**
 * Delete an operator outright (Ben, QA 5.13.11).
 *
 * Two walls, both about keeping a way in:
 * - **Never the last admin.** Deleting the only one is a lockout with no in-app
 *   recovery, the same reason `saveRoleAction` refuses stripping the last admin
 *   grant — and the reason we never let the platform reach zero admins.
 * - **Never your own account.** Too easy to strand yourself mid-session, and
 *   there is always another admin to do it deliberately.
 *
 * On success it redirects to the roster — the page it deleted no longer exists.
 */
export async function deleteOperatorAction(
  _prev: OperatorProfileFormState,
  formData: FormData,
): Promise<OperatorProfileFormState> {
  const session = await requireRole("admin");

  const id = String(formData.get("operatorId") ?? "");
  if (!id) return { error: "No operator — reload the page and try again." };

  if (id === session.operatorId) {
    return {
      error: "You can't delete your own account — ask another admin to.",
    };
  }

  if ((await isEligibleAdmin(id)) && !(await otherActiveAdminExists(id))) {
    return {
      error:
        "This is the only admin — grant admin to someone else before deleting them, or the platform locks everyone out.",
    };
  }

  await deleteOperator(id);
  revalidateOperatorPages();
  redirect("/admin/operators/all");
}

export async function updateOperatorIdentityAction(
  _prev: OperatorProfileFormState,
  formData: FormData,
): Promise<OperatorProfileFormState> {
  await requireRole("admin");

  const id = String(formData.get("operatorId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!id || !name) return { error: "A name is required." };
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (password && password.length < 8) {
    return { error: "A new password must be at least 8 characters (or leave it blank)." };
  }

  try {
    await db
      .update(operatorTable)
      .set({ name, email })
      .where(eq(operatorTable.id, id));
    // An admin reset — no current-password check; the admin's authority is the
    // guard. Last, so a duplicate-email failure above cannot leave a changed
    // password behind an unchanged name.
    if (password) await setOperatorPassword(id, password);
  } catch {
    // The realistic failure is the unique constraint on email.
    return { error: "Could not save — is that email already in use?" };
  }

  revalidateOperatorPages();
  return { ok: true };
}
