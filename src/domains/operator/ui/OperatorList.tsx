import Link from "next/link";
import { OperatorProfileForm } from "./OperatorProfileForm";
import { ROLES, withArticle, type Role } from "../model/operatorRoleEnum";
import type { OperatorListing } from "../api/operatorProfileApi";
import type { OperatorProfileFormState } from "../api/operatorProfileActions";

/**
 * The Operators list, and the form that adds another.
 *
 * **There is one list of operators; the kinds are filters over it.** That is
 * not a UI convenience — it is what the schema says now that a role is a grant
 * rather than a column. A person holding three kinds is one row here and one
 * row under each of the three filters, because it is one person seen from
 * different angles.
 *
 * Every row shows the kinds it holds regardless of which filter you arrived
 * through, so the unfiltered view answers "who is what" without opening
 * anybody.
 */
export function OperatorList({
  filter,
  people,
  addAction,
}: {
  /** The kind being shown, or undefined for everyone. */
  filter?: Role;
  people: OperatorListing[];
  /**
   * Omitted on a pure filter view like "No role", where adding makes no sense —
   * you don't create a role-less operator, you revoke down to one. Absent means
   * no add column and a full-width list.
   */
  addAction?: (
    state: OperatorProfileFormState,
    formData: FormData,
  ) => Promise<OperatorProfileFormState>;
}) {
  const noun = filter ?? "operator";
  const plural = filter === "coach" ? "coaches" : `${noun}s`;

  return (
    <div className={`mt-6 grid gap-8 ${addAction ? "lg:grid-cols-2" : ""}`}>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {people.length} {people.length === 1 ? noun : plural}
        </h2>

        <ul className="mt-3 space-y-3">
          {people.length === 0 && (
            <li className="rounded-2xl border border-line bg-white p-5 text-sm text-ink-muted">
              No {plural}{" "}yet{addAction ? ". Add one on the right." : "."}
              {filter === "translator" && (
                <> A submission only needs one when the coach and the customer
                share no language.</>
              )}
            </li>
          )}

          {people.map((person) => (
            <li key={person.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="font-semibold text-ink">{person.name}</span>
                  <div className="text-sm text-ink-muted">{person.email}</div>
                </div>
                <Link
                  href={`/admin/operators/${filter ? plural : "all"}/${person.id}`}
                  className="shrink-0 text-xs font-semibold text-accent hover:underline"
                >
                  Edit
                </Link>
              </div>

              {/*
                Every kind, always — not just the one being filtered on. The
                whole point of one list is that you can see someone is a coach
                while looking at the admins.
              */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROLES.filter((role) =>
                  person.grants.some((g) => g.role === role),
                ).map((role) => {
                  const active = person.grants.find((g) => g.role === role)?.isActive;
                  return (
                    <span
                      key={role}
                      className={
                        active
                          ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-emerald-700"
                          : "rounded-full border border-line bg-paper-alt px-2 py-0.5 text-[11px] font-semibold capitalize text-ink-muted"
                      }
                    >
                      {role}
                      {!active && " · paused"}
                    </span>
                  );
                })}
                {person.grants.length === 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    no roles
                  </span>
                )}
              </div>

              {/*
                Per role, not one merged line (Ben, QA 5.13.1). A coach's
                languages and a translator's direction are different facts, and
                so are their specialties, so a single "English, Japanese ·
                Hitting" under a two-pill operator was attributing one role's
                settings to both. Each role that has something to show gets its
                own line, in the same order as the pills; admin has neither and
                contributes none. Gaps aren't shown as blanks here — the "Needs …"
                prompt below owns that.
              */}
              {ROLES.filter(
                (role) =>
                  // Admin has no languages or specialties — the question doesn't
                  // apply to running the platform, and its card asks neither. An
                  // admin grant can still carry a stale value from before that
                  // was settled (a default "Japanese" every early admin got), so
                  // it's excluded by role here, not just by whether it's empty —
                  // otherwise a leftover reads as "Admin — Japanese" (Ben, QA
                  // 5.13.4).
                  role !== "admin" &&
                  person.grants.some(
                    (g) =>
                      g.role === role &&
                      (g.languages.length > 0 || g.specialties.length > 0),
                  ),
              ).map((role) => {
                const grant = person.grants.find((g) => g.role === role)!;
                const detail = [
                  grant.languages.join(", "),
                  grant.specialties.join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={role} className="mt-1 text-sm text-ink-muted">
                    <span className="font-medium capitalize text-ink">{role}</span>
                    {": "}
                    {detail}
                  </div>
                );
              })}

              {/*
                The gap that opens when a kind is added to someone onboarded as
                something else — a coach made from an admin has no specialties,
                because nobody asked for them. Each phrase already names its role
                (whatIsMissing), so they read as their own sentences here.
              */}
              {person.missing.length > 0 && (
                <p className="mt-2 text-[13px] font-medium text-amber-700">
                  {`${person.missing.join("; ")}. Add on their page.`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {addAction && (
        <div>
          {/*
            A spacer the exact height of the left column's heading, so the add
            card's top lines up with the FIRST PERSON in the list rather than
            with the "4 admins" count above them. Two cards starting at the same
            y read as two columns; a card starting level with a heading reads as
            hanging.

            It carries the heading's own classes and a non-breaking space rather
            than a measured height, so if the heading's size or spacing changes
            this follows it instead of drifting. A div, not an h2 — an empty
            heading would appear in the document outline and be announced as a
            blank one.

            `hidden lg:block` because below the two-column breakpoint the
            columns stack, and then the spacer is just a gap for nothing.
          */}
          <div
            aria-hidden
            className="hidden text-sm font-semibold uppercase tracking-wide lg:block"
          >
            &nbsp;
          </div>
          <div className="rounded-2xl border border-line bg-white p-6 lg:mt-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Add {withArticle(filter ?? "operator")}
            </h2>
            <div className="mt-4">
              <OperatorProfileForm
                roles={filter ? [filter] : ["coach"]}
                chooseRole={!filter}
                action={addAction}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
