import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/shared/ui";
import { RequestResetForm } from "@/domains/account";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <section className="py-16 sm:py-24">
      <Container className="max-w-sm">
        <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Enter your operator email and we&apos;ll send a link to set a new one.
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <RequestResetForm />
        </div>
        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link href="/login" className="underline hover:text-ink">
            Back to sign in
          </Link>
        </p>
      </Container>
    </section>
  );
}
