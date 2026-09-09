import "server-only";
import { emailShell, escapeHtml, quotedMessage, sendEmail } from "@/shared/email";
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
       ${quotedMessage(input.message)}`,
      undefined,
      "Sent by the contact form on baseball-sensei.com.",
    ),
  });
}

/**
 * The writer's own copy — we have it, and somebody will read it.
 *
 * A contact form that answers only with "Message sent" on a page they are about
 * to close leaves someone with no record of what they wrote and no evidence it
 * went anywhere. A receipt is the cheapest possible reassurance, and the recap
 * is the part that makes it one: it proves the words arrived intact, which
 * "thanks, we got it" does not (Ben, 2026-09-09).
 *
 * **Best-effort, unlike `sendContactMessage` above.** That one *is* the work —
 * if it fails nothing happened and the form must say so. This one is a
 * courtesy: the message has already reached every admin by the time it runs, so
 * failing the form here would make someone send again and land us a duplicate
 * of a message we already have. ADR 004's default is right for exactly this
 * shape of send.
 *
 * **No `replyTo`.** It comes from the brand address, so the natural gesture —
 * hit reply — reaches the shared inbox, which is where a follow-up thought
 * belongs. The admin copy needs a `replyTo` precisely because its default would
 * be wrong; this one's default is already right.
 *
 * No call to action. Somebody who has just asked a question has not asked to be
 * sold to, and a button pushing them at the funnel would read as one.
 */
export async function sendContactReceipt(input: ContactInput) {
  const first = escapeHtml(input.firstName.trim());

  return sendEmail({
    to: input.email,
    subject: `${site.name}: we got your message`,
    html: emailShell(
      "Thanks — we have your message",
      `<p>Hi ${first},</p>
       <p>Your message reached us. Somebody on the team reads every one, and
       you will get a reply at this address.</p>
       <p style="color:#818184;">Here is what you sent, so you have a copy:</p>
       ${quotedMessage(input.message)}
       <p style="color:#818184;">No need to send it again — if you want to add
       anything, just reply to this email.</p>`,
      undefined,
      "This is an automated confirmation that we received your message.",
    ),
  });
}
