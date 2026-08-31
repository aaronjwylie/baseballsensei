/**
 * The welcome email — sent to an operator the admin has just added, telling
 * them what they are and where to sign in (Ben, QA 5.13.2 / 5.13.4 / 5.13.5).
 *
 * **The role is a parameter, not a filename**, the same call the hand-off email
 * makes: a coach, a translator and an admin all get the same message with one
 * word changed, so a fourth role would change a string rather than add a file.
 *
 * **No password rides along.** We hold only the bcrypt hash and would not email
 * a secret regardless; the message points at "Forgot password" instead, which
 * is the account's own way to set one. That keeps the admin from having to relay
 * a password out of band and keeps a plaintext credential out of an inbox.
 *
 * Best-effort like every send — the account exists whether or not the mail
 * lands, so a failure logs and never throws into the creation action.
 */
import { emailShell, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";
import { env } from "@/shared/config/env";
import type { Role } from "../model/operatorRoleEnum";

/**
 * How each role reads in the copy, article included.
 *
 * A map rather than a computed article so "an admin" versus "a coach" is never a
 * vowel-guessing heuristic, and a new role is a compile error here rather than a
 * grammatically-odd email.
 */
const ROLE_PHRASE: Record<Role, string> = {
  admin: "an admin",
  coach: "a coach",
  translator: "a translator",
};

/** Pure builder — the subject + HTML, separated from sending so it's testable. */
export function buildOperatorWelcomeEmail(
  name: string,
  role: Role,
): { subject: string; html: string } {
  const phrase = ROLE_PHRASE[role];
  return {
    subject: `${site.name}: you've been added as ${phrase}`,
    html: emailShell(
      `Welcome to ${site.name}`,
      `<p>Hi ${escapeName(name)}, an administrator has added you to ${site.name} as ${phrase}. Sign in below to reach your portal.</p>
       <p style="margin:12px 0 0">Don't have a password yet? Choose <strong>Forgot password</strong> on the sign-in page and we'll email you a link to set one.</p>`,
      { label: "Sign in", url: `${env.siteUrl}/login` },
      "You're receiving this because an administrator added you as an operator.",
    ),
  };
}

export function sendOperatorWelcomeEmail(to: string, name: string, role: Role) {
  const { subject, html } = buildOperatorWelcomeEmail(name, role);
  return sendEmail({ to, subject, html });
}

/**
 * The name is operator-supplied and lands in HTML — escape it, the same care
 * every template with an interpolation takes (CLAUDE.md email section).
 */
function escapeName(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
