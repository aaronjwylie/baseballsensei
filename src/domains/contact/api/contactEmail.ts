import "server-only";
import { emailShell, escapeHtml, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";
import { listAdminEmails } from "@/domains/operator";
import type { ContactInput } from "../model/contactInput";

/**
 * The contact form's one message: what somebody wrote, delivered to every admin.
 *
 * **To all admins, not just `contact@`.** It goes to `listAdminEmails()` — the
 * admin operators plus the shared `contact@` inbox — so a message reaches the
 * people who can answer it however the team splits the watching (Ben, QA 1.2.8),
 * the same recipient list a coaching submission's arrival notice uses.
 *
 * **Off-spine.** The nine numbered messages in `shared/email/_EmailDocumentation.md`
 * all hang off a submission's ladder; this one has no submission and no rung —
 * it is a stranger asking a question before they have bought anything.
 *
 * **`replyTo` is the whole point.** The mail arrives from the brand's own
 * address like every other, so without it the natural gesture — hit reply —
 * answers ourselves. It carries the writer's address instead.
 *
 * The subject leads with the name so a full inbox stays scannable, and the
 * address is repeated in the body because a forwarded copy loses the header.
 *
 * Every interpolated value here was typed by a stranger, so every one is
 * escaped. That is not belt-and-braces: the name and the message are exactly
 * the fields a spam bot fills with markup.
 */
export async function sendContactMessage(input: ContactInput) {
  const name = escapeHtml(`${input.firstName} ${input.lastName}`.trim());
  const email = escapeHtml(input.email);

  return sendEmail({
    to: await listAdminEmails(),
    replyTo: input.email,
    subject: `${site.name}: message from ${name}`,
    html: emailShell(
      "Someone sent a message",
      `<p><strong>${name}</strong> wrote in from the contact form.</p>
       <p style="color:#4f4f52;">Reply to this email and it goes straight back to
       <a href="mailto:${email}">${email}</a>.</p>
       <div style="margin:20px 0;padding:16px;background:#f2f2f2;border-left:3px solid #313fd2;">
         ${escapeHtml(input.message).replace(/\n/g, "<br />")}
       </div>`,
    ),
  });
}
