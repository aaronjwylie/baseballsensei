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
 */
export function OperatorRoleToggles({
  operatorId,
  grants,
}: {
  operatorId: string;
  grants: RoleGrant[];
}) {
  const [held, setHeld] = useState<RoleGrant[]>(grants);
  /*
    What the server last told us it holds — the thing "unsaved" is measured
    against, and the thing the toggles snap back to.

    It is NOT the `grants` prop directly. The prop is re-read after
    `router.refresh()`, and that read sits behind a cache: a correct save would
    land, the prop would come back with the pre-save roles, and the boxes would
    silently re-tick roles the database no longer had (QA 4.7). Worse, the next
    save then submitted those stale ticks — and `setGrants` deletes by omission,
    so the second save destroyed what the first had correctly written.

    The baseline now moves only on two events that cannot be stale: a fresh
    prop that genuinely differs, and the grants the action reads back after
    writing them.
  */
  const [baseline, setBaseline] = useState<RoleGrant[]>(grants);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const key = (gs: RoleGrant[]) =>
    [...gs].sort((a, b) => a.role.localeCompare(b.role))
      .map((g) => `${g.role}:${g.isActive}`)
      .join("|");

  /*
    Adjust state when the prop changes — React's documented pattern, set during
    render rather than in an effect so it never paints the old value first.
    Guarded on a real difference, so a re-render with the same roles leaves an
    in-progress edit alone.
  */
  if (!pending && key(grants) !== key(baseline)) {
    setBaseline(grants);
    setHeld(grants);
  }

  const dirty = key(held) !== key(baseline);

  const holds = (role: Role) => held.some((g) => g.role === role);
  const activeIn = (role: Role) => held.find((g) => g.role === role)?.isActive ?? false;

  function toggleHold(role: Role, on: boolean) {
    setSaved(false);
    setHeld((cur) => {
      // Drop any existing entry first. Appending blind could hold one role
      // twice, and the hidden inputs below are keyed by role — duplicate React
      // keys, which is its own kind of unpredictable.
      const without = cur.filter((g) => g.role !== role);
      return on ? [...without, { role, isActive: true }] : without;
    });
  }
  function toggleActive(role: Role, on: boolean) {
    setSaved(false);
    setHeld((cur) => cur.map((g) => (g.role === role ? { ...g, isActive: on } : g)));
  }

  return (
    <form
      action={async (formData) => {
        setPending(true);
        setError(null);
        const result = await setRolesAction(formData);
        setPending(false);
        if (result?.error) {
          // Refused (e.g. the last-admin guard). Revert the toggles to what the
          // server still holds, and say why.
          setError(result.error);
          setHeld(baseline);
          return;
        }
        /*
          Trust what came back with the write, not what a later read returns.
          This is the whole fix for 4.7: the action reports the grants it stored,
          so the boxes cannot be re-ticked from a cached copy of the old ones.
        */
        if (result?.grants) {
          setBaseline(result.grants);
          setHeld(result.grants);
        }
        setSaved(true);
        // Still refresh — the rest of the page (the header, the operator list)
        // reads these roles too, and they are not fed by this component.
        router.refresh();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="operatorId" value={operatorId} />
      {held.map((g) => (
        <input
          key={g.role}
          type="hidden"
          name={g.isActive ? "active" : "paused"}
          value={g.role}
        />
      ))}

      <ul className="space-y-2">
        {ROLES.map((role) => (
          <li key={role}>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={holds(role)}
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
                {holds(role) && role !== "admin" && (
                  <label className="mt-1.5 flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={activeIn(role)}
                      onChange={(e) => toggleActive(role, e.target.checked)}
                    />
                    <span className={activeIn(role) ? "text-ink" : "text-ink-muted"}>
                      {activeIn(role)
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

      {held.length === 0 && (
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
