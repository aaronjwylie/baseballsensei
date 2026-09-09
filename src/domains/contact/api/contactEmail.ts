import "server-only";
import { emailShell, escapeHtml, quotedMessage, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";
import { listAdminEmails } from "@/domains/operator";
import type { ContactInput } from "../model/contactInput";

/**
 * The contact form's one message: what somebody wrote, delivered to every admin.
 *
 * **One visible identity, everyone reached.** `contact@` is the only address in
 * `to`; every admin who has notifications on is **bcc**. That is the shape a
 * thread with a customer in it has to have (Ben, 2026-09-09):
 *
 * - **The app fans out, not Google.** Nothing is forwarded or distributed
 *   anywhere — a reply sent to `contact@` alone reaches no admin, which is how
 *   we found this out. Choosing the recipients here is also what makes the
 *   per-admin notify toggle real: it can only govern mail we address.
 * - **Bcc, because a customer is in this thread.** Four admins in `to` means any
 *   one of them can hand the customer all four addresses by hitting reply-all,
 *   and "remember not to" is not a mechanism.
 * - **`replyTo` carries both sides.** One Reply reaches the customer *and*
 *   `contact@`, so the answer is delivered and archived in one gesture rather
 *   than two an admin has to remember.
 *
 * **What this cannot do, and must not pretend to.** An admin's reply is sent by
 * Gmail, not by us, so we cannot fan *that* out — the other admins see it only
 * because it lands in `contact@`. Two pieces of Workspace configuration finish
 * the job and neither belongs in code: `contact@` has to deliver to the people
 * who read it, and each admin needs **send-as `contact@`** so their reply
 * carries the brand address in `From` rather than their own. Bcc protects the
 * recipient list; only send-as protects the sender.
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

  // `contact@` is always in the list and is the identity the customer sees; the
  // people are bcc so no address of ours can travel back to them.
  const everyone = await listAdminEmails();
  const bcc = everyone.filter((address) => address !== site.email.toLowerCase());

  return sendEmail({
    to: site.email,
    bcc,
    replyTo: [input.email, site.email],
    subject: `${site.name}: message from ${name}`,
    html: emailShell(
      "Someone sent a message",
      `<p><strong>${name}</strong> wrote in from the contact form.</p>
       <p style="color:#4f4f52;">Reply and it reaches
       <a href="mailto:${email}">${email}</a> and the shared inbox together —
       send as <strong>${escapeHtml(site.email)}</strong> so they see the brand
       address rather than yours.</p>
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
