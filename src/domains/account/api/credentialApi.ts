/**
 * Passwords — **the only file that touches `operator_credential.password_hash`.**
 *
 * That sentence is the point of the file, and it is checkable:
 *
 * ```
 * grep -rn "passwordHash" src/
 * ```
 *
 * should name this file and `credentialTable.ts` and nothing else.
 * Same for `bcrypt`. (`scripts/seed.ts` writes the column directly — it runs
 * against a database with no app in front of it, which is the one situation
 * this boundary is not trying to govern.)
 *
 * ## Everything here is keyed by an operator id
 *
 * **This domain does not know what an email is, or what a role is**, and that
 * is what keeps the graph acyclic: `operator` imports `account`, never the
 * reverse. A flow that starts from an email — logging in, requesting a reset —
 * resolves the id in `operator` first and then arrives here with a secret and
 * an id, which is all this domain has ever needed.
 *
 * ## Why it is its own domain
 *
 * An operator is a person in the business; an account is a capability granted
 * to them. A coach can exist before anyone gives them a login. Those are two
 * nouns, and until 2026-08-06 they shared a table — which is what made this
 * split look impossible twice (`_StructureLaw.md` §5b).
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { credentialTable } from "../model/credentialTable";


/** The one cost factor. A second literal somewhere else is a second policy. */
const COST = 10;

/**
 * How much of the hash a fingerprint carries. Enough that two live hashes
 * cannot collide; short enough that the fingerprint is not itself a hash worth
 * attacking if a reset link leaks.
 */
const FINGERPRINT_LENGTH = 24;



/**
 * Change a password, proving the current one first.
 *
 * False covers both "wrong password" and "no such operator", for the same
 * reason `verifyCredentials` conflates its two failures.
 */
export async function changePassword(
  operatorId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const [row] = await db
    .select({ passwordHash: credentialTable.passwordHash })
    .from(credentialTable)
    .where(eq(credentialTable.operatorId, operatorId))
    .limit(1);
  if (!row) return false;

  const ok = await bcrypt.compare(currentPassword, row.passwordHash);
  if (!ok) return false;

  await setOperatorPassword(operatorId, newPassword);
  return true;
}

/**
 * An opaque marker that changes when the password does.
 *
 * The forgot-password flow binds its emailed link to one of these, which makes
 * the link single-use with no schema change: setting a new password changes the
 * hash, so a spent link no longer matches. It is a slice of the hash — which is
 * exactly why the *slicing* happens here and the caller gets a string it can
 * only compare. Reading a password hash to build a token is a reasonable thing
 * to do and a bad thing to spread.
 *
 * Null if there is no such operator, which the caller must treat as a mismatch
 * rather than a pass.
 */
export async function passwordFingerprint(
  operatorId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ passwordHash: credentialTable.passwordHash })
    .from(credentialTable)
    .where(eq(credentialTable.operatorId, operatorId))
    .limit(1);
  return row ? row.passwordHash.slice(0, FINGERPRINT_LENGTH) : null;
}

/**
 * Set a password outright, with no check of the old one — for an admin
 * resetting a coach's, and for the forgot-password flow.
 *
 * **The authority is the caller's, not the password's**: being an admin, or
 * holding a valid single-use reset token. Both are established before this is
 * reached, which is why it takes an id and asks nothing.
 */
export async function setOperatorPassword(
  operatorId: string,
  newPassword: string,
): Promise<void> {
  /*
    Delegates, because this and `createCredential` are the same write.

    It used to be its own `UPDATE ... WHERE operator_id = $1`, and an UPDATE
    matching no row succeeds having changed nothing. An operator with no
    credential row is a real state — the doc at the top of this file says so,
    and `scripts/seed.ts` produced exactly that for every operator it made after
    migration 0013 — so both reset paths reported success and left the password
    untouched. The person then met "invalid password" using a password they had
    just set, and nothing anywhere recorded a failure.

    Fixing it made the two bodies identical, which is its own hazard: two copies
    of one write is how one of them gets corrected later and the other doesn't,
    which is the shape of the bug this comment is about. So there is one write,
    and two names for the two intents that reach it.
  */
  await writeCredential(operatorId, newPassword);
}

/**
 * Does this secret match? The whole of what a login needs from this domain.
 *
 * Takes an **id**, never an email — resolving an address to a person is
 * `operator`'s job, and keeping it there is what stops the two domains
 * importing each other. False when there is no credential row at all, which is
 * a real state: an operator can exist before anyone gives them a login.
 */
export async function verifyPassword(
  operatorId: string,
  password: string,
): Promise<boolean> {
  const [row] = await db
    .select({ passwordHash: credentialTable.passwordHash })
    .from(credentialTable)
    .where(eq(credentialTable.operatorId, operatorId))
    .limit(1);
  if (!row) return false;
  return bcrypt.compare(password, row.passwordHash);
}

/**
 * Grant someone the ability to sign in.
 *
 * Separate from creating the person, because they are separate acts on separate
 * rows — and the schema can now say what the code always meant.
 */
export async function createCredential(
  operatorId: string,
  password: string,
): Promise<void> {
  await writeCredential(operatorId, password);
}

/**
 * The one write. Hash the secret and put it where the login path reads it,
 * whether or not a row is already there.
 *
 * Private: callers say which of the two things they mean — granting a login or
 * changing a password — and both arrive here.
 */
async function writeCredential(
  operatorId: string,
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, COST);
  await db
    .insert(credentialTable)
    .values({ operatorId, passwordHash })
    .onConflictDoUpdate({
      target: credentialTable.operatorId,
      set: { passwordHash, updatedAt: new Date() },
    });
}
