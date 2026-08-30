"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui";
import { setRolesAction } from "../api/operatorRoleActions";
import { ROLES, type Role } from "../model/operatorRoleEnum";
import type { RoleGrant } from "../api/operatorRoleApi";

const BLURB: Record<Role, string> = {
  admin: "Runs the platform — the queue, onboarding, settings.",
  coach: "Can be assigned a submission to review.",
  translator: "Can be assigned a leg of a translation.",
};

/**
 * One role's two facts. `active` is only meaningful while `held`, and the
 * transitions below never leave it true when `held` is false — so "paused but
 * not held" cannot be reached, and the nested toggle cannot outlive the box
 * that reveals it.
 */
interface RoleState {
  held: boolean;
  active: boolean;
}

/**
 * Every role, always present.
 *
 * **This shape is the fix.** The previous version stored an array of held
 * grants, which allowed two states that should never exist: the same role
 * twice (the toggle appended without checking, and the hidden inputs were keyed
 * by role, so React saw duplicate keys), and a role whose availability toggle
 * was showing while the role itself read as unheld. A total record over the
 * three roles makes both unrepresentable rather than merely unlikely.
 */
type RoleMap = Record<Role, RoleState>;

const toMap = (grants: RoleGrant[]): RoleMap => {
  const map = Object.fromEntries(
    ROLES.map((role) => [role, { held: false, active: false }]),
  ) as RoleMap;
  for (const grant of grants) {
    // Ignore anything not in ROLES — a role removed from the enum should not
    // crash the page that still has grants pointing at it.
    if (map[grant.role]) map[grant.role] = { held: true, active: grant.isActive };
  }
  return map;
};

/** Stable across key order, so it can be compared as a string. */
const signature = (map: RoleMap) =>
  ROLES.map((role) => `${role}:${map[role].held ? 1 : 0}${map[role].active ? 1 : 0}`)
    .join("|");

/**
 * Which kinds this person is — the control that makes one operator several.
 *
 * **All three submit together**, as a set, rather than one toggle firing per
 * click. Two reasons: a half-applied change is not a state anyone wants to
 * discover, and `setRoles` diffs against what is held, so an unchanged role
 * keeps its original `grantedAt` and `grantedBy` instead of being restated as
 * having happened just now.
 *
 * Removing the last role is allowed. It leaves someone who can sign in and
 * enter nothing, which is a real state the portal chooser explains — an
 * operator can exist before anyone decides what they do, and after.
 *
 * ── Where the truth lives (QA 4.7) ──────────────────────────────────────────
 * The `grants` prop seeds this control **once** and is never read again.
 *
 * That is deliberate and was learned the hard way. The prop is re-read after
 * `router.refresh()`, and that read can lag the write it is meant to reflect —
 * so a correct save was followed, two seconds later, by the boxes silently
 * re-ticking roles the database no longer held. The damage came on the *next*
 * save: `setGrants` deletes any role absent from the submitted set, so
 * submitting those reverted ticks destroyed what the previous save had
 * correctly stored.
 *
 * The first attempt at a fix made it worse by resyncing from the prop whenever
 * it differed from the local baseline — which is precisely when the prop is
 * stale, so the stale value won every time.
 *
 * So: after mount, the only thing that may move this control is the grant list
 * the action reads back from the database *after writing it*. An answer that
 * travels with the write cannot lag it.
 */
export function OperatorRoleToggles({
  operatorId,
  grants,
}: {
  operatorId: string;
  grants: RoleGrant[];
}) {
  // Lazy initialisers: `grants` is the seed, not an ongoing input.
  const [roles, setRoles] = useState<RoleMap>(() => toMap(grants));
  const [baseline, setBaseline] = useState<RoleMap>(() => toMap(grants));
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = signature(roles) !== signature(baseline);
  const heldRoles = ROLES.filter((role) => roles[role].held);

  /** Adopt what the server says it stored — the only authority after mount. */
  function adopt(stored: RoleGrant[]) {
    const map = toMap(stored);
    setRoles(map);
    setBaseline(map);
  }

  function toggleHold(role: Role, on: boolean) {
    setSaved(false);
    setError(null);
    // Dropping the role clears its availability in the same move, so the two
    // can never disagree.
    setRoles((cur) => ({ ...cur, [role]: { held: on, active: on } }));
  }

  function toggleActive(role: Role, on: boolean) {
    setSaved(false);
    setError(null);
    setRoles((cur) =>
      cur[role].held ? { ...cur, [role]: { held: true, active: on } } : cur,
    );
  }

  return (
    <form
      action={async (formData) => {
        setPending(true);
        setError(null);
        const result = await setRolesAction(formData);
        setPending(false);

        if (result?.error) {
          // Refused (e.g. the last-admin guard). Snap back to what the server
          // last confirmed, and say why.
          setError(result.error);
          setRoles(baseline);
          return;
        }
        if (result?.grants) adopt(result.grants);
        setSaved(true);
        // The header and the operator list read these roles too and are not fed
        // by this component, so they still need the refresh. Nothing here reads
        // its result.
        router.refresh();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="operatorId" value={operatorId} />
      {heldRoles.map((role) => (
        <input
          key={role}
          type="hidden"
          name={roles[role].active ? "active" : "paused"}
          value={role}
        />
      ))}

      <ul className="space-y-2">
        {ROLES.map((role) => (
          <li key={role}>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={roles[role].held}
                onChange={(e) => toggleHold(role, e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium capitalize text-ink">{role}</span>
                <span className="block text-ink-muted">{BLURB[role]}</span>

                {/*
                  Availability is a second, nested decision — and only askable
                  once they hold the kind. Pausing a coach is not the same act
                  as removing them: the grant survives, its history survives,
                  and they simply stop appearing as assignable.
                */}
                {roles[role].held && role !== "admin" && (
                  <label className="mt-1.5 flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={roles[role].active}
                      onChange={(e) => toggleActive(role, e.target.checked)}
                    />
                    <span
                      className={roles[role].active ? "text-ink" : "text-ink-muted"}
                    >
                      {roles[role].active
                        ? `Taking ${role === "coach" ? "submissions" : "translations"}`
                        : "Paused — holds the role, cannot be assigned"}
                    </span>
                  </label>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {heldRoles.length === 0 && (
        <p className="text-[13px] text-amber-700">
          With no roles they can still sign in, but there is nowhere for them to
          go until one is added back.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save roles"}
        </Button>
        {saved && !dirty && (
          <span className="text-sm text-emerald-700">Saved.</span>
        )}
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
