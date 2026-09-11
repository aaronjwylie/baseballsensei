import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * QA 10.6 — two tabs, one browser, one flow cookie.
 *
 * The cookie is per browser and names *the* submission this browser started;
 * each tab's step is React state. So a second tab submitting step 1 re-points
 * the cookie at its own submission, and until 2026-09-10 the first tab carried
 * on against that row without knowing: its code was refused (checked against
 * the wrong submission), then accepted (that one was verified by then, and
 * re-verifying is a no-op), its upload was refused as "session timed out", and
 * it would have paid for details it never entered (Ben).
 *
 * The rule now: **newest start wins, and the other tab is told**. Every action
 * past step 1 says which submission the tab is on; the server refuses with the
 * reason when the cookie disagrees. This drives the real actions against the
 * real database with the cookie jar in memory — the one thing the actions need
 * from Next.
 */
// The flow cookie is a signed JWT, and `env.ts` throws at point of use without
// a secret. Any value will do: nothing here checks a signature across runs.
process.env.AUTH_SECRET ??= "qa-two-tabs-secret";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
  headers: async () => new Headers({ "x-forwarded-for": "10.6.0.1" }),
}));
// Step 1 sends the code and refuses to advance if it can't. The flow only needs
// the transport to say yes; the message itself is another test's business.
vi.mock("@/domains/verification", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendVerificationCode: async () => ({ ok: true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const {
  startSubmissionAction,
  verifyCodeAction,
  listFlowFilesAction,
  createIntentAction,
  checkDeliveryAction,
  resendCodeAction,
  startAnotherAction,
} = await import("@/domains/checkout/api/checkoutActions");
const { authorizeUpload } = await import("@/domains/upload");
const { getSubmission, deleteSubmission, readFlowSession, FLOW_SUPERSEDED_MESSAGE } =
  await import("@/domains/submission");

const stamp = `${process.hrtime.bigint()}`;
const created: string[] = [];

/** Step 1, as a tab does it. Returns the submission the tab now believes it is on. */
async function start(tag: string): Promise<string> {
  const result = await startSubmissionAction({
    customerEmail: `qa-tabs-${stamp}-${tag}@integration.test`,
    playerName: `Tab ${tag}`,
    playerAge: "11",
    focus: "Hitting",
    customerNotes: "Two tabs, one browser — which one is this? (QA 10.6)",
    languages: "English",
  });
  if (!result.ok) throw new Error(`step 1 failed for ${tag}: ${result.error}`);
  created.push(result.data.submissionId);
  return result.data.submissionId;
}

const superseded = { ok: false, gone: true, error: FLOW_SUPERSEDED_MESSAGE };

afterAll(async () => {
  for (const id of created) if (await getSubmission(id)) await deleteSubmission(id);
});

describe("10.6 — the newest start owns the browser's flow, and the other tab is told", () => {
  it("a second tab's step 1 takes the cookie and discards the first tab's draft", async () => {
    const a = await start("A");
    expect(await readFlowSession()).toBe(a);

    const b = await start("B");
    expect(await readFlowSession()).toBe(b);
    // A never reached step 4, so `spareStarted` had nothing to spare — it goes
    // the way a refreshed scratch pad goes.
    expect(await getSubmission(a)).toBeNull();
    expect(await getSubmission(b)).not.toBeNull();

    // Everything the first tab can do next says why, and sends it to step 1.
    expect(await verifyCodeAction(a, "123456")).toMatchObject(superseded);
    expect(await listFlowFilesAction(a)).toMatchObject(superseded);
    expect(await createIntentAction(a)).toMatchObject(superseded);
    expect(await resendCodeAction(a)).toMatchObject(superseded);
    expect(await checkDeliveryAction(a)).toMatchObject(superseded);
  });

  it("the upload gate refuses the superseded tab with the reason, not a folder error", async () => {
    const a = await start("A2");
    const b = await start("B2");

    const refused = await authorizeUpload(a);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.status).toBe(401);
      expect(refused.refusal.error).toBe(FLOW_SUPERSEDED_MESSAGE);
    }

    // The winning tab, and a request with no claim at all, go on to the next
    // check — B is unverified, which is 403, not 401. The claim only narrows.
    for (const claim of [b, null]) {
      const next = await authorizeUpload(claim);
      expect(next.ok).toBe(false);
      if (!next.ok) expect(next.refusal.status).toBe(403);
    }
  });

  /*
    "Start over" in the losing tab must not reach across. It used to discard
    whatever the cookie named — the other tab's live submission — and clear the
    cookie out from under it.
  */
  it("Start over in the losing tab leaves the winning tab alone", async () => {
    const a = await start("A3");
    const b = await start("B3");

    expect(await startAnotherAction(a)).toEqual({ ok: true, data: undefined });
    expect(await readFlowSession()).toBe(b);
    expect(await getSubmission(b)).not.toBeNull();

    // The winning tab's own Start over still lets go.
    await startAnotherAction(b);
    expect(await readFlowSession()).toBeNull();
    expect(await getSubmission(b)).toBeNull();
  });

  it("a lapsed window still reads as a timeout, not as a takeover", async () => {
    const a = await start("A4");
    jar.clear();
    const result = await verifyCodeAction(a, "123456");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.gone).toBe(true);
      expect(result.error).not.toBe(FLOW_SUPERSEDED_MESSAGE);
      expect(result.error).toMatch(/timed out/);
    }
  });
});
