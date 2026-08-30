"use client";

import { useState } from "react";
import { Button } from "@/shared/ui";
import { setRolesAction } from "../api/operatorRoleActions";
import { ROLES, type Role } from "../model/operatorRoleEnum";
import type { RoleGrant } from "../api/operatorRoleApi";

const BLURB: Record<Role, string> = {
  admin: "Runs the platform — the queue, onboarding, settings.",
  coach: "Can be assigned a submission to review.",
  translator: "Can be assigned a leg of a translation.",
};

/** Stable regardless of order, so it can identify a set of grants. */
const signature = (grants: RoleGrant[]) =>
  [...grants]
    .map((g) => `${g.role}:${g.isActive ? 1 : 0}`)
    .sort()
    .join("|");

/**
 * Which kinds this person is — the control that makes one operator several.
 *
 * ── Why there is no React state for the roles (QA 4.7) ──────────────────────
 *
 * There used to be, and it was the whole bug.
 *
 * The server knows the roles. This component copied them into React state at
 * mount. From that moment two independent things described one fact, kept in
 * step by hand — and every failure in QA 4.7 was that seam showing:
 *
 *   · a stale prop overwriting good state after a save;
 *   · props updating while local state did not;
 *   · and finally React declining to write `checked` to the DOM at all, because
 *     ITS copy had not changed — leaving a checkbox displaying something that
 *     neither the server nor React believed. Measured directly:
 *       props: admin,translator,coach   react: admin,coach,translator
 *       dom:   admin,translator         MISMATCH:coach
 *
 * Each earlier fix defended one crossing point of that seam. There are more
 * crossing points than can be defended, because the seam should not exist.
 *
 * So the form holds no copy. **The checkboxes are the state being edited** —
 * uncontrolled, seeded from the server with `defaultChecked`, submitting
 * themselves by name. An unticked checkbox sends nothing, which is exactly the
 * distinction being expressed, so there is nothing to synchronise and nothing
 * to fall out of step.
 *
 * **The `key` is how the server takes it back.** Keyed on the stored grants'
 * signature, this is a different form whenever the stored roles differ, so
 * React rebuilds it from the new `defaultChecked` rather than diffing against a
 * DOM whose history it has lost. Remounting is the point here, not a
 * workaround: after a save, what is stored *should* replace what was typed.
 *
 * The availability row is shown and hidden by CSS (`:has()`), not by
 * re-rendering. Conditional rendering is what let a child outlive its parent
 * when the two disagreed; a stylesheet cannot disagree with the checkbox it is
 * reading.
 *
 * ── What has not changed ────────────────────────────────────────────────────
 *
 * All three roles still submit together, as a set: a half-applied change
 * between "is a coach" and "is taking work" is not a state worth reaching, and
 * `setGrants` diffs against what is held, so an unchanged role keeps its
 * original `grantedAt` and `grantedBy`.
 *
 * Removing the last role is still allowed. It leaves someone who can sign in
 * and enter nothing, which is a real state the portal chooser explains.
 */
export function OperatorRoleToggles({
  operatorId,
  grants,
}: {
  operatorId: string;
  grants: RoleGrant[];
}) {
  /* The only state here is about the request, never about the roles. */
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* What the server last told us it stores. Seeds the boxes and keys the form;
     never edited by typing, only replaced by an answer from the action. */
  const [stored, setStored] = useState<RoleGrant[]>(grants);

  const held = new Map(stored.map((g) => [g.role, g.isActive]));

  return (
    <form
      key={signature(stored)}
      action={async (formData) => {
        setPending(true);
        setError(null);
        const result = await setRolesAction(formData);
        setPending(false);

        /* TEMPORARY (QA 4.7) — remove once Ben has confirmed this. The state
           and DOM probes went with the state they measured; this one still
           earns its place, because "what was sent and what came back" is the
           only claim left that nobody can see. */
        console.error(
          "[qa 4.7] sent:",
          JSON.stringify([...formData.entries()].filter(([k]) => k !== "operatorId")),
          "got:",
          JSON.stringify(result ?? null),
        );

        if (result?.error) {
          setError(result.error);
          // Nothing to revert by hand: `stored` is untouched by a refusal, and
          // re-keying rebuilds the boxes from it.
          setStored((current) => [...current]);
          return;
        }
        if (result?.grants) setStored(result.grants);
        setSaved(true);
      }}
      className="space-y-3"
      onChange={() => setSaved(false)}
    >
      <input type="hidden" name="operatorId" value={operatorId} />

      <ul className="space-y-2">
        {ROLES.map((role) => {
          const holdId = `${operatorId}-${role}-held`;
          const availableId = `${operatorId}-${role}-available`;
          return (
            /*
              `role-row` and `role-availability` are read by one rule in
              globals.css: the availability line is hidden unless this row's own
              "held" checkbox is ticked. No JavaScript decides it, so it cannot
              be shown for a role that is not held.
            */
            <li key={role} className="role-row flex items-start gap-2.5 text-sm">
              <input
                id={holdId}
                name="held"
                value={role}
                type="checkbox"
                defaultChecked={held.has(role)}
                className="mt-0.5"
              />
              <div>
                <label htmlFor={holdId} className="font-medium capitalize text-ink">
                  {role}
                </label>
                <p className="text-ink-muted">{BLURB[role]}</p>

                {/*
                  Availability is a second decision, meaningful only once they
                  hold the kind. Pausing a coach is not the same act as removing
                  them: the grant survives, its history survives, and they simply
                  stop appearing as assignable.

                  `admin` has none — holding it is being it.
                */}
                {role !== "admin" && (
                  <span className="role-availability mt-1.5 flex items-center gap-2 text-[13px]">
                    <input
                      id={availableId}
                      name="available"
                      value={role}
                      type="checkbox"
                      defaultChecked={held.get(role) ?? true}
                    />
                    <label htmlFor={availableId} className="text-ink-muted">
                      Taking {role === "coach" ? "submissions" : "translations"} —
                      untick to pause without removing the role
                    </label>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {stored.length === 0 && (
        <p className="text-[13px] text-amber-700">
          With no roles they can still sign in, but there is nowhere for them to
          go until one is added back.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save roles"}
        </Button>
        {saved && <span className="text-sm text-emerald-700">Saved.</span>}
      </div>

      {/* role="alert" so a refusal is announced rather than merely drawn — it
          was a plain paragraph, which meant a rejected save looked identical to
          a successful one to a screen reader, and to the QA probe. */}
      {error && (
        <p role="alert" className="text-[13px] text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
