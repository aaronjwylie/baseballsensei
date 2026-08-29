/**
 * The hand-off messages — work arriving on someone's desk, and being picked up.
 *
 * **Neither of these is about coaching.** One says "a submission is ready for
 * you", the other tells the admin someone collected it, and both are true of a
 * translator word for word. They lived in `coachEmail.ts` until 2026-08-06, and
 * the missing `translatorEmail.ts` beside it was the evidence: a counterpart
 * that ought to exist and doesn't usually means the original was filed under
 * the wrong noun rather than that the second party needs no mail
 * (`_StructureLaw.md` §3a).
 *
 * So the recipient's **role is a parameter**, not a filename. Adding a fourth
 * role changes a string, not this file's existence.
 *
 * **Escape customer-supplied values.** Player names and filenames land in HTML;
 * `esc` is applied to every interpolation and any new template needs the same.
 */
import { emailShell, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";
import { env } from "@/shared/config/env";
import { formatFileSize, type Submission, type SubmissionFile } from "@/domains/submission";

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

interface AssignmentEmailInput {
  to: string;
  /** Who the work is going to. */
  recipientName: string;
  /**
   * Their role, and the portal it names.
   *
   * Both the word in the copy and the path in the button derive from this, so a
   * translator is never told to sign in to the coach portal — a link to the
   * wrong portal bounces them straight back out by `proxy.ts`, which routes each
   * role to its own.
   */
  role: "coach" | "translator";
  submission: Submission;
  files: SubmissionFile[];
}

/** Pure builder — the subject + HTML, separated from sending so it's testable. */
export function buildAssignmentEmail(
  opts: AssignmentEmailInput,
): { subject: string; html: string } {
  const { recipientName, role, submission, files } = opts;

  const details = [
    `<strong>Player:</strong> ${esc(submission.playerName)}${
      submission.playerAge ? `, age ${submission.playerAge}` : ""
    }`,
    submission.focus ? `<strong>Focus:</strong> ${esc(submission.focus)}` : null,
    `<strong>Customer:</strong> ${esc(submission.customerEmail)}`,
  ]
    .filter(Boolean)
    .map((line) => `<p style="margin:4px 0">${line}</p>`)
    .join("");

  const notes = submission.customerNotes
    ? `<p style="margin:12px 0 4px"><strong>Notes from the customer</strong></p>
       <p style="margin:0">${esc(submission.customerNotes).replace(/\n/g, "<br>")}</p>`
    : "";

  const available = files.filter((f) => f.fileUrl);
  const filesHtml = available.length
    ? `<p style="margin:16px 0 4px"><strong>Files to download</strong></p>
       <ul style="margin:0;padding-left:20px">${available
         .map(
           (f) =>
             `<li><a href="${env.siteUrl}/api/files/${f.id}">${esc(f.filename)}</a> — ${formatFileSize(f.sizeBytes)}</li>`,
         )
         .join("")}</ul>`
    : `<p style="margin:16px 0 4px"><strong>Files</strong></p>
       <p style="margin:0">No files are attached — they may have been removed by the retention sweep.</p>`;

  return {
    subject: `${site.name} — a new review is assigned to you`,
    html: emailShell(
      "You have a new review",
      `<p>Hi ${esc(recipientName)}, a submission is ready for your feedback.</p>
       ${details}
       ${notes}
       ${filesHtml}
       <p style="margin:16px 0 0">Sign in to the ${role} portal to upload your work when it's ready.</p>`,
      { label: `Open the ${role} portal`, url: `${env.siteUrl}/${role}` },
    ),
  };
}

export function sendAssignmentEmail(opts: AssignmentEmailInput) {
  const { subject, html } = buildAssignmentEmail(opts);
  return sendEmail({ to: opts.to, subject, html });
}

/**
 * ④ — the coach has collected the files. To the admin.
 *
 * The hand-off is the one step in the pipeline that waits on a person outside
 * the building, and until this exists the only way to know whether it landed is
 * to ask. A submission sitting in `sent_to_coach` for three days is the single
 * most useful thing the queue can surface; this is the message that says it
 * stopped sitting there.
 *
 * Best-effort — the status already moved, and a missed notification is a smaller
 * problem than a failed download.
 */
/**
 * Someone collected their work — told to the admin.
 *
 * `role` is the word the admin reads ("the coach", "the translator"), which is
 * why it is a plain string on the way in rather than the `Role` enum: this is
 * copy, and copy that happens to match an enum today is copy that breaks the
 * day the enum grows a value nobody wants printed.
 */
export function sendCollectedEmail(opts: {
  to: string[];
  collectorName: string;
  role: string;
  playerName: string;
  submissionUrl: string;
}) {
  // Nobody to tell — an install with no admin row. Reported as a
  // non-send rather than thrown, so a webhook never fails over it.
  if (opts.to.length === 0)
    return Promise.resolve({ ok: false, error: "no recipients configured" });
  const who = esc(opts.collectorName);
  const player = esc(opts.playerName);
  return sendEmail({
    to: opts.to,
    subject: `${site.name} — ${opts.collectorName} picked up ${opts.playerName}`,
    html: emailShell(
      `The ${opts.role} has the files`,
      `<p><strong>${who}</strong> has downloaded the files for <strong>${player}</strong>, so the review is under way.</p>
       <p>Nothing to do — this is just the hand-off closing.</p>`,
      { label: "Open the queue", url: opts.submissionUrl },
    ),
  });
}
