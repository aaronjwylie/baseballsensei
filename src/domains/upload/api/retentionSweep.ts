/**
 * Deleting files once they've served their purpose.
 *
 * Three rules that do **genuinely different things**, on operator-tunable clocks,
 * all relative to the submission's own timestamps — never to a wall clock:
 *
 * | | resolved | archived-while-owed | abandoned |
 * | --- | --- | --- | --- |
 * | who | a completed review | a paid submission set aside before release | never paid for |
 * | clock | delivery/collection window after `completedAt`/`collectedAt` | the delivery window (`retainDeliveredDays`) after **its** `archivedAt` | `retainUnpaidHours` after **its** `submittedAt` |
 * | warning | yes (`findWarningDue`) | **no** — the customer was never handed a link | n/a |
 * | files | deleted | deleted | deleted |
 * | record | **kept**, locator cleared | **kept**, locator cleared | **deleted outright** |
 *
 * The middle rule (Ben, QA 5.6) exists because archiving a live submission takes
 * it off the queue but leaves a paid customer's video that no other clock was
 * watching — `findResolvedDue` can't reach an unreleased status. It rides the
 * same window a completed submission's files do, only measured from the archive
 * and with the warning suppressed.
 *
 * The asymmetry is the point. A paid submission's history matters — the receipt
 * and the portal still have to say what was sent. Nothing was ever bought in the
 * abandoned case, so there is no history to preserve and a kept row is just
 * noise in the queue. **Only payment earns retention** (the client, 2026-07-30).
 *
 * **The coach's feedback is swept with everything else, but never unwarned.**
 * The files — uploads and feedback alike — go once the retention window closes,
 * and the window is anchored on collection *or*, for a customer who never came
 * for it, on a delivery backstop. Either way a one-week warning is sent first
 * (`findWarningDue` covers both clocks), so the customer always has notice and a
 * last chance to download before the link stops working.
 *
 * The cron cadence is a separate question from the rules. The job only *notices*
 * an elapsed window when it runs, so a daily job makes "24 hours after
 * completion" mean 24–48 in practice. Abandoned submissions don't wait for it —
 * `sweepAbandoned` is also called when a customer starts a new submission, so
 * the flow cleans up after itself under any real traffic.
 */
import { getSettings } from "@/domains/settings";
import {
  clearAllFileLocators,
  findAbandonedDue,
  findArchivedOwedDue,
  findResolvedDue,
  findWarningDue,
  listAllSubmissionFiles,
  noteEmailSent,
  updateSubmission,
} from "@/domains/submission";
import { sendDeletionWarning } from "@/domains/feedback";
import { storage } from "@/shared/storage";
import { discardUnpaidSubmission } from "./discardSubmission";

export interface SweepReport {
  /** Completed submissions whose files were removed; the records remain. */
  resolvedPurged: number;
  /** Archived-while-owed submissions purged on the same clock, minus the warning. */
  archivedOwedPurged: number;
  /** Unpaid submissions deleted outright. */
  abandonedDiscarded: number;
  /** Customers told their files are about to go. */
  warningsSent: number;
  filesDeleted: number;
  failures: number;
}

/**
 * Forget the bytes, keep the record — the shared body of both paid purges.
 *
 * Removes every stored object, clears the locators so the portal can still say
 * what was there, and moves the submission to `purged`. The two callers differ
 * only in *which* window put the submission here and whether a warning preceded
 * it; the deletion itself must not drift between them.
 */
async function purgeSubmissionFiles(
  submissionId: string,
  report: SweepReport,
): Promise<void> {
  const files = await listAllSubmissionFiles(submissionId);
  for (const file of files) {
    if (!file.fileUrl) continue;
    try {
      await storage.remove(file.fileUrl);
      report.filesDeleted += 1;
    } catch (err) {
      // Keep going: one unreachable object must not strand the rest of the
      // sweep. The locator is cleared either way — a file we can't delete is one
      // we've already lost track of.
      report.failures += 1;
      console.error(`[sweep] could not delete ${file.fileUrl}:`, err);
    }
  }
  await clearAllFileLocators(submissionId);
  await updateSubmission(submissionId, {
    filesPurgedAt: new Date().toISOString(),
    status: "purged",
  });
}

export async function runRetentionSweep(): Promise<SweepReport> {
  const report: SweepReport = {
    resolvedPurged: 0,
    archivedOwedPurged: 0,
    abandonedDiscarded: 0,
    warningsSent: 0,
    filesDeleted: 0,
    failures: 0,
  };

  const settings = await getSettings();
  const now = Date.now();
  const days = (n: number) => n * 24 * 3600_000;

  /*
    ── warn before deleting ────────────────────────────────────────────────

    Runs *before* the purge, and against a nearer cutoff, so a submission is
    always warned in an earlier sweep than the one that deletes it. Running the
    purge first would let a single night both warn and delete, which is a
    warning in name only.

    The one genuinely scheduled effect in the system: "delete what's due" is
    derivable from state, "warn a week out" is a one-off. `deletionWarnedAt` is
    what stops it firing every night of that week.
  */
  if (settings.warnBeforeDeletionDays > 0) {
    // Two cutoffs, one per clock, each `warnBeforeDeletionDays` ahead of the
    // deadline it guards — so a collected submission is warned before its
    // collection deadline and a never-collected one before the delivery
    // backstop. The backstop used to warn no one; that's what deleted paid-for
    // feedback in silence.
    // `Math.max(0, …)` guards the subtraction: the settings schema's cross-field
    // refine already forbids a warning longer than either window, but a legacy
    // or hand-edited row could still make `retain - warn` negative, which would
    // push the cutoff into the future and warn every just-delivered submission.
    // Clamped, the worst a bad row does is warn a touch early, never falsely.
    const collectedWarnCutoff = new Date(
      now -
        days(
          Math.max(
            0,
            settings.retainCollectedDays - settings.warnBeforeDeletionDays,
          ),
        ),
    );
    const deliveredWarnCutoff = new Date(
      now -
        days(
          Math.max(
            0,
            settings.retainDeliveredDays - settings.warnBeforeDeletionDays,
          ),
        ),
    );
    for (const submission of await findWarningDue(
      collectedWarnCutoff,
      deliveredWarnCutoff,
    )) {
      // Whichever clock anchors this one: its own collection, or the delivery
      // backstop when it was never collected.
      const deletesOn = submission.collectedAt
        ? new Date(
            new Date(submission.collectedAt).getTime() +
              days(settings.retainCollectedDays),
          )
        : new Date(
            new Date(submission.completedAt!).getTime() +
              days(settings.retainDeliveredDays),
          );
      try {
        if (submission.customerEmail) {
          const result = await sendDeletionWarning({
            to: submission.customerEmail,
            playerName: submission.playerName,
            deletesOn,
            daysLeft: settings.warnBeforeDeletionDays,
          });
          void noteEmailSent(
            submission.id,
            "⑨ deletion warning → customer",
            result,
            // Worth saying out loud in the trail: the stamp lands either way, so
            // a failure here is a customer who will never be warned again.
            result.ok ? undefined : "stamped regardless — this will not retry",
          );
        }
        // Stamped whether or not the send worked. A warning we couldn't deliver
        // must not retry nightly — that turns one missed email into seven.
        await updateSubmission(submission.id, {
          deletionWarnedAt: new Date().toISOString(),
          status: "purge_imminent",
        });
        report.warningsSent += 1;
      } catch (err) {
        report.failures += 1;
        console.error(`[sweep] warning ${submission.id} failed:`, err);
      }
    }
  }

  /*
    ── purge: forget the bytes, keep the record ────────────────────────────

    **Everything goes together** — the customer's uploads and the coach's
    response alike. Safe because nothing is deleted without a warning that has
    had its full notice period to land: `warnedBefore` requires the warning to
    be at least `warnBeforeDeletionDays` old, so a submission warned earlier in
    *this* same run (stamped `now`) is not yet eligible, and the guarantee holds
    even when a cron gap makes warn and purge come due together.

    The rows survive with their locators cleared, so the portal can still say
    what was there, and the submission itself is kept **forever**. Only the
    bytes go.
  */
  const warnedBefore =
    settings.warnBeforeDeletionDays > 0
      ? new Date(now - days(settings.warnBeforeDeletionDays))
      : null;
  const due = await findResolvedDue(
    new Date(now - days(settings.retainCollectedDays)),
    new Date(now - days(settings.retainDeliveredDays)),
    warnedBefore,
  );

  for (const submission of due) {
    await purgeSubmissionFiles(submission.id, report);
    report.resolvedPurged += 1;
  }

  /*
    ── archived while still owed: the same purge, no warning ────────────────

    A paid submission set aside before it ever reached the customer (QA 5.6).
    No delivery or collection clock was ever watching it, so it rides the
    delivery backstop measured from when it was **archived** — the same window a
    completed submission's files get. The difference the customer's absence earns
    it: **no warning email**, because they were never handed a link to lose. The
    bytes go, the record stays, exactly like the resolved purge above.
  */
  for (const submission of await findArchivedOwedDue(
    new Date(now - days(settings.retainDeliveredDays)),
  )) {
    await purgeSubmissionFiles(submission.id, report);
    report.archivedOwedPurged += 1;
  }

  // ── abandoned: leave nothing behind ────────────────────────────────────
  const abandoned = await sweepAbandoned(settings.retainUnpaidHours);
  report.abandonedDiscarded = abandoned.discarded;
  report.filesDeleted += abandoned.filesDeleted;

  return report;
}

/**
 * Discard unpaid submissions that have gone quiet.
 *
 * Split out because it has **two callers**: this sweep, and
 * `startSubmissionAction` — so the flow tidies up after itself the moment
 * anyone else starts a submission, rather than waiting for a cron job. That's
 * what keeps "no retention of something unpaid" true even on a plan where the
 * cron only runs daily.
 *
 * `limit` bounds the work because one of those callers is a customer waiting on
 * a page. Anything left over is picked up by the next call — and the count is
 * returned rather than swallowed, so a persistent backlog is visible in the logs
 * instead of looking like success.
 */
export async function sweepAbandoned(
  retainUnpaidHours: number,
  limit = 25,
): Promise<{ discarded: number; filesDeleted: number; remaining: boolean }> {
  const cutoff = new Date(Date.now() - retainUnpaidHours * 3600_000);
  const due = await findAbandonedDue(cutoff, limit);

  let discarded = 0;
  let filesDeleted = 0;

  for (const submission of due) {
    const files = await listAllSubmissionFiles(submission.id);
    const ok = await discardUnpaidSubmission(submission.id);
    if (ok) {
      discarded += 1;
      filesDeleted += files.filter((f) => f.fileUrl).length;
    }
  }

  const remaining = due.length === limit;
  if (remaining) {
    console.log(
      `[sweep] discarded ${discarded} abandoned submissions and hit the limit of ${limit} — more remain`,
    );
  }

  return { discarded, filesDeleted, remaining };
}
