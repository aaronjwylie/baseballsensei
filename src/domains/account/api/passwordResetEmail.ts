/**
 * The password-reset email. Best-effort like every send — but note that if it
 * fails, the operator can't reset, so it's the kind of failure worth watching.
 */
import { emailShell, sendEmail } from "@/shared/email";
import { site } from "@/shared/config/site";

export function sendPasswordResetEmail(to: string, link: string) {
  return sendEmail({
    to,
    subject: `${site.name}: reset your password`,
    html: emailShell(
      "Reset your password",
      `<p>We got a request to reset the password on your ${site.name} operator account. Choose a new one below. The link works for one hour.</p>
       <p>Didn't ask for this? You can ignore this email; nothing changes until a new password is set.</p>`,
      { label: "Reset password", url: link },
    ),
  });
}
