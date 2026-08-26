/**
 * Seed the operators and some sample data for local dev.
 *
 * The portal has no public signup — the initial admin (Yuta) is created here,
 * plus one coach and a few submissions so the admin queue isn't empty on a
 * fresh checkout. Idempotent: re-running is a no-op once things exist.
 *
 * Admin/coach credentials come from env with dev defaults.
 */
import "./loadEnv";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import {
  operatorTable,
  operatorProfileTable,
  credentialTable,
  operatorRoleGrantTable,
  submissionTable,
} from "@/db/schema";
import { createSubmission } from "@/domains/submission";
import { storeUploadedFile } from "@/domains/upload";

/**
 * Create an operator who can actually sign in.
 *
 * **Three rows, not one.** Until 2026-08-15 this wrote a single `operator` row
 * carrying `password_hash` and `role`, which is where both of those lived when
 * it was written. Migration 0013 moved the hash to `operator_credential` and
 * 0015 moved the role to `operator_role_grant`; each backfilled the rows that
 * existed at the time, so everyone seeded *before* them kept working and the
 * seed looked fine. Every operator seeded *after* them got a row the login path
 * does not read: `verifyCredentials` found no credential and returned null, so
 * a fresh admin met "invalid password" with the password they had just seeded.
 *
 * It writes through the same tables the app does rather than calling
 * `createOperator`, because the seed's job is to be runnable against a bare
 * database — but the shape it writes has to match, and that is what broke.
 */
async function ensureUser(
  email: string,
  password: string,
  role: "admin" | "coach",
  name: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: operatorTable.id })
    .from(operatorTable)
    .where(eq(operatorTable.email, email))
    .limit(1);
  if (existing[0]) {
    // Idempotent, and self-repairing: an operator seeded by the old shape is
    // missing the two rows below, and re-running the seed should fix them
    // rather than report "exists" over a login that does not work.
    await grantAccess(existing[0].id, role, password);
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(operatorTable)
    .values({ email, name })
    .returning({ id: operatorTable.id });
  await grantAccess(row.id, role, password);
  return { id: row.id, created: true };
}

/** The credential and the role grant — the two rows the login path reads. */
async function grantAccess(
  operatorId: string,
  role: "admin" | "coach",
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .insert(credentialTable)
    .values({ operatorId, passwordHash })
    .onConflictDoNothing();
  await db
    .insert(operatorRoleGrantTable)
    .values({ operatorId, role })
    .onConflictDoNothing();
}

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "yuta@example.com").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "changeme123";
  const admin = await ensureUser(adminEmail, adminPassword, "admin", "Admin");
  console.log(`[seed] admin ${adminEmail} ${admin.created ? "created" : "exists"}`);

  // The admin is always seeded. The sample coach + submissions are dev-only
  // fixtures — never pollute a production database with them.
  if (process.env.SEED_SAMPLES !== "1") {
    console.log("[seed] SEED_SAMPLES != 1 — admin only, skipping sample data");
    if (admin.created && !process.env.SEED_ADMIN_PASSWORD) {
      console.log(`[seed] default password is "${adminPassword}" — change it after first login`);
    }
    return;
  }

  /*
    One coach per language shape, because translation need is the intersection
    of the coach's languages with the customer's and each shape takes a
    different route through the ladder:

      bilingual  — shares a language with anyone, never translates
      Japanese   — translates for the English-reading parent this platform
                   mostly serves, and skips it for a Japanese-reading one
      English    — the mirror

    The bilingual case is the one worth seeding deliberately. A rule written as
    "do the sets match?" rather than "do they overlap?" passes both single-
    language coaches and fails only here.
  */
  const sampleCoaches = [
    { email: "coach@example.com", name: "Coach Tanaka", languages: ["English", "Japanese"], specialties: ["Hitting", "Pitching"] },
    { email: "coach.jp@example.com", name: "Coach Mori", languages: ["Japanese"], specialties: ["Pitching"] },
    { email: "coach.en@example.com", name: "Coach Reed", languages: ["English"], specialties: ["Hitting", "Fielding"] },
  ] as const;

  for (const c of sampleCoaches) {
    const user = await ensureUser(c.email, "changeme123", "coach", c.name);
    if (user.created) {
      await db.insert(operatorProfileTable).values({
        operatorId: user.id,
        specialties: [...c.specialties],
        languages: [...c.languages],
      });
    }
    console.log(
      `[seed] coach ${c.email} (${c.languages.join("+")}) ${user.created ? "created" : "exists"}`,
    );
  }

  const [{ n }] = await db.select({ n: count() }).from(submissionTable);
  if (n === 0) {
    // Mid-flow: verified and uploaded, but not paid. Shows what the retention
    // sweep's "abandoned" rule is there to clean up.
    await createSubmission({
      customerEmail: "parent1@example.com",
      playerName: "Alex Tanaka",
      playerAge: 14,
      focus: "Hitting",
      customerNotes: "Trying to fix an early bat drop on inside pitches.",
      status: "awaiting_payment",
    });

    // Paid, with two real placeholder files so the portal's Download links
    // work end to end.
    const paid = await createSubmission({
      customerEmail: "parent2@example.com",
      playerName: "Sam Rivera",
      playerAge: 12,
      focus: "Pitching",
      status: "new",
      stripePaymentId: "pi_seed_2",
      stripeAmount: 8000,
    });
    await storeUploadedFile(
      paid.id,
      "bullpen-side.mp4",
      new TextEncoder().encode("seed placeholder video"),
      "video/mp4",
    );
    await storeUploadedFile(
      paid.id,
      "release-point.png",
      new TextEncoder().encode("seed placeholder image"),
      "image/png",
    );

    await createSubmission({
      customerEmail: "parent3@example.com",
      playerName: "Jordan Lee",
      playerAge: 16,
      focus: "Fielding",
      status: "complete",
      stripePaymentId: "pi_seed_3",
      stripeAmount: 8000,
    });

    console.log("[seed] created 3 sample submissions");
  } else {
    console.log(`[seed] ${n} submissions already present — skipping samples`);
  }

  if (admin.created && !process.env.SEED_ADMIN_PASSWORD) {
    console.log(`[seed] default password is "${adminPassword}" — change it after first login`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
