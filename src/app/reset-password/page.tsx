import type { Metadata } from "next";
import { Container, ButtonLink } from "@/shared/ui";
import { ResetPasswordForm, isResetTokenValid } from "@/domains/account";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  /*
    Verify on load, so a spent, expired, or invalid link says so *here* rather
    than after the operator has typed a new password twice and submitted (QA
    4.11.1). It is the same check the submit performs, extracted read-only, so the
    page and the action cannot disagree about what "spent" means. A pure read —
    no side effect — so a prefetch by a mail scanner just does nothing, as before.
  */
  const valid = token ? await isResetTokenValid(token) : false;

  return (
    <section className="py-16 sm:py-24">
      <Container className="max-w-sm text-center">
        <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
          Set a new password
        </h1>
        {token && valid ? (
          <>
            <p className="mt-2 text-sm text-ink-muted">
              Choose a new password for your operator account.
            </p>
            {/* The card holds a form — its fields and labels stay left-aligned;
                only the heading, the intro line and the button centre (Ben, QA
                4.12). */}
            <div className="mt-8 rounded-2xl border border-line bg-white p-6 text-left sm:p-8">
              <ResetPasswordForm token={token} />
            </div>
          </>
        ) : (
          <>
            {/* One message for every unusable token — invalid, already used, or
                expired — never distinguishing them, which would tell someone
                holding a stolen link which case they are in. "Missing its token"
                is a different, safe-to-name thing: a malformed URL, not a
                verdict on a real token. */}
            <p className="mt-2 text-sm text-ink-muted">
              {token
                ? "This reset link is invalid, already used, or expired. Request a fresh one."
                : "This link is missing its token. Request a fresh reset link."}
            </p>
            <div className="mt-6">
              <ButtonLink href="/forgot-password">
                Request a reset link
              </ButtonLink>
            </div>
          </>
        )}
      </Container>
    </section>
  );
}
