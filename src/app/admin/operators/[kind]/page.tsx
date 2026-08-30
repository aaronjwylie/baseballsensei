import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/shared/ui";
import { requireRole } from "@/domains/account";
import {
  listOperators,
  createProfiledOperatorAction,
  OperatorList,
  type Role,
} from "@/domains/operator";

/**
 * Operators — one list, filtered by kind.
 *
 * The three kinds are **not three lists**. A role is a grant, so a person
 * holding several is one operator who shows up under several filters; `all` is
 * the same query without a `where`. Building them as separate pages would have
 * been three copies of one screen and a lie about the data.
 */
const FILTERS = {
  all: {
    role: undefined,
    label: "All",
    blurb:
      "Everyone who can sign in. One person can be more than one kind — the tabs are filters over this list, not separate lists.",
  },
  admins: {
    role: "admin" as Role,
    label: "Admins",
    blurb:
      "They run the platform: the queue, assignment, settings, and onboarding. Recording their languages is worth doing — an admin often has to talk to a customer, a coach and a translator in the same afternoon.",
  },
  coaches: {
    role: "coach" as Role,
    label: "Coaches",
    blurb:
      "They review submissions and write the feedback. Their languages decide whether a submission needs translating at all.",
  },
  translators: {
    role: "translator" as Role,
    label: "Translators",
    blurb:
      "They carry a submission between languages — out to the coach, and back to the customer. Needed only when a coach and a customer share none.",
  },
  none: {
    role: undefined,
    label: "No role",
    blurb:
      "They can sign in but hold no role yet — newly added, or revoked down to nothing. They stay here, reachable and grantable, until an admin deletes them outright.",
  },
} as const;

type Filter = keyof typeof FILTERS;
const isFilter = (v: string): v is Filter => v in FILTERS;

export async function generateMetadata(props: {
  params: Promise<{ kind: string }>;
}): Promise<Metadata> {
  const { kind } = await props.params;
  return {
    title: isFilter(kind) ? `Operators — ${FILTERS[kind].label}` : "Operators",
    robots: { index: false },
  };
}

export default async function OperatorsPage(props: {
  params: Promise<{ kind: string }>;
}) {
  await requireRole("admin");
  const { kind } = await props.params;
  if (!isFilter(kind)) notFound();
  const { role, blurb } = FILTERS[kind];

  /*
    "No role" is not a role, so it can't be a `where` on the grant — it's the
    absence of any grant. It reads the same unfiltered list the All tab does
    (which now keeps role-less operators, QA 5.13.1) and keeps only those. And it
    offers no "add" form: you don't create a role-less operator, you revoke down
    to one, so the tab is a view, not a place to add from.
  */
  const noRole = kind === "none";
  const people = noRole
    ? (await listOperators()).filter((p) => p.grants.length === 0)
    : await listOperators(role);

  return (
    <Container>
      <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">Operators</h1>

      <nav className="mt-4 flex gap-1 border-b border-line">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Link
            key={key}
            href={`/admin/operators/${key}`}
            aria-current={key === kind ? "page" : undefined}
            className={
              key === kind
                ? "border-b-2 border-ink px-3 py-2 text-sm font-semibold text-ink"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-ink-muted hover:text-ink"
            }
          >
            {FILTERS[key].label}
          </Link>
        ))}
      </nav>

      <p className="mt-4 max-w-2xl text-sm text-ink-muted">{blurb}</p>

      <OperatorList
        filter={role}
        people={people}
        addAction={
          noRole ? undefined : createProfiledOperatorAction.bind(null, role ?? "admin")
        }
      />
    </Container>
  );
}
