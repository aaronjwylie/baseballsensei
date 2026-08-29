import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/shared/ui";
import { getOperatorById } from "@/domains/operator";
import { requireSession, ChangePasswordForm, portalsFor, HOME_FOR_ROLE } from "@/domains/account";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false },
};

export default async function AccountPage() {
  const session = await requireSession();
  const operator = await getOperatorById(session.operatorId);
  // Their own portal if they hold exactly one; the chooser if several.
  const mine = portalsFor(session.roles);
  const home = mine.length === 1 ? HOME_FOR_ROLE[mine[0]] : "/portal";

  return (
    <section className="py-10">
      <Container className="max-w-md">
        <Link href={home} className="text-sm text-ink-muted hover:text-ink">
          ← Back to portal
        </Link>
        <h1 className="mt-2 font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">Account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {operator?.email} · {operator?.roles.join(" · ") || "no roles yet"}
        </p>

        <div className="mt-6 rounded-2xl border border-line bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Change password
          </h2>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </div>
      </Container>
    </section>
  );
}
