/**
 * The payment domain's two emails: the receipt, and the way back from a decline.
 *
 * It changed shape with the flow. It used to say "we took your money, now go
 * upload" — payment came first, so the message was an instruction. Payment is
 * now last, so by the time this sends the files are already in and the message
 * is a confirmation: what was charged, what we received, and what happens next.
 *
 * Fired once, gated on `justPaid`, so a redelivered webhook can't send a second.
 */
import { emailShell, escapeHtml, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";
import { formatFileSize, type SubmissionFile } from "@/domains/submission";

export interface ReceiptDetails {
  playerName: string;
  amountCents: number;
  currency: string;
  files: SubmissionFile[];
  statusUrl: string;
}

export function sendSubmissionReceipt(to: string, details: ReceiptDetails) {
  const { playerName, amountCents, currency, files, statusUrl } = details;

  return sendEmail({
    to,
    subject: `${site.name} — submission confirmed for ${playerName}`,
    html: emailShell(
      "You're all set ✅",
      `<p>Thanks — your submission for <strong>${escapeHtml(playerName)}</strong> is in and paid for.</p>

       <h2 style="margin:28px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:0.06em;color:#818184;">Receipt</h2>
       <table style="width:100%;border-collapse:collapse;font-size:15px;">
         <tr>
           <td style="padding:6px 0;color:#4f4f52;">Video review</td>
           <td style="padding:6px 0;text-align:right;color:#161616;font-weight:600;">${formatMoney(amountCents, currency)}</td>
         </tr>
         <tr>
           <td style="padding:6px 0;border-top:1px solid #e3e3e3;color:#161616;font-weight:600;">Total paid</td>
           <td style="padding:6px 0;border-top:1px solid #e3e3e3;text-align:right;color:#161616;font-weight:600;">${formatMoney(amountCents, currency)}</td>
         </tr>
       </table>

       <h2 style="margin:28px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:0.06em;color:#818184;">Files received (${files.length})</h2>
       ${fileList(files)}

       <p style="margin-top:28px;">A coach will review it and send a personal video walkthrough within <strong>${site.turnaround}</strong>. We'll email you the moment it's ready.</p>`,
      // A capability link — straight in, no code. See `signStatusToken`.
      { label: "Check your status", url: statusUrl },
    ),
  });
}

function fileList(files: SubmissionFile[]): string {
  if (files.length === 0) {
    return `<p style="color:#818184;">No files were attached.</p>`;
  }

  const rows = files
    .map(
      (file) =>
        `<tr>
           <td style="padding:6px 0;color:#4f4f52;">${escapeHtml(file.filename)}</td>
           <td style="padding:6px 0;text-align:right;color:#818184;white-space:nowrap;">${formatFileSize(file.sizeBytes)}</td>
         </tr>`,
    )
    .join("");

  return `<table style="width:100%;border-collapse:collapse;font-size:15px;">${rows}</table>`;
}

/**
 * ② (the other half) — a paid submission has arrived. To the admin.
 *
 * The customer gets a receipt; the operator got nothing, so the first anyone
 * knew of a sale was noticing a new row. A queue that doesn't announce its own
 * arrivals has to be watched instead of used.
 */
export function sendPaymentReceivedEmail(opts: {
  to: string[];
  playerName: string;
  focus?: string;
  fileCount: number;
  queueUrl: string;
}) {
  // Nobody to tell — an install with no admin row. Reported as a
  // non-send rather than thrown, so a webhook never fails over it.
  if (opts.to.length === 0) return Promise.resolve({ ok: false });
  const player = escapeHtml(opts.playerName);
  const focus = opts.focus ? ` · ${escapeHtml(opts.focus)}` : "";
  const files = `${opts.fileCount} file${opts.fileCount === 1 ? "" : "s"}`;
  return sendEmail({
    to: opts.to.join(", "),
    subject: `${site.name} — new paid submission: ${opts.playerName}`,
    html: emailShell(
      "A new submission is paid and waiting",
      `<p><strong>${player}</strong>${focus} — ${files}.</p>
       <p>It's in the queue and needs a coach.</p>`,
      { label: "Open the queue", url: opts.queueUrl },
    ),
  });
}

/**
 * A card was declined — tell the customer, and give them the door back in.
 *
 * A decline is someone **trying**, not someone leaving, and silence treats the
 * two the same. Their files are already uploaded and their submission is intact;
 * without this they'd have to guess that, and a customer who assumes the whole
 * thing failed simply doesn't come back.
 *
 * Deliberately vague about the reason. Stripe's own message is shown inline on
 * the page where it's useful; repeating "insufficient funds" in an email that
 * may be read over someone's shoulder is not our call to make.
 *
 * Best-effort like every other send here — the decline was already handled.
 */
export function sendPaymentFailed(
  to: string,
  details: { playerName: string; startUrl: string },
) {
  const player = escapeHtml(details.playerName);
  return sendEmail({
    to,
    subject: `${site.name} — your payment didn't go through`,
    html: emailShell(
      "That card didn't go through",
      `<p>Your card was declined, so we haven't charged you anything.</p>
       <p><strong>Nothing is lost.</strong> The files you uploaded for ${player} are still with us, and you can finish checking out whenever you're ready — you won't need to upload them again.</p>
       <p>If it keeps happening, try another card or get in touch and we'll sort it out.</p>`,
      { label: "Finish checking out", url: details.startUrl },
    ),
  });
}

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/**
 * Filenames and player names come from the customer and land in an HTML email.
 * Escaping them is the difference between a receipt and an injection vector.
 */
