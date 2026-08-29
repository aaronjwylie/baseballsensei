/**
 * The payoff email — the coach's breakdown is ready.
 *
 * Sent when the admin approves a submission (`approveAndComplete`). By this point the
 * customer left the site days ago, so email is the only way to reach them. The
 * link is the status page rather than a single file, because a review may now be
 * several files: the customer looks up their email and downloads each one.
 */
import { emailShell, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";

export function sendFeedbackReady(
  to: string,
  feedbackUrl: string,
  playerName?: string,
  retentionDays?: number,
) {
  /*
    The retention line is not a nicety.

    Everything is swept together — the customer's uploads *and* the coach's
    response — so this message and the ⑨ warning are the only protection against
    a parent losing a review they cannot recreate. A deadline disclosed at
    delivery is a term of the service; disclosed a week out, it's a surprise.
  */
  const retention = retentionDays
    ? `<p><strong>Download and keep it.</strong> We delete everything ${retentionDays} days after you first download it, so save a copy of anything you want to hold on to.</p>`
    : "";

  return sendEmail({
    to,
    subject: `${site.name} — your coaching feedback is ready`,
    html: emailShell(
      "Your feedback is ready 🎬",
      `<p>Your coach has finished reviewing${playerName ? ` ${escapeFeedbackHtml(playerName)}'s` : " your"} submission. Tap below to download the full breakdown — this link is private to you.</p>${retention}`,
      { label: "See your feedback", url: feedbackUrl },
    ),
  });
}

/**
 * The access code for the status-page path: a customer who lost the link above
 * can prove they own the inbox by entering their email on `/status` and reading
 * back this code. Same guarantee as the link — you must control the inbox.
 */
export function sendFeedbackViewCode(to: string, code: string) {
  return sendEmail({
    to,
    subject: `${code} is your ${site.name} feedback access code`,
    html: emailShell(
      "Your feedback access code",
      `<p>Enter this code on the status page to view your coaching feedback:</p>
       <p style="margin:24px 0;font-size:34px;font-weight:700;letter-spacing:0.18em;color:#161616;">${code}</p>
       <p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    ),
  });
}

/**
 * ⑤ — the coach has delivered; it's waiting on the admin. To the admin and the coach.
 *
 * The approval gate exists so nothing reaches a customer unchecked, which means
 * a delivered review sits still until a person looks at it. Every other handover
 * in the pipeline notifies; this one didn't, so the coach pressed "send" and the
 * only person who could release it had no idea.
 *
 * The coach is copied so they can see their work arrived — the same reason a
 * "message sent" confirmation exists at all.
 */
export function sendResponseSubmittedEmail(opts: {
  to: string[];
  coachName: string;
  playerName: string;
  fileCount: number;
  reviewUrl: string;
}) {
  // Nobody to tell — an install with no admin row. Reported as a
  // non-send rather than thrown, so a webhook never fails over it.
  if (opts.to.length === 0)
    return Promise.resolve({ ok: false, error: "no recipients configured" });
  const coach = escapeFeedbackHtml(opts.coachName);
  const player = escapeFeedbackHtml(opts.playerName);
  const files = `${opts.fileCount} file${opts.fileCount === 1 ? "" : "s"}`;
  return sendEmail({
    to: opts.to,
    subject: `${site.name} — review ready to approve: ${opts.playerName}`,
    html: emailShell(
      "A review is waiting for approval",
      `<p><strong>${coach}</strong> has submitted ${files} for <strong>${player}</strong>.</p>
       <p><strong>The customer hasn't been told.</strong> Nothing reaches them until it's approved and sent.</p>`,
      { label: "Review and approve", url: opts.reviewUrl },
    ),
  });
}

/**
 * ⑦ — the customer has collected their feedback. To the admin.
 *
 * Closes the loop: the job is visibly finished, the row can be resolved, and the
 * retention clock has started. Without it, "did they ever pick it up?" is a
 * question the queue can't answer, and marking something resolved becomes a
 * guess.
 */
export function sendCustomerCollectedEmail(opts: {
  to: string[];
  playerName: string;
  submissionUrl: string;
}) {
  // Nobody to tell — an install with no admin row. Reported as a
  // non-send rather than thrown, so a webhook never fails over it.
  if (opts.to.length === 0)
    return Promise.resolve({ ok: false, error: "no recipients configured" });
  const player = escapeFeedbackHtml(opts.playerName);
  return sendEmail({
    to: opts.to,
    subject: `${site.name} — ${opts.playerName}'s feedback was collected`,
    html: emailShell(
      "The customer has their feedback",
      `<p>The review for <strong>${player}</strong> has been downloaded.</p>
       <p>The job is done — it can be marked resolved whenever you like. Their uploads are now on the retention clock.</p>`,
      { label: "Open the queue", url: opts.submissionUrl },
    ),
  });
}

/** Customer-supplied names land in HTML; escaping is not optional. */
function escapeFeedbackHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * ⑧ — thank you, and come back. To the customer.
 *
 * Sent when the admin marks a submission resolved, which is deliberately **before**
 * the purge rather than after: the invitation should land while they still have
 * their files, not once we've deleted them.
 *
 * It also carries the retention deadline, which is the last time anyone tells
 * them in a message they're likely to keep.
 */
export function sendThankYouEmail(opts: {
  to: string;
  playerName: string;
  retentionDays: number;
  startUrl: string;
}) {
  const player = escapeFeedbackHtml(opts.playerName);
  return sendEmail({
    to: opts.to,
    subject: `${site.name} — thanks, and see you next time`,
    html: emailShell(
      "Thanks for training with us",
      `<p>We hope the feedback on <strong>${player}</strong> was useful.</p>
       <p>A reminder: the files stay on our servers for <strong>${opts.retentionDays} days</strong> after you download them, so keep a copy of anything you want to hold on to.</p>
       <p>Whenever there's new footage, we'd love to see it.</p>`,
      { label: "Send another submission", url: opts.startUrl },
    ),
  });
}

/**
 * ⑨ — the deletion warning. To the customer.
 *
 * The last chance to grab another copy, and the only protection against a parent
 * losing a review they can't recreate: everything is swept together, the coach's
 * response included. Sent once, guarded by `deletionWarnedAt`.
 *
 * It should never be the *first* they hear of the deadline — ⑥ states it at
 * delivery, which is what makes this a reminder rather than a surprise.
 */
export function sendDeletionWarning(opts: {
  to: string;
  playerName: string;
  deletesOn: Date;
  daysLeft: number;
}) {
  const player = escapeFeedbackHtml(opts.playerName);
  const when = opts.deletesOn.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return sendEmail({
    to: opts.to,
    subject: `${site.name} — your files are deleted in ${opts.daysLeft} days`,
    html: emailShell(
      "Save anything you still want",
      `<p>The files from <strong>${player}</strong>'s review — everything you sent us, and the coach's response — are deleted from our servers on <strong>${when}</strong>.</p>
       <p>If you've already saved your copy, there's nothing to do. If not, this is the last reminder: download it now and keep it somewhere safe.</p>`,
    ),
  });
}
