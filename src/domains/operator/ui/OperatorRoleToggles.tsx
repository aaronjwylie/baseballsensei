"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui";
import { setRolesAction } from "../api/operatorRoleActions";
import { ROLES, type Role } from "../model/operatorRoleEnum";
import type { RoleGrant } from "../api/operatorRoleApi";

/** TEMPORARY (QA 4.7): counts mounts so a remount is visible in the log. */
let mountCount = 0;

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
 * The previous version stored an array of held grants, which allowed two
 * states that should never exist: the same role
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

  /* ── TEMPORARY INSTRUMENTATION (2026-08-30, QA 4.7) ───────────────────────
     Remove with the [qa 4.7] console line below once this is closed.

     Five unknowns, measured rather than guessed:
       instance  — a new id means the component REMOUNTED, which re-seeds state
                   from the prop. I have assumed both that it does and that it
                   does not, without ever checking.
       props     — what the server is handing this component on each render.
       react     — what React believes is ticked.
       dom       — what the checkboxes actually are, read at the same instant.
       mismatch  — where those two disagree, which is the whole question: a
                   wrong React state and a wrong DOM need opposite fixes.
  */
  /* Numbered in a mount-only effect rather than during render — the purity
     rule is right, and a counter is all this needs. A new number in the log
     means the component REMOUNTED, which re-seeds its state from the prop; I
     have assumed both that it does and that it does not without checking. */
  const instance = useRef("m?");
  useEffect(() => {
    mountCount += 1;
    instance.current = `m${mountCount}`;
    console.error(`[qa 4.7 MOUNT ${instance.current}]`);
  }, []);
  useEffect(() => {
    const dom: Record<string, boolean | null> = {};
    for (const role of ROLES) {
      const el = document.getElementById(`${operatorId}-${role}-held`);
      dom[role] = el instanceof HTMLInputElement ? el.checked : null;
    }
    const react = Object.fromEntries(ROLES.map((r) => [r, roles[r].held]));
    const mismatch = ROLES.filter((r) => dom[r] !== null && dom[r] !== react[r]);
    console.error(
      `[qa 4.7 render ${instance.current}]`,
      "props:", grants.map((g) => g.role).join(",") || "none",
      "react:", ROLES.filter((r) => roles[r].held).join(",") || "none",
      "dom:", ROLES.filter((r) => dom[r]).join(",") || "none",
      mismatch.length ? `MISMATCH:${mismatch.join(",")}` : "",
    );
  });

  const dirty = signature(roles) !== signature(baseline);
  const heldRoles = ROLES.filter((role) => roles[role].held);

  /** Adopt what the server says it stored — the only authority after mount. */
  function adopt(stored: RoleGrant[]) {
    console.error(
      `[qa 4.7 adopt ${instance.current}]`,
      stored.map((g) => g.role).join(",") || "none",
    );
    const map = toMap(stored);
    setRoles(map);
    setBaseline(map);
  }

  function toggleHold(role: Role, on: boolean) {
    console.error(`[qa 4.7 toggle ${instance.current}]`, "hold", role, "->", on);
    setSaved(false);
    setError(null);
    // Dropping the role clears its availability in the same move, so the two
    // can never disagree.
    setRoles((cur) => ({ ...cur, [role]: { held: on, active: on } }));
  }

  function toggleActive(role: Role, on: boolean) {
    console.error(`[qa 4.7 toggle ${instance.current}]`, "active", role, "->", on);
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

        /*
          TEMPORARY (2026-08-30, QA 4.7) — remove once this is closed.

          Everything else has been eliminated: one submit, no remount, no prop
          resync, no error. The only remaining path that can move this state is
          what the action hands back, and that is the one value nobody can see.
          The QA probe wraps console.error, so this is the cheapest way to get
          it into the log beside the tick samples.
        */
        console.error(
          "[qa 4.7] sent:",
          JSON.stringify([...formData.entries()].filter(([k]) => k !== "operatorId")),
          "got:",
          JSON.stringify(result ?? null),
        );

        if (result?.error) {
          // Refused (e.g. the last-admin guard). Snap back to what the server
          // last confirmed, and say why.
          setError(result.error);
          setRoles(baseline);
          return;
        }
        if (result?.grants) adopt(result.grants);
        setSaved(true);
        /*
          NO router.refresh() HERE — and that omission is the fix.

          Refreshing pulled a server render that lags the write it was meant to
          reflect, and that render then overwrote correct state with stale
          state. Measured: the write landed and the form was correct two seconds
          after submit; four seconds after submit the refresh arrived and put a
          deleted role back on screen, with the specialty boxes reappearing in
          the same frame — a whole-page re-render, not a state change.

          The tester then acted on that false picture, and the NEXT save
          submitted it. `setGrants` deletes any role absent from the submitted
          set, so the roles that had merely been drawn wrongly were then really
          destroyed. Every reported symptom of QA 4.7 follows from this one
          thing.

          Nothing on this form needs the refresh: the action hands back what it
          stored, which is the freshest answer that exists. The header and the
          operators list do read these roles, and they are refreshed by
          `revalidateOperatorPages()` — correctly, now that it names the route
          patterns rather than filled-in paths.
        */
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
        {ROLES.map((role) => {
          /*
            Ids rather than wrapping.

            Every control here used to sit INSIDE its label, and the
            availability toggle sat inside the role's label as well — a label
            nested in a label, which the HTML spec does not allow and browsers
            resolve by guessing. A click on the inner control was also treated
            as a click on the outer label, so it activated the outer checkbox
            too: one click, two boxes, and the DOM moved underneath React
            without a render, leaving `checked` and the actual input disagreeing
            until something forced a re-render.

            That is the whole of QA 4.7. Not caching, not state, not the action
            — malformed markup. `htmlFor` associates each label with exactly one
            control and nests nothing.
          */
          const holdId = `${operatorId}-${role}-held`;
          const activeId = `${operatorId}-${role}-active`;
          return (
            <li key={role} className="flex items-start gap-2.5 text-sm">
              <input
                id={holdId}
                type="checkbox"
                checked={roles[role].held}
                onChange={(e) => toggleHold(role, e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <label
                  htmlFor={holdId}
                  className="font-medium capitalize text-ink"
                >
                  {role}
                </label>
                <p className="text-ink-muted">{BLURB[role]}</p>

                {/*
                  Availability is a second, nested decision — and only askable
                  once they hold the kind. Pausing a coach is not the same act
                  as removing them: the grant survives, its history survives,
                  and they simply stop appearing as assignable.

                  Nested in meaning, a sibling in markup.
                */}
                {roles[role].held && role !== "admin" && (
                  <div className="mt-1.5 flex items-center gap-2 text-[13px]">
                    <input
                      id={activeId}
                      type="checkbox"
                      checked={roles[role].active}
                      onChange={(e) => toggleActive(role, e.target.checked)}
                    />
                    <label
                      htmlFor={activeId}
                      className={roles[role].active ? "text-ink" : "text-ink-muted"}
                    >
                      {roles[role].active
                        ? `Taking ${role === "coach" ? "submissions" : "translations"}`
                        : "Paused — holds the role, cannot be assigned"}
                    </label>
                  </div>
                )}
              </div>
            </li>
          );
        })}
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
