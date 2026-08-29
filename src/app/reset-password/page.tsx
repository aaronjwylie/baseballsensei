import type { Metadata } from "next";
import { Container, ButtonLink } from "@/shared/ui";
import { ResetPasswordForm } from "@/domains/account";

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

  return (
    <section className="py-16 sm:py-24">
      <Container className="max-w-sm">
        <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
          Set a new password
        </h1>
        {token ? (
          <>
            <p className="mt-2 text-sm text-ink-muted">
              Choose a new password for your operator account.
            </p>
            <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
              <ResetPasswordForm token={token} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-muted">
              This link is missing its token. Request a fresh reset link.
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
