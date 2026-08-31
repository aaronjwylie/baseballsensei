import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/shared/ui";
import { LoginForm } from "@/domains/account";

export const metadata: Metadata = {
  title: "Operator sign in",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <section className="py-16 sm:py-24">
      <Container className="max-w-sm">
        <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
          Operator sign in
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          For coaches and staff. Customers don&apos;t need an account; check a
          submission from the status page.
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link href="/forgot-password" className="underline hover:text-ink">
            Forgot your password?
          </Link>
        </p>
      </Container>
    </section>
  );
}
