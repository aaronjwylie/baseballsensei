/**
 * The forgot-password flow — **account logic, not operator logic.**
 *
 * The reset link carries a signed token bound to the current password hash, so
 * it is **single-use without a schema change**: setting a new password changes
 * the hash, and the spent token's binding no longer matches. Short-lived (one
 * hour), and signed with AUTH_SECRET like the session, so it cannot be forged.
 *
 * ## Why it lives here now — 2026-08-06
 *
 * It sat in `operator` because `requestPasswordReset` starts from an email, and
 * emails are an operator fact. That was a **kind-3 placement** by
 * `_StructureLaw.md` §3c — nothing broke either way, the hash was already
 * contained, and the honest question was only *where would someone look for
 * this*. Under "account", which is what this is.
 *
 * The email lookup reads `operatorTable` at the declaration plane rather than
 * through `operator`'s barrel; see the comment at the call site for why that is
 * the sanctioned route rather than a shortcut.
 */
import { signSession, verifySessionToken } from "@/shared/auth/token";
import { env } from "@/shared/config/env";
import { eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { operatorTable } from "@/domains/operator/model/operatorTable";
import { passwordFingerprint, setOperatorPassword } from "./credentialApi";
import { sendPasswordResetEmail } from "./passwordResetEmail";

const PURPOSE = "pwreset";

interface ResetPayload {
  sub: string;
  ph: string;
  purpose: string;
}

/**
 * Email a reset link if the address belongs to an operator. Resolves the same
 * way whether or not it does, so a caller can never learn which addresses have
 * accounts.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  /*
    Read straight off the declaration rather than through `operator`'s barrel.

    That is what keeps this whole flow here: an api-level call would make
    `account` import `operator`, and `operator` already imports `account` — the
    cycle `check:structure` forbids. A table is reached at the declaration plane
    uniformly, whoever is asking (`_StructureLaw` §5.7), so this is the
    sanctioned way for a lower domain to answer "which operator is this?".

    It reads one column set and nothing else, which is all authentication has
    ever needed to know about a person.
  */
  const [operator] = await db
    .select({ id: operatorTable.id })
    .from(operatorTable)
    .where(eq(operatorTable.email, clean))
    .limit(1);
  if (!operator) return;

  const fingerprint = await passwordFingerprint(operator.id);
  if (!fingerprint) return;

  const token = await signSession(
    // One hour by default; `PASSWORD_RESET_TTL_S` can shorten it in a test env
    // to walk the expired-link path by hand (QA 4.12).
    { sub: operator.id, ph: fingerprint, purpose: PURPOSE },
    env.passwordResetTtlS,
  );
  const link = `${env.siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(clean, link);
}

export type ResetOutcome = { ok: true } | { ok: false; error: string };

const STALE =
  "This reset link is invalid, already used, or expired. Request a new one.";

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<ResetOutcome> {
  const payload = await verifySessionToken<ResetPayload>(token);
  if (!payload || payload.purpose !== PURPOSE) return { ok: false, error: STALE };

  // A mismatch means the password already changed since the link was issued —
  // the link is single-use and this one is spent. A missing operator lands in
  // the same branch, which is the safe direction for a null to fall.
  const fingerprint = await passwordFingerprint(payload.sub);
  if (fingerprint !== payload.ph) return { ok: false, error: STALE };

  await setOperatorPassword(payload.sub, newPassword);
  return { ok: true };
}
