import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/shared/ui";
import { requireRole } from "@/domains/account";
import {
  getOperatorProfile,
  grantsFor,
  updateProfiledOperatorAction,
  OperatorProfileForm,
  OperatorRoleToggles,
} from "@/domains/operator";

export const metadata: Metadata = {
  title: "Admin — Edit operator",
  robots: { index: false },
};

/**
 * One operator, reached through whichever filter you found them in.
 *
 * **Looked up without a role**, unlike the list. The old edit page fetched by
 * role, which was right when three lists meant three kinds of person and became
 * wrong the moment one person could be several: arriving from the admins tab
 * must not hide the fact that they are also a coach.
 *
 * `kind` is carried only so the breadcrumb goes back where you came from.
 */
export default async function EditOperatorPage(props: {
  params: Promise<{ kind: string; id: string }>;
}) {
  await requireRole("admin");
  const { kind, id } = await props.params;

  const person = await getOperatorProfile(id);
  if (!person) notFound();
  const grants = await grantsFor(id);

  return (
    <Container className="max-w-2xl">
      <div>
        <Link
          href={`/admin/operators/${kind}`}
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← Operators
        </Link>
        <h1 className="mt-2 font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
          {person.name}
        </h1>
        <p className="text-sm text-ink-muted">{person.email}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Roles
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          One person can be more than one kind. <strong>Holding</strong> a role
          puts them on that list; <strong>taking work</strong> is whether they
          can be assigned it right now — pause a coach without removing them.
        </p>
        <div className="mt-4">
          <OperatorRoleToggles operatorId={id} grants={grants} />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-6">
        {/*
          The form asks for what the *person* needs, derived from every kind
          they hold — not from the tab you arrived through. Add `coach` to an
          admin and the specialties field appears here on the next render, which
          is why adding a kind needs no separate prompt.
        */}
        <OperatorProfileForm
          roles={grants.map((g) => g.role)}
          action={updateProfiledOperatorAction.bind(null, "admin")}
          existing={person}
        />
      </div>
    </Container>
  );
}
