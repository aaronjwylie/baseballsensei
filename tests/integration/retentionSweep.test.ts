import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 — the nightly sweep, end to end, with real bytes on disk.
 *
 * `npm run simulate` walks the sweep too, but it walks it forward through one
 * submission's whole life. This asks the questions Phase 9 actually poses:
 * **does a submission become due at the right moment**, does the warning go out
 * once and only once, do the bytes actually leave storage, and does the record
 * survive them (9.1, 9.3, 9.4).
 *
 * The clocks are moved rather than waited on — `completedAt` and `collectedAt`
 * are the two the sweep reads, so ageing them is the same as waiting 90 days,
 * and it is the only way to test a window measured in months.
 */
const session = { operatorId: "sweep-test", roles: ["admin"] as string[] };
vi.mock("@/domains/account", () => ({
  getSession: async () => session,
  requireRole: async () => session,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const {
  createSubmission,
  deleteSubmission,
  updateSubmission,
  addSubmissionFile,
  getSubmission,
  listAllSubmissionFiles,
} = await import("@/domains/submission");
const { runRetentionSweep } = await import("@/domains/upload");
const { getSettings } = await import("@/domains/settings");
const { storage } = await import("@/shared/storage");
const { GET: fileRoute } = await import("@/app/api/files/[id]/route");

const stamp = `${process.hrtime.bigint()}`;
const submissions: string[] = [];
const DAY = 24 * 3600_000;

/**
 * A released submission with one real object behind it, aged by `days`.
 *
 * `deliveredDays` splits the two clocks apart. They move together for most of
 * these tests, but the whole point of the rule is what happens when they
 * disagree, and a helper that can only age them in lockstep cannot ask that.
 */
async function aged(
  days: number,
  deliveredDays: number = days,
): Promise<{ id: string; fileId: string }> {
  const s = await createSubmission({
    customerEmail: `qa-sweep-${stamp}-${submissions.length}@integration.test`,
    playerName: "QA Sweep",
    playerAge: 12,
    focus: "Hitting",
    customerNotes: "",
    languages: ["English"],
  });
  submissions.push(s.id);

  const key = `submissions/${s.id}/feedback/sweep-${stamp}.txt`;
  const fileUrl = await storage.save(key, new TextEncoder().encode("bytes"), "text/plain");
  const file = await addSubmissionFile(
    {
      submissionId: s.id,
      filename: "sweep.txt",
      contentType: "text/plain",
      sizeBytes: 5,
      fileUrl,
    },
    "feedback",
  );

  await updateSubmission(s.id, {
    status: "collected",
    completedAt: new Date(Date.now() - deliveredDays * DAY).toISOString(),
    collectedAt: new Date(Date.now() - days * DAY).toISOString(),
  });
  return { id: s.id, fileId: file.id };
}

beforeAll(async () => {
  // A real store is the point of this file — a mocked one would prove nothing
  // about whether the bytes actually go.
  expect(storage.supportsDirectUpload).toBe(false);
});

afterAll(async () => {
  for (const id of submissions) await deleteSubmission(id);
});

describe("9.1/9.4 — the windows, and the one warning", () => {
  it("leaves a submission alone before either clock runs out", async () => {
    const { id } = await aged(1);
    const report = await runRetentionSweep();
    expect(report.failures).toBe(0);
    const after = await getSubmission(id);
    expect(after?.status).toBe("collected");
    expect(after?.deletionWarnedAt).toBeFalsy();
    expect(after?.filesPurgedAt).toBeFalsy();
  });

  /*
    One clock at a time, and collection supersedes the backstop: a submission
    the customer downloaded is governed by `retainCollectedDays` from *that*
    moment, and the delivery backstop no longer applies to it.

    This is the case that separates the rule from "whichever is later" —
    collected long ago, delivered recently. Under the old form it was months
    from due; under this one it is due now, which is what `/admin/settings` and
    the ⑨ warning email have always said (Ben, 2026-09-10).
  */
  it("9.4b a collected submission runs on its own clock, not the backstop", async () => {
    const settings = await getSettings();
    const { id } = await aged(settings.retainCollectedDays + 1, 1);

    const report = await runRetentionSweep();
    expect(report.failures).toBe(0);
    const after = await getSubmission(id);
    expect(after?.deletionWarnedAt).toBeTruthy();
    expect(after?.status).toBe("purge_imminent");
  });

  /*
    And the backstop still governs the customer who never came for it. Delivered
    past `retainDeliveredDays`, never collected — due, and warned, which is the
    case that used to be purged in silence.
  */
  it("9.4c an uncollected submission rests on the delivery backstop", async () => {
    const settings = await getSettings();
    const { id } = await aged(0, settings.retainDeliveredDays + 1);
    await updateSubmission(id, { collectedAt: null, status: "complete" });

    const report = await runRetentionSweep();
    expect(report.failures).toBe(0);
    const after = await getSubmission(id);
    expect(after?.deletionWarnedAt).toBeTruthy();
  });

  it("9.4 warns once, and only once, when both clocks have run out", async () => {
    const settings = await getSettings();
    const past = Math.max(settings.retainCollectedDays, settings.retainDeliveredDays) + 1;
    const { id } = await aged(past);

    const first = await runRetentionSweep();
    expect(first.warningsSent).toBeGreaterThanOrEqual(1);
    const warned = await getSubmission(id);
    expect(warned?.status).toBe("purge_imminent");
    expect(warned?.deletionWarnedAt).toBeTruthy();

    // ⑨ is stamped even when the send fails, so a missed email cannot become
    // seven — which means a second sweep must find nothing to warn about.
    const second = await runRetentionSweep();
    const stillWarned = await getSubmission(id);
    expect(stillWarned?.deletionWarnedAt).toBe(warned?.deletionWarnedAt);
    expect(second.warningsSent).toBe(0);
  });
});

describe("9.1/9.3 — the purge, and what outlives it", () => {
  it("takes the bytes, keeps the row, and answers 410", async () => {
    const settings = await getSettings();
    const past =
      Math.max(settings.retainCollectedDays, settings.retainDeliveredDays) +
      settings.warnBeforeDeletionDays +
      2;
    const { id, fileId } = await aged(past);

    // Warn first — the sweep will not purge something it has not warned about.
    await runRetentionSweep();
    await updateSubmission(id, {
      deletionWarnedAt: new Date(
        Date.now() - (settings.warnBeforeDeletionDays + 1) * DAY,
      ).toISOString(),
    });

    const report = await runRetentionSweep();
    expect(report.filesDeleted).toBeGreaterThanOrEqual(1);

    const after = await getSubmission(id);
    expect(after?.status).toBe("purged");
    expect(after?.filesPurgedAt).toBeTruthy();

    // The record outlives the bytes, deliberately: the portal can still say
    // what was sent.
    // `listAllSubmissionFiles`, because this file is the coach's. The
    // intake-only readers are named for their side now, so reaching for the
    // wrong one is a compile-time question rather than an empty array.
    const [row] = await listAllSubmissionFiles(id);
    expect(row?.filename).toBe("sweep.txt");
    expect(row?.fileUrl).toBeFalsy();

    // 9.3 — the locator is gone, so the route says Gone rather than Not Found.
    const response = await fileRoute(new Request(`http://test/api/files/${fileId}`), {
      params: Promise.resolve({ id: fileId }),
    });
    expect(response.status).toBe(410);
  });
});
