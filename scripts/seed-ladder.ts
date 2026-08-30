/**
 * Seed one submission at every rung of the ladder, for driving the queue.
 *
 * The progress view is only assessable against a queue that actually spreads
 * across the ladder — three samples all sitting at `new` tell you nothing about
 * whether the rail reads at a glance. This builds sixteen, each with the files,
 * the trail and the sends that rung implies, so every state of the widget is on
 * screen at once.
 *
 * **It writes the trail as the app would**, not as a shortcut: the events are
 * inserted rung by rung with plausible timestamps, and the email records carry
 * the same labels the real senders use. A seed that fakes the shape rather than
 * the substance would make the widget look right while proving nothing.
 *
 * Idempotent by prefix: re-running removes what it made and rebuilds it, so it
 * can't silt up a database over a day of iterating.
 *
 * Usage: `npx tsx --tsconfig tsconfig.json scripts/seed-ladder.ts`
 */
import "./loadEnv";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/shared/db";
import {
  submissionTable,
  submissionFileTable,
  submissionEventTable,
  submissionAssignmentTable,
  operatorTable,
  operatorRoleGrantTable,
} from "@/db/schema";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/domains/submission";
import type { FileKind } from "@/domains/submission";

const MARK = "ladder-";
const day = 24 * 3600_000;

/** Which rungs a submission has passed through to be sitting at `status`. */
function pathTo(status: SubmissionStatus): SubmissionStatus[] {
  const all = [...SUBMISSION_STATUSES];
  const end = all.indexOf(status);
  const translating =
    status.startsWith("intake_") ||
    status.startsWith("response_") ||
    end >= all.indexOf("complete");
  return all.slice(0, end + 1).filter((rung) => {
    const optional =
      rung === "intake_translating" || rung === "intake_translated" ||
      rung === "feedback_translating" || rung === "feedback_translated";
    return !optional || translating;
  });
}

/** The messages that have gone out by the time a submission reaches `status`. */
function emailsBy(status: SubmissionStatus): string[] {
  const reached = new Set(pathTo(status));
  const out: string[] = ["① code → customer"];
  if (reached.has("new")) out.push("② receipt → customer", "② arrival → Yuta");
  if (reached.has("sent_to_coach")) out.push("③ hand-off → coach");
  if (reached.has("in_review")) out.push("④ picked up → Yuta");
  if (reached.has("awaiting_approval")) out.push("⑤ response submitted → Yuta + coach");
  if (reached.has("complete")) out.push("⑥ feedback ready → customer");
  if (reached.has("collected")) out.push("⑦ collected → Yuta");
  if (reached.has("resolved")) out.push("⑧ thank you → customer");
  if (reached.has("purge_imminent")) out.push("⑨ deletion warning → customer");
  return out;
}

/** Which folders hold files at this rung. */
function filesAt(status: SubmissionStatus): FileKind[] {
  const reached = new Set(pathTo(status));
  const kinds: FileKind[] = ["intake"];
  if (reached.has("intake_translated")) kinds.push("intake_translation");
  if (reached.has("awaiting_approval")) kinds.push("feedback");
  if (reached.has("feedback_translated")) kinds.push("feedback_translation");
  return kinds;
}

const NAMES = [
  "Kaito Mori", "Sophia Alvarez", "Marcus Bell", "Ana Okafor",
  "Elena Reyes", "Tomás Silva", "Priya Nair", "Jonah Whitfield",
  "Mei Chen", "Diego Ramos", "Aisha Bello", "Lukas Berg",
  "Nina Petrova", "Omar Haddad", "Freya Lund", "Rafael Costa",
];
const FOCUS = ["Hitting", "Pitching", "Fielding", "Catching", "Other"] as const;

async function main() {
  // Clear anything a previous run made, so iterating doesn't silt up the queue.
  const old = await db
    .select({ id: submissionTable.id })
    .from(submissionTable)
    .where(like(submissionTable.customerEmail, `${MARK}%`));
  for (const row of old) {
    await db.delete(submissionTable).where(eq(submissionTable.id, row.id));
  }
  if (old.length) console.log(`[ladder] cleared ${old.length} from a previous run`);

  const coachRows = (
    await db
      .select({
        id: operatorTable.id,
        name: operatorTable.name,
        languages: operatorRoleGrantTable.languages,
      })
      .from(operatorTable)
      .innerJoin(
        operatorRoleGrantTable,
        and(
          eq(operatorRoleGrantTable.operatorId, operatorTable.id),
          // A coach's languages specifically — the same person's translator
          // languages are now a different answer to a different question.
          eq(operatorRoleGrantTable.role, "coach"),
        ),
      )
  );
  if (coachRows.length === 0) {
    console.error("[ladder] no coaches — run `npm run db:seed` first");
    process.exit(1);
  }
  // A coach who reads English and one who doesn't, so the derived translation
  // prompt has something to derive from.
  const enCoach = coachRows.find((c) => c.languages.some((l: string) => /english/i.test(l))) ?? coachRows[0];
  const jaCoach = coachRows.find((c) => !c.languages.some((l: string) => /english/i.test(l))) ?? coachRows[0];

  let made = 0;
  for (const [i, status] of SUBMISSION_STATUSES.entries()) {
    const path = pathTo(status);
    const translating = path.some((r) => r.startsWith("intake_") || r.startsWith("response_"));
    const coach = translating ? jaCoach : enCoach;
    // Space them out so the trail reads like a real week rather than one instant.
    const started = Date.now() - (SUBMISSION_STATUSES.length - i + 2) * day;
    const reached = new Set(path);

    const [row] = await db
      .insert(submissionTable)
      .values({
        customerEmail: `${MARK}${i + 1}@example.com`,
        playerName: NAMES[i],
        playerAge: 12 + (i % 7),
        focus: FOCUS[i % FOCUS.length],
        customerNotes: "Seeded for the progress view.",
        status,
        emailVerifiedAt: new Date(started + 300_000),
        ...(reached.has("new")
          ? { paidAt: new Date(started + 600_000), stripeAmount: 8000, stripePaymentId: `pi_${MARK}${i}` }
          : {}),
        ...(reached.has("sent_to_coach") ? { coachFileSet: translating ? "translation" : "original" } : {}),
        ...(reached.has("complete")
          ? {
              customerFileSet: translating ? "translation" : "original",
              completedAt: new Date(started + 5 * day),
              feedbackEmailedAt: new Date(started + 5 * day),
            }
          : {}),
        ...(reached.has("collected") ? { collectedAt: new Date(started + 6 * day) } : {}),
        ...(reached.has("purge_imminent") ? { deletionWarnedAt: new Date(started + 7 * day) } : {}),
        ...(reached.has("purged") ? { filesPurgedAt: new Date(started + 8 * day) } : {}),
        submittedAt: new Date(started),
        updatedAt: new Date(started + path.length * 3600_000),
      })
      .returning();

    // Assignment is a row of its own now, not a column on the submission
    // (ADR 018) — so a seeded ladder has to write it, or the queue shows every
    // rung from `assigned` onward with nobody holding it.
    if (reached.has("assigned")) {
      await db.insert(submissionAssignmentTable).values({
        submissionId: row.id,
        operatorId: coach.id,
        produces: "feedback",
        assignedAt: new Date(started + 900_000),
      });
    }

    // Files. A purged submission keeps its records and loses its locators —
    // that asymmetry is the whole reason the row survives, so seed it that way.
    const purged = reached.has("purged");
    for (const kind of filesAt(status)) {
      for (let n = 0; n < (kind === "intake" ? 2 : 1); n += 1) {
        await db.insert(submissionFileTable).values({
          submissionId: row.id,
          kind,
          filename: `${kind}-${n + 1}.mp4`,
          contentType: "video/mp4",
          sizeBytes: 40_000_000 + n * 7_000_000,
          fileUrl: purged ? null : `seed/${row.id}/${kind}-${n + 1}.mp4`,
          uploadedAt: new Date(started + 900_000 + n * 60_000),
        });
      }
    }

    // The trail: every rung it passed through, then every message that went.
    for (const [n, rung] of path.entries()) {
      await db.insert(submissionEventTable).values({
        submissionId: row.id,
        kind: "status",
        status: rung,
        at: new Date(started + n * 8 * 3600_000),
        actorId: null,
      });
    }
    for (const [n, label] of emailsBy(status).entries()) {
      // One deliberate failure, so the trail's unhappy path is visible in the
      // queue rather than only in theory.
      const ok = !(i === 6 && label.startsWith("③"));
      await db.insert(submissionEventTable).values({
        submissionId: row.id,
        kind: "email",
        status: null,
        label,
        ok,
        at: new Date(started + n * 7 * 3600_000 + 600_000),
        note: ok ? null : "Resend refused — address bounced",
        actorId: null,
      });
    }

    made += 1;
    console.log(`  ${String(i + 1).padStart(2)} ${status.padEnd(21)} ${NAMES[i]}`);
  }

  console.log(`\n[ladder] seeded ${made} submissions, one per rung.`);
  console.log(`[ladder] one has a failed ③ hand-off, so the trail's error state is visible.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[ladder] failed:", err);
  process.exit(1);
});
