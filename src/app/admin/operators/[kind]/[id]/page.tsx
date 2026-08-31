import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/shared/ui";
import { ROLES } from "@/domains/operator/model/operatorRoleEnum";
import { requireRole } from "@/domains/account";
import {
  getOperatorProfile,
  grantsFor,
  OperatorRoleCard,
  OperatorIdentityForm,
  DeleteOperatorButton,
} from "@/domains/operator";

export const metadata: Metadata = {
  title: "Admin: Edit operator",
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

      {/*
        A card per role, each owning everything that role decides.

        This was a "Roles" card of three checkboxes over a settings form full of
        conditionals — `holds("coach") || holds("translator")` for specialties,
        `isPublic` for the bio, a three-way ternary for the languages hint. Every
        way the roles differ was a branch inside one shared form, and the roles
        differ more each time anyone looks.

        Three cards answer "which role is this for?" once, structurally, and
        divergence becomes an ordinary difference between two components rather
        than another conditional in one. They save independently, so a stale
        submission can no longer remove the two roles it forgot to mention.
      */}
      <div className="mt-8 space-y-4">
        {ROLES.map((role) => (
          <OperatorRoleCard
            key={role}
            operatorId={id}
            role={role}
            grant={grants.find((g) => g.role === role)}
          />
        ))}
      </div>

      {/*
        Identity is not a role. Name, email and password are true of the person
        whichever hats they wear, so they sit apart from the three — putting them
        inside any one card would make that card lie about its scope.
      */}
      <div className="mt-8 rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-lg font-medium uppercase tracking-[-0.01em] text-ink">
          Sign-in
        </h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          Who they are, whichever roles they hold.
        </p>
        <div className="mt-4">
          <OperatorIdentityForm operatorId={id} existing={person} />
        </div>
      </div>

      {/*
        Delete is not a role change — it removes the person from the platform.
        Kept apart, and last, so it reads as the deliberate end of the page
        rather than another setting. Revoking a role or pausing an account are
        the reversible acts above; this is the one that isn't (Ben, QA 5.13.11).
      */}
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/40 p-6">
        <h2 className="font-display text-lg font-medium uppercase tracking-[-0.01em] text-red-800">
          Delete operator
        </h2>
        {/* One string literal, not name-expression-then-text: the latter dropped
            the space before "from" in the build, reading "benbenfrom" (Ben, QA
            5.13.11). A literal keeps every space a real character. */}
        <p className="mt-0.5 max-w-prose text-sm text-ink-muted">
          {`Removes ${person.name} from the platform for good: every role, their sign-in, and their photo. Any submission they were working on returns to the queue for reassignment. This can’t be undone; to step someone back temporarily, untick their roles above instead.`}
        </p>
        <div className="mt-4">
          <DeleteOperatorButton operatorId={id} name={person.name} />
        </div>
      </div>
    </Container>
  );
}
