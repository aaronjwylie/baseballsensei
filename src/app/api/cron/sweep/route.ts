import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/shared/config/env";
import { runRetentionSweep } from "@/domains/upload";

/**
 * The nightly retention sweep, driven by Vercel Cron (`vercel.json`).
 *
 * **Daily (`0 4 * * *`), because Vercel's Hobby plan only permits once-a-day
 * crons** — an hourly schedule fails the deployment outright. That costs
 * precision on the RESOLVED rule only: "delete uploads 24h after completion"
 * becomes 24–48h in practice, since the job can only notice an elapsed window
 * when it runs. The ABANDONED rule doesn't depend on this schedule at all —
 * `startSubmissionAction` sweeps unpaid submissions too, so the flow cleans up
 * after itself under any real traffic. Move to `0 * * * *` on Pro.
 * (This note lived in `vercel.json` as a `"//"` key, which Vercel's schema
 * rejects — it broke every build until it was moved here.)
 *
 * Guarded by `CRON_SECRET`, which Vercel sends as `Authorization: Bearer …` on
 * its own invocations. Without the guard this is a public endpoint that deletes
 * customer files, so a **missing secret refuses rather than allows** — the one
 * place in the app where absent config must not degrade gracefully.
 *
 * `maxDuration` is raised because the work is proportional to how many
 * submissions came due, and each file is a round trip to Blob.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!env.cronSecret) {
    console.error("[cron/sweep] CRON_SECRET is unset — refusing to run.");
    return new Response("Not configured", { status: 503 });
  }

  // Constant-time compare so the response latency can't leak the secret a byte
  // at a time. Length is compared first because `timingSafeEqual` throws on a
  // length mismatch — and length alone isn't the secret.
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret}`;
  const ok =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const report = await runRetentionSweep();
    console.log(JSON.stringify({ event: "retention_sweep", ...report }));
    return NextResponse.json(report);
  } catch (err) {
    console.error("[cron/sweep] failed:", err);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
