/**
 * Walk a submission through every rung, twice — once with translation, once
 * without — and check what actually happened at each.
 *
 * `npm run flow` proves the customer's half. This proves **the half nobody has
 * walked**: assignment, hand-off, both collection stamps, resolve, the deletion
 * warning and the purge. All of it shipped in a day and none of it had been
 * exercised end to end by a person.
 *
 * It drives the **real domain functions**, not the database — `markCoachCollected`
 * rather than an UPDATE — so the guards, the trail and the emails all run. What
 * it skips is the HTTP and cookie layer above them, which `npm run flow` and a
 * browser already cover.
 *
 * **Every rung is asserted, not just reached.** A simulation that only walks the
 * happy path tells you the statuses can be set, which was never in doubt. The
 * interesting checks are the refusals: collecting before a hand-off, resolving
 * before collection, sweeping something the customer hasn't seen.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/simulate.ts
 */
import "./loadEnv";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/db";
import {
  submissionTable,
  operatorTable,
} from "@/db/schema";
import {
  addSubmissionFile,
  assignSubmissionCoach,
  createSubmission,
  deleteSubmission,
  getSubmission,
  hasResponse,
  isPaid,
  isReleased,
  isWithCoach,
  listAllSubmissionFiles,
  listSubmissionEvents,
  markCoachCollected,
  markTranslatorCollected,
  assignSubmissionTranslator,
  languagesForChoice,
  assignOperator,
  isAssignedTo,
  releaseAssignments,
  assigneeFor,
  TRANSLATION_RUNGS,
  SUBMISSION_STATUSES,
  markCustomerCollected,
  markSubmissionSentToCoach,
  needsTranslation,
  undoneByReset,
  updateSubmission,
  whoseCourt,
  type Submission,
  type SubmissionStatus,
} from "@/domains/submission";
import { approveAndComplete, resolveSubmission, sendFeedbackForApproval } from "@/domains/feedback";
import { runRetentionSweep } from "@/domains/upload";
import { getSettings } from "@/domains/settings";
import { isOperatorSession } from "@/domains/account/model/session";
import { createOperator, verifyCredentials } from "@/domains/account/api/loginApi";
import { setOperatorPassword } from "@/domains/account/api/credentialApi";
import { grantRole, rolesFor, listByRole, setRoles, setGrants, grantsFor, listOperators, listCoaches } from "@/domains/operator";
import { operatorRoleGrantTable } from "@/domains/operator/model/operatorRoleGrantTable";
import { issueCode, isEmailVerified, verifyCode } from "@/domains/verification";
import { submissionInputSchema } from "@/domains/submission/model/submissionInput";

const day = 24 * 3600_000;
let pass = 0;
let fail = 0;

function check(ok: boolean, what: string) {
  if (ok) { pass += 1; console.log(`   ✓ ${what}`); }
  else { fail += 1; console.log(`   ✗ ${what}`); }
}

async function at(id: string): Promise<Submission> {
  const s = await getSubmission(id);
  if (!s) throw new Error(`submission ${id} vanished`);
  return s;
}

/** Assert the rung, and that every predicate agrees with it. */
async function rung(
  id: string,
  expected: SubmissionStatus,
  court: ReturnType<typeof whoseCourt>,
) {
  const s = await at(id);
  check(s.status === expected, `${expected.padEnd(21)} (got ${s.status})`);
  check(whoseCourt(s) === court, `   court is ${court}`);
  return s;
}

async function walk(label: string, translating: boolean) {
  console.log(`\n━━ ${label} ━━`);
  /*
    The sim owns its coach rather than picking one out of the seed.

    Whether the translation path runs is now decided by intersecting the
    customer's declared languages with the coach's, so a walk that borrows
    whichever coach happens to be seeded is asserting a rule about data it
    doesn't control — and it fails on a database where nobody has a
    Japanese-only coach, which is most of them.
  */
  const coach = await ensureCoach(
    translating ? "Sim Coach (JA only)" : "Sim Coach (EN)",
    translating ? ["Japanese"] : ["English"],
  );

  // ── rung 1: draft ────────────────────────────────────────────────────
  const s = await createSubmission({
    customerEmail: `sim-${Date.now()}@example.com`,
    playerName: `Sim ${label}`,
    playerAge: 14,
    focus: "Hitting",
    languages: ["English"],
  });
  await rung(s.id, "draft", "customer");
  // The rule the whole translation path hangs off: two declared sets, intersected.
  check(
    needsTranslation((await at(s.id)).languages, coach.languages) === translating,
    `   language check says translation is ${translating ? "" : "not "}needed`,
  );
  check(!isPaid(await at(s.id)), "   nothing is paid at draft");

  /*
    ── rung 2: uploading ──────────────────────────────────────────────────

    Through the real code path rather than by setting the column, because the
    trail's verification breadcrumbs only exist if `verifyCode` writes them, and
    a walk that stamps `emailVerifiedAt` directly would prove nothing about
    that. A wrong guess first, so the failure branch is exercised too.
  */
  const code = await issueCode(s.id);
  check(!!code && /^\d{6}$/.test(code), "   a 6-digit code is issued");
  const wrong = await verifyCode(s.id, code === "000000" ? "111111" : "000000");
  check(!wrong.ok && wrong.reason === "mismatch", "   a wrong code is refused");
  const right = await verifyCode(s.id, code!);
  check(right.ok, "   the right code is accepted");
  await rung(s.id, "awaiting_payment", "customer");
  check(await isEmailVerified(s.id), "   and the email is verified");

  const checks = (await listSubmissionEvents(s.id)).filter((e) => e.kind === "verification");
  check(checks.length === 2, `   both attempts are in the trail (${checks.length})`);
  check(checks[0]?.ok === false && /wrong code/.test(checks[0]?.note ?? ""),
    "   the refusal says why, and how much rope is left");
  check(checks[1]?.ok === true, "   the acceptance is recorded too");
  check((await verifyCode(s.id, code!)).ok, "   re-submitting a verified step is fine");
  check(
    (await listSubmissionEvents(s.id)).filter((e) => e.kind === "verification").length === 2,
    "   and doesn't bury the real one under duplicates",
  );

  for (let n = 0; n < 2; n += 1) {
    await addSubmissionFile({
      submissionId: s.id,
      filename: `clip-${n + 1}.mp4`,
      contentType: "video/mp4",
      sizeBytes: 42_000_000,
      fileUrl: `sim/${s.id}/clip-${n + 1}.mp4`,
    });
  }
  check((await listAllSubmissionFiles(s.id)).length === 2, "   two intake files attached");

  // The guards that matter *before* payment.
  check((await markCoachCollected(s.id)) === null, "   a coach can't collect an unsent submission");
  check((await markCustomerCollected(s.id)) === null, "   a customer can't collect an unreleased one");

  await updateSubmission(s.id, {
    status: "new",
    paidAt: new Date().toISOString(),
    stripeAmount: 8500,
    stripePaymentId: `pi_sim_${Date.now()}`,
  });

  // ── rung 3: new ──────────────────────────────────────────────────────
  const paid = await rung(s.id, "new", "admin");
  check(isPaid(paid), "   isPaid flips at the boundary");

  // ── rung 4: assigned ─────────────────────────────────────────────────
  await assignSubmissionCoach(s.id, coach.id);
  const assigned = await rung(s.id, "assigned", "admin");
  check(isWithCoach(assigned), "   it's on the coach's desk");

  /*
    The hand-off leaves its own row, and it is not the rung.

    `submission_assignment` only ever says who has it *now* — a reassignment
    replaces the row — so without these the first coach's turn vanishes the
    moment a second one is chosen. That is the case worth asserting, not the
    happy one.
  */
  const handOffs = () =>
    listSubmissionEvents(s.id).then((es) => es.filter((e) => e.kind === "assignment"));
  const firstHandOff = await handOffs();
  check(firstHandOff.length === 1, `   the assignment is in the trail (${firstHandOff.length})`);
  check(
    firstHandOff[0]?.label === `coach assigned — ${coach.id}`,
    "   and it names the coach, not the file kind",
  );

  const standIn = await ensureCoach(`${label} Stand-In`, coach.languages);
  await assignSubmissionCoach(s.id, standIn.id);
  const afterSwap = await handOffs();
  check(afterSwap.length === 3, `   a reassignment writes two more rows (${afterSwap.length})`);
  check(
    afterSwap[1]?.label === `coach unassigned — ${coach.id}`,
    "   the first coach's turn survives being replaced",
  );
  /*
    Two rows written in one transaction must be *orderable*.

    `at` defaulted to now() — the transaction's start time — so these two shared
    a timestamp and their order was whatever the planner felt like. This check
    is the reason 0012 exists; without it the bug reproduced once in five runs
    and looked like a fluke.
  */
  check(
    new Date(afterSwap[1]!.at!).getTime() > new Date(afterSwap[0]!.at!).getTime(),
    "   and the trail can order two events from one transaction",
  );
  check(
    (await at(s.id)).status === "assigned",
    "   and reassigning doesn't re-record the rung",
  );

  // Put it back, so the rest of the walk runs against the coach whose
  // languages decided whether this path translates at all.
  await assignSubmissionCoach(s.id, coach.id);

  // Held across both legs: the return leg asserts the outbound assignment is
  // still there, which is the point of assignment being a join.
  let intakeTranslator: { id: string; name: string } | null = null;

  // ── rungs 5–6: translation, only when the coach needs it ─────────────
  if (translating) {
    // Picking is its own act and its own rung, exactly as it is for a coach.
    intakeTranslator = await ensureTranslator(`${label} Translator`);
    await assignSubmissionTranslator(s.id, intakeTranslator.id, "intake_translation");
    await rung(s.id, "intake_translator_assigned", "translator");
    check(
      (await assigneeFor(s.id, "intake_translation")) === intakeTranslator.id,
      "   the intake translator is on the join, not just the rung",
    );

    await updateSubmission(s.id, { status: "sent_to_intake_translator" });
    await rung(s.id, "sent_to_intake_translator", "translator");
    /*
      The bystander goes first, before the rung is earned by anyone.

      It used to go last, which meant rewinding the status to
      `sent_to_intake_translator` and earning `intake_translating` a second
      time — so the walk's own trail carried two rungs twice, and the two
      assertions at the end that no rung repeats were failing on the test
      rather than on the code (Ben, 2026-09-04).

      Asked in this order it needs no rewind, and it asks the stronger
      question: not "can a bystander re-earn a rung someone already earned"
      but "can a bystander earn it at all".
    */
    const bystander = await ensureTranslator(`${label} Bystander Translator`);
    check(
      (await markTranslatorCollected(s.id, bystander.id)) === null,
      "   another translator's download earns nothing",
    );
    // The rung is earned by the translator opening the files, exactly as
    // `in_review` is earned by the coach — not by the admin declaring it.
    check(
      (await markTranslatorCollected(s.id, intakeTranslator.id))?.status ===
        "intake_translating",
      "   the assigned translator's download earns intake_translating",
    );
    check(
      (await markTranslatorCollected(s.id, intakeTranslator.id)) === null,
      "   a re-download changes nothing",
    );
    await rung(s.id, "intake_translating", "translator");
    await addSubmissionFile(
      { submissionId: s.id, filename: "clip-1-JA.mp4", contentType: "video/mp4", sizeBytes: 42_000_000, fileUrl: `sim/${s.id}/ja.mp4` },
      "intake_translation",
    );
    await updateSubmission(s.id, { status: "intake_translated" });
    await rung(s.id, "intake_translated", "admin");
  } else {
    console.log("   — skips 5–6: this coach reads English");
  }

  // ── rung 7: sent_to_coach ────────────────────────────────────────────
  await updateSubmission(s.id, { coachFileSet: translating ? "translation" : "original" });
  await markSubmissionSentToCoach(s.id);
  await rung(s.id, "sent_to_coach", "coach");
  check((await at(s.id)).coachFileSet !== undefined, "   what the coach was sent is recorded");

  // ── rung 8: in_review, earned by a download ──────────────────────────
  const collectedByCoach = await markCoachCollected(s.id);
  check(collectedByCoach?.status === "in_review", "   the coach's download earns in_review");
  check((await markCoachCollected(s.id)) === null, "   a re-download changes nothing");
  await rung(s.id, "in_review", "coach");

  // ── rung 9: awaiting_approval ────────────────────────────────────────
  check(
    (await sendFeedbackForApproval(s.id)) === "no-files",
    "   can't deliver with no response file — and says that's why",
  );
  await addSubmissionFile(
    { submissionId: s.id, filename: "review.mp4", contentType: "video/mp4", sizeBytes: 88_000_000, fileUrl: `sim/${s.id}/review.mp4` },
    "feedback",
  );
  await sendFeedbackForApproval(s.id);
  const delivered = await rung(s.id, "awaiting_approval", "admin");
  check(hasResponse(delivered), "   a response exists");
  check(!isReleased(delivered), "   but the customer can't see it");
  check(!delivered.completedAt, "   and no clock has started");

  // ── rungs 10–11: the response's translation ──────────────────────────
  if (translating) {
    // The return leg may be a different person — that is the whole reason
    // assignment is a join and not a column.
    const backTranslator = await ensureTranslator(`${label} Back Translator`);
    await assignSubmissionTranslator(s.id, backTranslator.id, "feedback_translation");
    await rung(s.id, "feedback_translator_assigned", "translator");
    check(
      (await assigneeFor(s.id, "feedback_translation")) === backTranslator.id,
      "   the return leg has its own translator",
    );
    check(
      (await assigneeFor(s.id, "intake_translation")) === intakeTranslator?.id,
      "   and the outbound one is untouched — two legs, two rows",
    );

    await updateSubmission(s.id, { status: "sent_to_feedback_translator" });
    await rung(s.id, "sent_to_feedback_translator", "translator");
    check(
      (await markTranslatorCollected(s.id, backTranslator.id))?.status ===
        "feedback_translating",
      "   the return leg earns its rung the same way",
    );
    await rung(s.id, "feedback_translating", "translator");
    await addSubmissionFile(
      { submissionId: s.id, filename: "review-EN.mp4", contentType: "video/mp4", sizeBytes: 88_000_000, fileUrl: `sim/${s.id}/review-en.mp4` },
      "feedback_translation",
    );
    await updateSubmission(s.id, { status: "feedback_translated" });
    await rung(s.id, "feedback_translated", "admin");
    // No moving it back: approving from `feedback_translated` is exactly what a
    // translated submission has to do, and pretending otherwise hid a real bug.
  }

  // ── rung 12: complete ────────────────────────────────────────────────
  await approveAndComplete(s.id, translating ? "translation" : "original");
  const released = await rung(s.id, "complete", "customer");
  check(isReleased(released), "   released to the customer");
  check(!!released.completedAt && !released.collectedAt, "   delivered, but the clock waits for collection");

  // Nothing is due before they collect.
  const early = await runRetentionSweep();
  check((await at(s.id)).status === "complete", `   not swept before collection (${early.resolvedPurged} purged)`);

  // ── rung 13: collected ───────────────────────────────────────────────
  const collected = await markCustomerCollected(s.id);
  check(collected?.status === "collected", "   the customer's download starts the clock");
  check(!!collected?.collectedAt, "   collectedAt is stamped");
  check((await markCustomerCollected(s.id)) === null, "   a re-download can't restart it");
  await rung(s.id, "collected", "admin");

  // ── rung 14: resolved ────────────────────────────────────────────────
  const settings = await getSettings();
  await resolveSubmission(s.id, settings.retainCollectedDays);
  await rung(s.id, "resolved", "system");

  // Regression: "whichever clock is later." A submission collected promptly
  // after delivery must live to the *delivery* backstop, not be purged
  // retainCollectedDays after collection. Here the collection clock has elapsed
  // but the delivery clock has not — the sweep must leave it untouched.
  await db.update(submissionTable)
    .set({
      collectedAt: new Date(Date.now() - (settings.retainCollectedDays + 8) * day),
      completedAt: new Date(Date.now() - (settings.retainCollectedDays + 10) * day),
    })
    .where(eq(submissionTable.id, s.id));
  await runRetentionSweep();
  const keptToBackstop = await at(s.id);
  check(
    !keptToBackstop.deletionWarnedAt && !keptToBackstop.filesPurgedAt,
    "   a prompt collector is kept to the delivery backstop, not purged early",
  );

  // ── rung 15: purge_imminent — the warning ────────────────────────────
  await db.update(submissionTable)
    .set({
      collectedAt: new Date(Date.now() - (settings.retainCollectedDays - 2) * day),
      // Whichever clock is later governs the deletion, and this scenario
      // exercises the *collection* one (deletion two days out, so the warning is
      // due). For it to be the later clock the delivery backstop must already
      // have passed — otherwise `retainDeliveredDays` from delivery would be the
      // later deadline and nothing would be due yet.
      completedAt: new Date(Date.now() - (settings.retainDeliveredDays + 5) * day),
    })
    .where(eq(submissionTable.id, s.id));
  const warned = await runRetentionSweep();
  check(warned.warningsSent >= 1, `   the warning fires before the purge (${warned.warningsSent})`);
  await rung(s.id, "purge_imminent", "system");
  check(!!(await at(s.id)).deletionWarnedAt, "   and is stamped so it can't send twice");
  check((await listAllSubmissionFiles(s.id)).some((f) => f.fileUrl), "   nothing deleted yet");

  // ── rung 16: purged ──────────────────────────────────────────────────
  await db.update(submissionTable)
    .set({
      collectedAt: new Date(Date.now() - (settings.retainCollectedDays + 1) * day),
      // Keep the delivery backstop in the past too, so the collection clock stays
      // the later, governing deadline (as in the warning step above).
      completedAt: new Date(Date.now() - (settings.retainDeliveredDays + 5) * day),
      // The warning went out in the previous sweep; advance its clock past the
      // notice period too. The purge now waits on the *age of the warning*, not
      // only the retention deadline — a real run always leaves days between warn
      // and delete, so the simulation has to put them there as well.
      deletionWarnedAt: new Date(Date.now() - (settings.warnBeforeDeletionDays + 1) * day),
    })
    .where(eq(submissionTable.id, s.id));
  const swept = await runRetentionSweep();
  check(swept.resolvedPurged >= 1, `   purged (${swept.filesDeleted} files)`);
  await rung(s.id, "purged", "system");

  const files = await listAllSubmissionFiles(s.id);
  check(files.length > 0, `   every file record survives (${files.length})`);
  check(files.every((f) => !f.fileUrl), "   every locator is cleared");
  check(!!(await at(s.id)).filesPurgedAt, "   the sweep is stamped");
  check(isReleased(await at(s.id)), "   still released — purged is about bytes, not permission");

  // ── the trail ────────────────────────────────────────────────────────
  const events = await listSubmissionEvents(s.id);
  const rungs = events.filter((e) => e.kind === "status").map((e) => e.status);
  const mails = events.filter((e) => e.kind === "email");
  // Derived, not a literal. The `16` that used to sit here stayed valid
  // TypeScript for exactly as long as it took someone to add a rung.
  const expected = translating
    ? SUBMISSION_STATUSES.length
    : SUBMISSION_STATUSES.length - TRANSLATION_RUNGS.length;
  check(rungs.length === expected, `   ${rungs.length} rungs recorded (expected ${expected})`);
  check(new Set(rungs).size === rungs.length, "   no rung recorded twice");
  console.log(`   trail: ${rungs.join(" → ")}`);
  console.log(`   emails: ${mails.length ? mails.map((m) => m.label).join(", ") : "none — RESEND_API_KEY unset locally"}`);

  await deleteSubmission(s.id);
  check((await listSubmissionEvents(s.id)).length === 0, "   deleting cascades the trail");
}

/**
 * A coach with exactly these languages, created once and reused.
 *
 * Since ADR 018 that is two rows — the operator that logs in, and the profile
 * that says what they cover — and the id the rest of the walk assigns is the
 * operator's.
 */
/** Settings belong to the grant, so a fixture writes them there. */
async function setRoleSettings(
  operatorId: string,
  role: "coach" | "translator",
  values: { languages?: string[]; specialties?: ("Hitting" | "Pitching" | "Fielding" | "Catching" | "Other")[] },
) {
  await db
    .update(operatorRoleGrantTable)
    .set(values)
    .where(
      and(
        eq(operatorRoleGrantTable.operatorId, operatorId),
        eq(operatorRoleGrantTable.role, role),
      ),
    );
}

async function ensureCoach(name: string, languages: string[]) {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, "-")}@sim.local`;
  const [existing] = await db
    .select()
    .from(operatorTable)
    .where(eq(operatorTable.email, email));

  if (existing) {
    await setRoleSettings(existing.id, "coach", { languages });
    return { id: existing.id, name: existing.name, languages };
  }

  const [operator] = await db
    .insert(operatorTable)
    .values({ email, passwordHash: "x", name })
    .returning();
  // A kind is a grant, and the grant carries the kind's settings — one row, not
  // two. A fixture without a grant is unlike any real operator: it would not
  // appear in `listCoaches()` at all.
  await grantRole(operator.id, "coach", null);
  await setRoleSettings(operator.id, "coach", { languages, specialties: ["Hitting"] });
  return { id: operator.id, name: operator.name, languages };
}

/**
 * A translator, which is the same row with a different role.
 *
 * Separate from `ensureCoach` only because the role differs — and that
 * difference is exactly what `listCoaches()` failed to filter on before ADR 018
 * Q3, when "has a profile" and "is a coach" stopped being the same set.
 */
async function ensureTranslator(name: string) {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, "-")}@sim.local`;
  const [existing] = await db
    .select()
    .from(operatorTable)
    .where(eq(operatorTable.email, email));
  if (existing) return { id: existing.id, name: existing.name };

  const [operator] = await db
    .insert(operatorTable)
    .values({ email, passwordHash: "x", name })
    .returning();
  await grantRole(operator.id, "translator", null);
  await setRoleSettings(operator.id, "translator", {
    languages: ["English", "Japanese"],
  });
  return { id: operator.id, name: operator.name };
}

/**
 * One person, several kinds — the thing a single `role` column could not hold.
 *
 * Worth walking because the limitation was invisible from the inside: with one
 * column, being both a coach and an admin meant two logins and two email
 * addresses, and the second onboarding failed on the unique email rather than
 * on anything that explained itself.
 */
async function sessionShape() {
  console.log("\n━━ a session of the wrong shape is not a session ━━");

  /*
    The 2026-08-07 outage, as a check.

    `role` became `roles`, and every cookie issued before that verified fine —
    same secret, valid signature — then arrived with `roles` undefined and threw
    on the first `.some()`. /admin returned 500 to everyone holding one.

    The mistake was believing a signature check is a shape check. It is not:
    `verifySessionToken` casts with `as T` and trusts the caller's word.
  */
  check(
    isOperatorSession({ operatorId: "x", roles: ["admin"] }),
    "   the current shape is a session",
  );
  check(
    !isOperatorSession({ operatorId: "x", role: "admin" }),
    "   the PREVIOUS shape is not — this is the one that 500'd",
  );
  check(!isOperatorSession({ operatorId: "x" }), "   no roles at all is not");
  check(!isOperatorSession({ roles: ["admin"] }), "   no operatorId is not");
  check(!isOperatorSession(null) && !isOperatorSession("nope"), "   nor is junk");
  check(
    !isOperatorSession({ operatorId: "x", roles: [1, 2] }),
    "   nor roles that are not strings",
  );
}

async function multiRole() {
  console.log("\n━━ one operator, several kinds ━━");
  const person = await ensureCoach("Wearer Of Hats", ["English"]);

  /*
    Arranged, not assumed. The fixture persists between runs and this walk ends
    with it holding two kinds, so a second run would have started from the first
    run's leftovers — which is how this check failed the first time it was
    written, and is a better bug to find here than in something that matters.
  */
  await setRoles(person.id, ["coach"], null);
  check((await rolesFor(person.id)).join() === "coach", "   starts as one kind");

  await setRoles(person.id, ["coach", "translator", "admin"], null);
  const held = (await rolesFor(person.id)).sort();
  check(held.join(",") === "admin,coach,translator", `   holds all three (${held.join("+")})`);

  // The point of the whole change: they are on every list they qualify for.
  for (const role of ["coach", "translator", "admin"] as const) {
    const listed = await listByRole(role);
    check(
      listed.some((p) => p.id === person.id),
      `   appears in the ${role} list`,
    );
  }

  // And it is one person, not three — same row, same profile, seen three ways.
  const asCoach = (await listByRole("coach")).find((p) => p.id === person.id);
  const asAdmin = (await listByRole("admin")).find((p) => p.id === person.id);
  check(
    asCoach?.email === asAdmin?.email && asCoach?.name === asAdmin?.name,
    "   the same person, not a copy per list",
  );

  /*
    Removal releases work. A revoked role — or a suspended account — takes its
    holder off what that role owed, so the submission returns to the queue and no
    lingering assignment keeps `isAssignedTo` true for someone who can no longer
    act. Tested against `releaseAssignments` directly, the function both the role
    action and the deactivation path call.
  */
  {
    const os = await createSubmission({
      customerEmail: `sim-assign-${Date.now()}@example.com`,
      playerName: "Assigned Player",
      playerAge: 13,
      focus: "Pitching",
      languages: ["English"],
    });
    await assignOperator(os.id, person.id, "feedback");
    await assignOperator(os.id, person.id, "intake_translation");
    check(
      await isAssignedTo(os.id, person.id, "feedback"),
      "   assigned the feedback before removal",
    );

    // A revoked role releases only that role's work.
    await releaseAssignments(person.id, ["coach"]);
    check(
      !(await isAssignedTo(os.id, person.id, "feedback")),
      "   revoking coach releases the feedback assignment",
    );
    check(
      await isAssignedTo(os.id, person.id, "intake_translation"),
      "   but leaves the translation work they still owe",
    );

    // Suspending the account releases everything that is left.
    await releaseAssignments(person.id);
    check(
      !(await isAssignedTo(os.id, person.id, "intake_translation")),
      "   suspension releases every remaining assignment",
    );
    await deleteSubmission(os.id);
  }

  /*
    Availability is per kind. Pausing a coach must not touch their translator
    membership — the two are independent decisions about the same person, which
    a single `operator.isActive` could not express.
  */
  await setGrants(person.id, [
    { role: "coach", isActive: false },
    { role: "translator", isActive: true },
    { role: "admin", isActive: true },
  ], null);
  const paused = await grantsFor(person.id);
  check(
    paused.find((g) => g.role === "coach")?.isActive === false &&
      paused.find((g) => g.role === "translator")?.isActive === true,
    "   paused as a coach, still taking translations",
  );
  check(
    (await listByRole("coach")).some((p) => p.id === person.id),
    "   a paused coach still holds the role and stays on the list",
  );

  // …and "paused" has to mean something, or it is decoration.
  check(
    !(await listCoaches()).some((p) => p.id === person.id),
    "   a paused coach is not offered for assignment",
  );

  // Revoking a kind removes them from that list and leaves the others alone.
  await setRoles(person.id, ["coach"], null);
  check(
    !(await listByRole("admin")).some((p) => p.id === person.id),
    "   revoking a kind drops them from that list",
  );
  check(
    (await listByRole("coach")).some((p) => p.id === person.id),
    "   and leaves the others standing",
  );

  /*
    A grant that was already held keeps its original grantedAt — `setRoles`
    diffs rather than replacing. Restating every existing grant as having
    happened just now, by whoever last opened the form, would quietly destroy
    the only reason this is a table and not an array column.
  */
  const before = await grantedAt(person.id, "coach");
  await setRoles(person.id, ["coach", "admin"], null);
  const after = await grantedAt(person.id, "coach");
  check(before === after, "   an unchanged grant keeps its original timestamp");

  /*
    The gap that opens when a kind is added to someone onboarded as something
    else: an admin made a coach has no specialties, because onboarding an admin
    never asks for them.
  */
  const listed = (await listOperators()).find((p) => p.id === person.id);
  check(!!listed, "   appears on the unfiltered list too");
  check(
    (listed?.grants.length ?? 0) >= 2,
    "   the unfiltered row carries every kind, not just one",
  );
}

async function grantedAt(operatorId: string, role: string) {
  const [row] = await db
    .select({ at: operatorRoleGrantTable.grantedAt })
    .from(operatorRoleGrantTable)
    .where(
      and(
        eq(operatorRoleGrantTable.operatorId, operatorId),
        eq(operatorRoleGrantTable.role, role as "coach"),
      ),
    );
  return row?.at?.toISOString();
}

/**
 * The intersection rule itself, before any walk exercises it.
 *
 * A full walk only ever proves the two shapes it happens to use. These are the
 * cases that separate *overlap* from *equality* and *unknown* from *no* — the
 * three ways this rule can be written wrong while still passing a happy path.
 */
async function checkResetRule() {
  console.log("\n━━ what a reset undoes ━━");
  {
    // A reset lands on a rung; everything earned beyond it stops being true.
    // The trail keeps all of it — this is only about what the panel may claim.
    const toNew = undoneByReset("new");
    check(
      toNew.patch.collectedAt === null &&
        toNew.patch.completedAt === null &&
        toNew.patch.customerFileSet === null &&
        toNew.patch.coachFileSet === null,
      "   back to New drops every downstream fact",
    );
    check(
      toNew.release.includes("feedback") &&
        toNew.release.includes("intake_translation") &&
        toNew.release.includes("feedback_translation"),
      "   and releases the coach and both translators",
    );

    const toCoach = undoneByReset("sent_to_coach");
    check(
      toCoach.patch.collectedAt === null && toCoach.patch.customerFileSet === null,
      "   back to the coach drops the delivery",
    );
    check(
      !("coachFileSet" in toCoach.patch),
      "   but keeps what the coach was sent — that rung is where it lands",
    );
    check(
      !toCoach.release.includes("feedback") &&
        !toCoach.release.includes("intake_translation"),
      "   keeps the coach and the intake translator",
    );
    check(
      toCoach.release.includes("feedback_translation"),
      "   and releases the return translator, whose leg is now ahead of it",
    );

    // The rule reads the same in both directions: a rung it lands ON is kept,
    // which is what makes it a rung-per-fact table rather than a list per
    // destination.
    const toCollected = undoneByReset("collected");
    check(
      !("collectedAt" in toCollected.patch) && !("completedAt" in toCollected.patch),
      "   a reset to Collected keeps the collection that names it",
    );
    /*
      The pure rule is only half of it: the patch has to survive the mapper.

      It did not. Every timestamp went through `new Date(patch.x)`, and
      `new Date(null)` is epoch zero — so clearing a collection *stamped* it,
      and the panel reported "Collected — Dec 31, 16:00". The rule above passed
      the whole time, because it never wrote anything (Ben, 2026-09-04).
    */
    const r = await createSubmission({
      customerEmail: "reset-roundtrip@example.com",
      playerName: "Reset Roundtrip",
      playerAge: 11,
      focus: "Hitting",
      customerNotes: "",
      languages: ["English"],
    });
    await updateSubmission(r.id, {
      status: "collected",
      collectedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      customerFileSet: "original",
    });
    check(
      !!(await at(r.id)).collectedAt && !!(await at(r.id)).customerFileSet,
      "   a collection can be stamped",
    );
    await updateSubmission(r.id, { ...undoneByReset("in_review").patch });
    const cleared = await at(r.id);
    check(
      cleared.collectedAt === undefined &&
        cleared.completedAt === undefined &&
        cleared.customerFileSet === undefined,
      "   and cleared to absent — not to 1970",
    );
    await deleteSubmission(r.id);

    check(
      undoneByReset("purged").release.length === 0 &&
        Object.keys(undoneByReset("purged").patch).length === 0,
      "   the last rung undoes nothing",
    );
  }

}

function checkLanguageRule() {
  console.log("\n━━ the intersection rule ━━");
  const cases: [string[], string[], boolean | null, string][] = [
    [["English"], ["English"], false, "same single language"],
    [["English"], ["Japanese"], true, "no overlap"],
    [["Japanese"], ["Japanese"], false, "Japanese both sides — the case the old coach-only rule got wrong"],
    [["English"], ["English", "Japanese"], false, "bilingual coach overlaps — sets differ, and that's fine"],
    /*
      Ben's matrix, ruled 2026-08-31. A bilingual **source** gates even though
      the two sides overlap: sharing a language says they *could* have used it,
      not that the files are in it, and the target cannot read the other one.
      The admin is offered the hand-over beside the picker rather than blocked.

      This case asserted `false` until that ruling — the old symmetric reading,
      "any shared language means no translation" — and the shipped code had
      already disagreed with it.
    */
    [["English", "Japanese"], ["Japanese"], true, "bilingual customer, monolingual coach"],
    [["English", "Japanese"], ["English"], true, "the same the other way round"],
    [["Japanese"], ["English", "Japanese"], false, "bilingual target reads everything"],
    [["English", "Japanese"], ["English", "Japanese"], false, "bilingual both sides"],
    [["English"], [], null, "coach hasn't declared — unknown, not no"],
    [[], ["English"], null, "customer hasn't declared — unknown, not no"],
    /*
      QA 5.9.8 lives here now. It was a manual check until 2026-09-03, when it
      was retired for being unreachable: both sides are radio groups, so nobody
      can type a stray space. The *rule* still matters — a hand-written
      migration or a seed could reintroduce one — so the assertion moves to the
      place that can still make it, with the space it actually names.
    */
    [["english "], ["English"], false, "case and spacing don't make a mismatch"],
    [["English"], [" japanese"], true, "and spacing doesn't hide a real mismatch"],
  ];
  for (const [customer, coach, want, what] of cases) {
    check(needsTranslation(customer, coach) === want, `${String(want).padEnd(5)} — ${what}`);
  }

  /*
    And the form's half: a radio posts one string, the rule consumes a list.
    The empty answer the radios make unreachable must also be unreachable for
    anything that skips them — the checkbox version leaned on `.min(1)`, which
    is a message, not a guarantee.
  */
  const parse = (languages: unknown) =>
    submissionInputSchema.parse({
      customerEmail: "x@example.com",
      playerName: "P",
      playerAge: "12",
      customerNotes: "Please review my swing mechanics.",
      ...(languages === undefined ? {} : { languages }),
    }).languages;
  check(parse("English") === "English", "posts English");
  check(parse("Japanese") === "Japanese", "posts Japanese");
  check(parse("both") === "both", "posts both");
  check(parse(undefined) === "English", "a post with no answer falls back to English");
  check(parse("Klingon") === "English", "an answer we don't offer falls back too");

  /*
    **Parsing twice must not change the answer** (Ben, QA 5.9.2).

    This schema is genuinely parsed twice on every submission: once in the
    browser by `zodResolver`, and again on the server, which must not trust the
    client. It used to widen the choice into a `string[]`, so the second parse
    met an array, the enum refused it, and `.catch` quietly answered "English".
    Every submission came out English no matter what was picked, and the checks
    above all passed — because they only ever parsed once.
  */
  for (const choice of ["English", "Japanese", "both"] as const) {
    check(
      parse(parse(choice)) === choice,
      `   parsing ${choice} twice is the same as parsing it once`,
    );
  }

  // And the widening the server does with the result, once, at the insert.
  check(languagesForChoice("both").join() === "English,Japanese", "both widens to the pair");
  check(languagesForChoice("Japanese").join() === "Japanese", "Japanese widens to itself");
}

/**
 * A login that was granted can actually be used.
 *
 * This exists because the whole of it failed silently on 2026-08-15. Migrations
 * 0013 and 0015 moved the password hash and the role out of `operator` into
 * their own tables and backfilled everyone who existed; `scripts/seed.ts` kept
 * writing the old columns, so every operator it made afterwards had a row that
 * looked complete and could not sign in. `setOperatorPassword` was an UPDATE,
 * so resetting the password reported success and changed nothing.
 *
 * Nothing caught it. `tsc` was happy — the legacy columns still exist. The
 * simulation was happy — it granted roles through the domain functions, which
 * write the right rows. The only thing that would have caught it is asking the
 * login path itself, from the outside, whether a fresh operator can get in.
 */
async function loginWorks() {
  console.log("\n━━ a granted login can be used ━━");
  const email = `sim-login-${Date.now()}@sim.local`;
  const password = "sim-password-not-a-secret";

  const created = await createOperator(email, password, "Sim Login");
  await setRoles(created.id, ["admin"], null);

  const ok = await verifyCredentials(email, password);
  check(!!ok, "   a new operator can sign in with their password");
  check(
    (ok?.roles ?? []).join() === "admin",
    "   and arrives holding the kind they were granted",
  );

  check(
    (await verifyCredentials(email, "not-the-password")) === null,
    "   the wrong password is still refused",
  );

  /*
    The reset path, which is where the silent failure lived: it has to work for
    someone whose credential row is missing, not only for someone whose row
    exists. An UPDATE passes the second case and fails the first.
  */
  await setOperatorPassword(created.id, "a-different-password");
  check(
    !!(await verifyCredentials(email, "a-different-password")),
    "   a password reset actually changes the password",
  );

  await db.delete(operatorTable).where(eq(operatorTable.email, email));
}

async function main() {
  console.log("Simulating the whole ladder — both paths, real domain functions.");
  checkLanguageRule();
  await checkResetRule();
  await walk("English-reading coach — skips translation", false);
  await walk("Japanese-only coach — full translation path", true);
  await sessionShape();
  await multiRole();
  await loginWorks();

  console.log(`\n${"─".repeat(56)}`);
  console.log(fail === 0 ? `All ${pass} checks passed.` : `FAILED — ${fail} of ${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nsimulation threw:", err);
  process.exit(1);
});
