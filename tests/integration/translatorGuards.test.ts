import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

/**
 * Phase 7's server guards — the translator's mirror of `coachRemoveGuards`.
 *
 * The same reasoning: these are questions about scoping and about requests the
 * portal will never make, so they are answered by making the request rather than
 * by opening two browsers. What the page lists is `findLegsForTranslator`, and
 * every mutation re-checks the assignment **for that leg specifically**.
 *
 * That last part is the whole point of this file. A translator can hold one leg
 * of a submission or both, and holding the intake leg must not authorise writing
 * to the response folder — an authorisation that is *per leg*, not per person and
 * not per submission, is the kind that looks right until someone tests it.
 */
const session = { operatorId: "", roles: ["translator"] as string[] };
vi.mock("@/domains/account", () => ({
  getSession: async () => (session.operatorId ? session : null),
  requireRole: async () => {
    if (!session.operatorId) throw new Error("no session");
    return session;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db } = await import("@/shared/db");
const { operatorTable } = await import("@/domains/operator/model/operatorTable");
const { createOperator } = await import("@/domains/account/api/loginApi");
const { grantRole } = await import("@/domains/operator/api/operatorRoleApi");
const {
  createSubmission,
  deleteSubmission,
  updateSubmission,
  addSubmissionFile,
  assignOperator,
  getSubmission,
  listFilesByKinds,
  markTranslatorCollected,
} = await import("@/domains/submission");
const { findLegsForTranslator } = await import("@/domains/translation");
const { handBackTranslationAction, removeTranslationFileAction } = await import(
  "@/domains/translation/api/translationActions"
);
const { inArray } = await import("drizzle-orm");
/*
  The dev upload route itself, not the action beside it. 7.11 says "refused by
  the upload routes", and the remove action is a different guard — testing that
  one and marking this one is how a check goes green on the wrong evidence.
*/
const { POST: translationUpload } = await import(
  "@/app/api/translation/upload/route"
);
const { succeeded, failed } = await import("@/shared/lib/actionResult");

const stamp = `${process.hrtime.bigint()}`;
const operators: string[] = [];
const submissions: string[] = [];

/** Holds the intake leg of `mine`, and nothing else. */
let alice = "";
/** Holds the feedback leg of `mine`, and both legs of `theirs`. */
let bob = "";
let mineId = "";
let theirsId = "";

async function makeTranslator(label: string): Promise<string> {
  const op = await createOperator(
    `qa-${label}-${stamp}@integration.test`,
    "password-123",
    `QA ${label}`,
  );
  await grantRole(op.id, "translator", null);
  operators.push(op.id);
  return op.id;
}

async function makeSubmission(): Promise<string> {
  const s = await createSubmission({
    customerEmail: `qa-t-${stamp}-${submissions.length}@integration.test`,
    playerName: "QA Player",
    playerAge: 12,
    focus: "Hitting",
    customerNotes: "",
    languages: ["Japanese"],
  });
  submissions.push(s.id);
  return s.id;
}

async function addFile(submissionId: string, kind: string, filename: string) {
  return addSubmissionFile(
    {
      submissionId,
      filename,
      contentType: "video/mp4",
      sizeBytes: 1024,
      fileUrl: `qa/${stamp}/${filename}`,
    },
    kind as Parameters<typeof addSubmissionFile>[1],
  );
}

beforeAll(async () => {
  alice = await makeTranslator("alice");
  bob = await makeTranslator("bob");

  mineId = await makeSubmission();
  await assignOperator(mineId, alice, "intake_translation");
  await assignOperator(mineId, bob, "feedback_translation");
  await updateSubmission(mineId, { status: "sent_to_intake_translator" });

  theirsId = await makeSubmission();
  await assignOperator(theirsId, bob, "intake_translation");
  await assignOperator(theirsId, bob, "feedback_translation");
  await updateSubmission(theirsId, { status: "sent_to_intake_translator" });

  session.operatorId = alice;
});

afterAll(async () => {
  for (const id of submissions) await deleteSubmission(id);
  if (operators.length) {
    await db.delete(operatorTable).where(inArray(operatorTable.id, operators));
  }
});

describe("7.1/7.2.2 — a translator's legs are their own", () => {
  it("7.1 lists only the legs assigned to them", async () => {
    const hers = await findLegsForTranslator(alice);
    expect(hers).toHaveLength(1);
    expect(hers[0]!.submission.id).toBe(mineId);
    expect(hers[0]!.leg.produces).toBe("intake_translation");

    // Bob holds three: the return leg of `mine`, and both legs of `theirs`.
    const his = await findLegsForTranslator(bob);
    expect(his).toHaveLength(3);
  });

  /*
    7.6 — both legs of one submission, held by one person. They must arrive as
    two separate pieces of work: the queue is keyed on `produces`, not on the
    submission, precisely so this case is not one card that means two things.
  */
  it("7.6 gives one translator two independent cards for two legs", async () => {
    const his = (await findLegsForTranslator(bob)).filter(
      (l) => l.submission.id === theirsId,
    );
    expect(his).toHaveLength(2);
    expect(new Set(his.map((l) => l.leg.produces))).toEqual(
      new Set(["intake_translation", "feedback_translation"]),
    );
  });

  /*
    7.2.2/7.2.3 — the rung is earned by the assigned translator opening the
    files, and only once. A bystander opening the same file earns nothing.
  */
  it("7.2.2 another translator's download earns nothing", async () => {
    expect(await markTranslatorCollected(mineId, bob)).toBeNull();
    expect((await getSubmission(mineId))?.status).toBe("sent_to_intake_translator");
  });

  it("7.2.3 the assigned translator earns it once, not twice", async () => {
    expect((await markTranslatorCollected(mineId, alice))?.status).toBe(
      "intake_translating",
    );
    expect(await markTranslatorCollected(mineId, alice)).toBeNull();
  });
});

describe("7.3.x/7.8–7.11 — uploading, removing and handing back", () => {
  it("7.8 refuses a hand-back with nothing in the folder", async () => {
    const result = await handBackTranslationAction(mineId, "intake_translation");
    expect(failed(result)).toBe(true);
    expect(failed(result) ? result.error : "").toContain("the folder is empty");
  });

  it("7.3.2 removes one of two and leaves the other", async () => {
    const keep = await addFile(mineId, "intake_translation", "keep-JA.mp4");
    const drop = await addFile(mineId, "intake_translation", "drop-JA.mp4");

    expect(succeeded((await removeTranslationFileAction(drop.id)))).toBe(true);

    const left = (await listFilesByKinds(mineId, ["intake_translation"])).map(
      (f) => f.id,
    );
    expect(left).toEqual([keep.id]);
  });

  /*
    7.11 — the leg, not the submission. Alice is genuinely working on `mine`;
    she still may not touch the response folder, because that leg is Bob's.
  */
  it("7.11 refuses a file on a leg she doesn't hold, on a submission she does", async () => {
    const bobs = await addFile(mineId, "feedback_translation", "bobs-EN.mp4");
    const result = await removeTranslationFileAction(bobs.id);
    expect(failed(result)).toBe(true);
    expect(failed(result) ? result.error : "").toContain("isn't assigned to you");
  });

  it("7.11 refuses an upload to the leg she doesn't hold", async () => {
    const url = `http://test/api/translation/upload?submission=${mineId}&kind=feedback_translation&filename=wrong-leg.mp4`;
    const response = await translationUpload(
      new Request(url, { method: "POST", body: "bytes", headers: { "content-type": "video/mp4" } }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("Not your leg");
  });

  it("7.11 accepts one on the leg she does", async () => {
    const url = `http://test/api/translation/upload?submission=${mineId}&kind=intake_translation&filename=right-leg.mp4`;
    const response = await translationUpload(
      new Request(url, { method: "POST", body: "bytes", headers: { "content-type": "video/mp4" } }),
    );
    expect(response.status).toBe(200);
  });

  it("7.10 refuses a hand-back for someone else's leg", async () => {
    const result = await handBackTranslationAction(theirsId, "intake_translation");
    expect(failed(result)).toBe(true);
    expect(failed(result) ? result.error : "").toContain("isn't assigned to you");
  });

  /*
    7.3.3 — remove the last file, *then* hand back. Distinct from 7.8, which
    never had one: this is the folder going empty under a translator who has
    been working in it, which is the sequence that actually happens.
  */
  it("7.3.3 refuses a hand-back after the last file is removed", async () => {
    for (const f of await listFilesByKinds(mineId, ["intake_translation"])) {
      await removeTranslationFileAction(f.id);
    }
    expect(await listFilesByKinds(mineId, ["intake_translation"])).toHaveLength(0);
    const result = await handBackTranslationAction(mineId, "intake_translation");
    expect(failed(result)).toBe(true);
    expect(failed(result) ? result.error : "").toContain("the folder is empty");
    await addFile(mineId, "intake_translation", "final-JA.mp4");
  });

  it("7.4 hands back when the folder has something in it", async () => {
    const result = await handBackTranslationAction(mineId, "intake_translation");
    expect(succeeded(result)).toBe(true);
    expect((await getSubmission(mineId))?.status).toBe("intake_translated");
  });

  /*
    7.9 — the second tab. The first hand-back moved the rung; the second finds a
    leg that has already moved on and must not walk it forward again.
  */
  it("7.9 refuses a second hand-back", async () => {
    const result = await handBackTranslationAction(mineId, "intake_translation");
    expect(failed(result)).toBe(true);
    expect(failed(result) ? result.error : "").toContain("already moved on");
  });

  /*
    7.3.4 — the stale tab's remove. Past the hand-back the file is what the
    admin is looking at, exactly as it is on the coach's side (6.11).
  */
  it("7.3.4 refuses a remove once the leg is handed back", async () => {
    const [file] = await listFilesByKinds(mineId, ["intake_translation"]);
    const result = await removeTranslationFileAction(file!.id);
    expect(failed(result)).toBe(true);
    expect(failed(result) ? result.error : "").toContain("already been handed back");
  });

  /*
    7.3.5's second half: the material they were *given*. A translator reads the
    intake folder and writes the translation folder; a remove aimed at either
    original is refused whoever asks, which is not the same guard as ownership.
  */
  it("7.3.5 refuses a remove aimed at the customer's or the coach's own files", async () => {
    session.operatorId = alice;
    for (const kind of ["intake", "feedback"]) {
      const original = await addFile(mineId, kind, `original-${kind}.mp4`);
      const result = await removeTranslationFileAction(original.id);
      expect(failed(result)).toBe(true);
      expect(failed(result) ? result.error : "").not.toContain("already gone");
    }
  });

  it("7.3.5 refuses a remove on another translator's submission entirely", async () => {
    const theirs = await addFile(theirsId, "intake_translation", "not-mine.mp4");
    const result = await removeTranslationFileAction(theirs.id);
    expect(failed(result)).toBe(true);
    expect(failed(result) ? result.error : "").toContain("isn't assigned to you");
  });
});

/*
  7.13 — a swept leg. The rows outlive the bytes deliberately, so the portal can
  still say what was handed over; `fileUrl` going null is the whole signal.
*/
describe("7.13 — a leg the retention sweep has cleared", () => {
  it("still lists its files, without locators", async () => {
    const swept = await makeSubmission();
    await assignOperator(swept, alice, "intake_translation");
    await updateSubmission(swept, { status: "intake_translated" });
    await addSubmissionFile(
      {
        submissionId: swept,
        filename: "gone-JA.mp4",
        contentType: "video/mp4",
        sizeBytes: 1024,
        fileUrl: null as unknown as string,
      },
      "intake_translation",
    );

    const leg = (await findLegsForTranslator(alice)).find(
      (l) => l.submission.id === swept,
    );
    expect(leg?.produced).toHaveLength(1);
    expect(leg?.produced[0]?.fileUrl).toBeFalsy();
    expect(leg?.produced[0]?.filename).toBe("gone-JA.mp4");
  });
});

/* 7.12 — nobody's translator. The page shows its calm empty panel off this. */
describe("7.12 — a translator with nothing assigned", () => {
  it("has no legs", async () => {
    const nobody = await makeTranslator("nobody");
    expect(await findLegsForTranslator(nobody)).toHaveLength(0);
  });
});
