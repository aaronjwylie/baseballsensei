import "server-only";
import { emailShell, escapeHtml, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";
import type { ContactInput } from "../model/contactInput";

/**
 * The contact form's one message: what somebody wrote, delivered to the
 * operator's inbox.
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
export function sendContactMessage(input: ContactInput) {
  const name = escapeHtml(`${input.firstName} ${input.lastName}`.trim());
  const email = escapeHtml(input.email);

  return sendEmail({
    to: site.email,
    replyTo: input.email,
    subject: `${site.name} — message from ${name}`,
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
