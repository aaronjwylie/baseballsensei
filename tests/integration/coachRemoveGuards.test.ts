import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * QA 6.11 and 6.12 — the two removes the coach's portal will never ask for.
 *
 * Both checks are marked ⚠️ in the itinerary because there is no button for
 * them. After a hand-back the card moves under "Submitted" and stops listing
 * files at all, and a coach is only ever shown their own (Ben, 2026-09-06 —
 * "I'm just not sure how to run these two tests"). That is the UI behaving
 * correctly, and it is exactly why the guards underneath it need their own
 * test: a Server Action is a public endpoint, so "the page never asks" is not
 * an answer to "what happens when someone asks anyway".
 *
 * So the request is made here directly, with a forged session, against a real
 * database. Three refusals, each for a different reason:
 *
 * - **6.11** the file is past `in_review` — the admin is reviewing it now
 * - **6.12a** the file belongs to another coach's submission
 * - **6.12b** the file is the customer's `intake`, not a response
 *
 * The session is mocked rather than minted, because what is under test is the
 * action's own reasoning about a session it has been handed. Whether the cookie
 * is genuine is `dal.ts`'s job and has its own coverage.
 */
const session = { operatorId: "", roles: ["coach"] as string[] };
vi.mock("@/domains/account", () => ({
  getSession: async () => (session.operatorId ? session : null),
}));
// The action revalidates two paths; outside a request there is nothing to
// revalidate and Next throws rather than no-oping.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db } = await import("@/shared/db");
const { operatorTable } = await import("@/domains/operator/model/operatorTable");
const { createOperator } = await import("@/domains/account/api/loginApi");
const { grantRole } = await import("@/domains/operator/api/operatorRoleApi");
const { createSubmission, deleteSubmission, updateSubmission, addSubmissionFile, assignOperator, getSubmission } =
  await import("@/domains/submission");
const { removeFeedbackFileAction, sendFeedbackForApprovalAction } = await import(
  "@/domains/feedback/api/feedbackActions"
);
const { findByCoach, isAssignedToSubmission, listFeedbackFiles } =
  await import("@/domains/submission");
const { eq, inArray } = await import("drizzle-orm");

const stamp = `${process.hrtime.bigint()}`;
const operators: string[] = [];
const submissions: string[] = [];

let coachA = "";
let coachB = "";
/** Mine, at `in_review` — the one state a coach may remove in. */
let mineId = "";
let theirsId = "";
let myFileId = "";
/** Another coach's, same state. */
let theirsFileId = "";
/** The customer's own upload, on my submission. */
let intakeFileId = "";

async function makeCoach(label: string): Promise<string> {
  const op = await createOperator(
    `qa-${label}-${stamp}@integration.test`,
    "password-123",
    `QA ${label}`,
  );
  await grantRole(op.id, "coach", null);
  operators.push(op.id);
  return op.id;
}

async function addFeedbackFile(submissionId: string, filename: string) {
  return addSubmissionFile(
    {
      submissionId,
      filename,
      contentType: "video/mp4",
      sizeBytes: 1024,
      fileUrl: `qa/${stamp}/${filename}`,
    },
    "feedback",
  );
}

async function at(id: string) {
  return getSubmission(id);
}

async function makeSubmission(coachId: string): Promise<string> {
  const s = await createSubmission({
    customerEmail: `qa-${stamp}-${coachId.slice(0, 8)}@integration.test`,
    playerName: "QA Player",
    playerAge: 12,
    focus: "Hitting",
    customerNotes: "",
    languages: ["English"],
  });
  submissions.push(s.id);
  await assignOperator(s.id, coachId, "feedback");
  await updateSubmission(s.id, { status: "in_review" });
  return s.id;
}

beforeAll(async () => {
  coachA = await makeCoach("coach-a");
  coachB = await makeCoach("coach-b");
  session.operatorId = coachA;

  mineId = await makeSubmission(coachA);
  theirsId = await makeSubmission(coachB);

  const me = coachA;
  const them = coachB;
  void me;
  void them;
  const mine = await addSubmissionFile(
    {
      submissionId: mineId,
      filename: "mine.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
      fileUrl: `qa/${stamp}/placeholder`,
    },
    "feedback",
  );
  myFileId = mine.id;

  const theirs = await addSubmissionFile(
    {
      submissionId: theirsId,
      filename: "theirs.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
      fileUrl: `qa/${stamp}/placeholder`,
    },
    "feedback",
  );
  theirsFileId = theirs.id;

  const intake = await addSubmissionFile(
    {
      submissionId: mineId,
      filename: "the-customer-clip.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
      fileUrl: `qa/${stamp}/placeholder`,
    },
    "intake",
  );
  intakeFileId = intake.id;
});

afterAll(async () => {
  for (const id of submissions) await deleteSubmission(id);
  if (operators.length) {
    await db.delete(operatorTable).where(inArray(operatorTable.id, operators));
  }
  void eq;
});

/**
 * QA 6.1 and 6.2 — the coach sees their own work and nothing else.
 *
 * Both are scoping questions answered by a query, so they are answered here
 * rather than by opening two browsers: what the portal lists is `findByCoach`,
 * and what a URL can reach is `isAssignedToSubmission`. The page and the file
 * route each ask one of those and nothing else.
 */
describe("6.1/6.2 — a coach's work is their own", () => {
  it("6.1 lists only what is assigned to them", async () => {
    const mine = await findByCoach(coachA);
    const theirs = await findByCoach(coachB);
    expect(mine.map((s) => s.id)).toContain(mineId);
    expect(mine.map((s) => s.id)).not.toContain(theirsId);
    expect(theirs.map((s) => s.id)).toContain(theirsId);
    expect(theirs.map((s) => s.id)).not.toContain(mineId);
  });

  it("6.2 does not consider them assigned to another coach's submission", async () => {
    expect(await isAssignedToSubmission(mineId, coachA)).toBe(true);
    expect(await isAssignedToSubmission(theirsId, coachA)).toBe(false);
  });
});

/**
 * QA 6.6.3, 6.9 and 6.10 — sending, and what must stop it.
 *
 * The hand-back has two refusals and they were one message until 2026-09-04: a
 * coach with two files attached, on a rung that had been reset out from under
 * them, was told to attach a file. One message for two causes is only safe when
 * the causes cannot be told apart, and these can.
 */
describe("6.6.3/6.9/6.10 — the hand-back and its refusals", () => {
  /*
    Its own submission, not the one the remove tests use. Sharing it made 6.10
    depend on a file another block had not removed yet — a test that passes or
    fails on run order is worse than no test.
  */
  let sendId = "";
  beforeAll(async () => {
    sendId = await makeSubmission(coachA);
  });

  it("6.9 removes one of two, and leaves the other", async () => {
    const keep = await addFeedbackFile(sendId, "keep.mp4");
    const drop = await addFeedbackFile(sendId, "drop.mp4");

    expect((await removeFeedbackFileAction(drop.id)).ok).toBe(true);

    const left = (await listFeedbackFiles(sendId)).map((f) => f.id);
    expect(left).toContain(keep.id);
    expect(left).not.toContain(drop.id);

    await removeFeedbackFileAction(keep.id);
  });

  it("6.10 refuses a send with nothing attached", async () => {
    expect(await listFeedbackFiles(sendId)).toHaveLength(0);
    const result = await sendFeedbackForApprovalAction(sendId);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Attach at least one file");
  });

  it("sends when there is something to send", async () => {
    await addFeedbackFile(sendId, "the-review.mp4");
    const result = await sendFeedbackForApprovalAction(sendId);
    expect(result.ok).toBe(true);
    expect((await at(sendId))?.status).toBe("awaiting_approval");
  });

  /*
    6.6.3 — the rung, not the files. The coach still has files attached here,
    which is the whole point: the old message told them to attach one.
  */
  it("6.6.3 refuses a send from the wrong rung, and says which", async () => {
    await updateSubmission(sendId, { status: "new" });
    const result = await sendFeedbackForApprovalAction(sendId);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("isn't with you at the moment");
    expect(result.error).not.toContain("Attach at least one file");
  });
});

describe("the removes a coach's portal will never ask for", () => {
  it("removes my own file while it is still mine to remove", async () => {
    const result = await removeFeedbackFileAction(myFileId);
    expect(result.ok).toBe(true);
  });

  /*
    6.11 — the stale tab. The card is gone from the portal after a hand-back,
    but a tab opened before it still has the button, and a Server Action is
    reachable from anywhere. Pulling the file out here would leave the admin
    approving a submission with nothing in it.
  */
  it("6.11 refuses a remove once the admin has it", async () => {
    const file = await addSubmissionFile(
      {
        submissionId: mineId,
        filename: "sent.mp4",
        contentType: "video/mp4",
        sizeBytes: 1024,
        fileUrl: `qa/${stamp}/placeholder`,
      },
      "feedback",
    );
    await updateSubmission(mineId, { status: "awaiting_approval" });

    const result = await removeFeedbackFileAction(file.id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already gone to the admin");

    await updateSubmission(mineId, { status: "in_review" });
  });

  /* 6.12a — a submission that isn't mine. Ownership is the assignment, not the
     role: being a coach is not being *this* coach. */
  it("6.12 refuses another coach's file", async () => {
    const result = await removeFeedbackFileAction(theirsFileId);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("isn't your submission");
  });

  /* 6.12b — the customer's own upload, on a submission that IS mine. The kind
     is checked before ownership, so this refuses even where the coach belongs. */
  it("6.12 refuses the customer's intake file", async () => {
    const result = await removeFeedbackFileAction(intakeFileId);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("can't be removed here");
  });

  it("refuses when nobody is signed in", async () => {
    const held = session.operatorId;
    session.operatorId = "";
    const result = await removeFeedbackFileAction(myFileId);
    session.operatorId = held;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("sign in");
  });
});
