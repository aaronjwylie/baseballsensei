"use client";

import { useState } from "react";
import { Button, Field, SavedBadge, inputClass } from "@/shared/ui";
import { FOCUS_OPTIONS } from "@/domains/submission/model/submission";
import { saveRoleAction } from "../api/roleCardActions";
import { type Role } from "../model/operatorRoleEnum";
import type { RoleGrant } from "../api/operatorRoleApi";

/**
 * What each role is for, in the words an admin would use.
 *
 * Per role rather than one shared blurb, because the three are not variations
 * of one job — which is the whole reason they get a card each.
 */
const ROLE_COPY: Record<Role, { title: string; blurb: string }> = {
  admin: {
    title: "Admin",
    blurb:
      "Runs the platform — the queue, onboarding, settings, and who else is an operator.",
  },
  coach: {
    title: "Coach",
    blurb:
      "Reviews submissions and records the feedback. Shown on the public site.",
  },
  translator: {
    title: "Translator",
    blurb:
      "Takes a leg of a translation, in or out. Never shown publicly.",
  },
};

/** Which controls a role actually has. The three genuinely differ. */
const CONTROLS: Record<
  Role,
  { availability: boolean; languages: boolean; specialties: boolean; public: boolean }
> = {
  /*
    Admin has none of them, and that is not an omission.

    There is no pause: holding admin *is* being one, and an admin who cannot act
    is a contradiction rather than a state. There are no languages or
    specialties: nothing about running the platform depends on what you read or
    which focus you know.
  */
  admin: { availability: false, languages: false, specialties: false, public: false },
  /*
    A coach's languages decide whether a submission needs translating at all;
    their specialties decide what they are assigned. They are the only role the
    public site shows, so bio and photo live here and nowhere else.
  */
  coach: { availability: true, languages: true, specialties: true, public: true },
  /*
    A translator's languages are what they work BETWEEN — a different question
    from a coach's, and the reason these moved off the person in 2026-08-30.
    Specialties matter because the focus of a submission decides the vocabulary
    a leg needs, even though they are not the one reviewing it.
  */
  translator: { availability: true, languages: true, specialties: true, public: false },
};

/**
 * One role, and everything that role decides.
 *
 * ── Why a card per role ─────────────────────────────────────────────────────
 *
 * The page used to be a roles card at the top and a settings card beneath, with
 * the settings form growing a conditional for every way the roles differ —
 * `holds("coach") || holds("translator")` for specialties, `isPublic` for the
 * bio, a three-way ternary for the languages hint. That shape gets worse as the
 * roles diverge, which they will: the file was already asking "which of these
 * three am I rendering for?" in four places.
 *
 * A card per role answers the question once, structurally. Divergence becomes
 * ordinary — a control the coach card has and the translator card does not —
 * instead of another branch in a shared form.
 *
 * ── One save, one role ──────────────────────────────────────────────────────
 *
 * Each card saves only its own role. The previous form submitted all three as a
 * set and deleted any role missing from what arrived, which made a stale
 * submission destructive. A card that owns one role cannot express "and remove
 * the others", so the blast radius of a bad save is the role you were editing.
 *
 * ── Uncontrolled, like the toggles that came before it ──────────────────────
 *
 * The inputs hold their own state and submit themselves; nothing here keeps a
 * second copy. The card is keyed on the stored grant, so a save replaces what
 * was typed with what was stored (QA 4.7).
 */
export function OperatorRoleCard({
  operatorId,
  role,
  grant,
}: {
  operatorId: string;
  role: Role;
  /** Absent when they do not hold this role — the card is then an offer. */
  grant?: RoleGrant;
}) {
  const [stored, setStored] = useState<RoleGrant | null>(grant ?? null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = ROLE_COPY[role];
  const has = CONTROLS[role];
  const held = stored !== null;

  const signature = stored
    ? `${stored.isActive}|${stored.languages.join(",")}|${stored.specialties.join(",")}|${stored.bio ?? ""}`
    : "none";

  const heldId = `${operatorId}-${role}-held`;
  const availableId = `${operatorId}-${role}-available`;

  return (
    <section
      className={`rounded-2xl border bg-white p-6 ${
        held ? "border-ink/20" : "border-line"
      }`}
    >
      <form
        key={signature}
        action={async (formData) => {
          setPending(true);
          setError(null);
          const result = await saveRoleAction(operatorId, role, formData);
          setPending(false);
          if (result?.error) {
            setError(result.error);
            // Re-keying rebuilds the inputs from `stored`, which a refusal left
            // untouched — nothing to revert by hand.
            setStored((current) => (current ? { ...current } : null));
            return;
          }
          setStored(result?.grant ?? null);
          setSaved(true);
        }}
        onChange={() => setSaved(false)}
        className="space-y-4"
      >
        <div className="role-row flex items-start gap-3">
          <input
            id={heldId}
            name="held"
            type="checkbox"
            defaultChecked={held}
            className="mt-1"
          />
          <div className="min-w-0 flex-1">
            <label
              htmlFor={heldId}
              className="font-display text-lg font-medium uppercase tracking-[-0.01em] text-ink"
            >
              {copy.title}
            </label>
            <p className="mt-0.5 text-sm text-ink-muted">{copy.blurb}</p>

            {/*
              Everything below is this role's, and is hidden by CSS rather than
              unmounted when the role is not held — so a checkbox and the panel
              it governs cannot disagree, and an unticked role still submits its
              settings unchanged rather than blanking them.
            */}
            <div className="role-settings mt-4 space-y-4 border-l-2 border-line pl-4">
              {has.availability && (
                <div className="flex items-center gap-2">
                  <input
                    id={availableId}
                    name="available"
                    type="checkbox"
                    defaultChecked={stored?.isActive ?? true}
                  />
                  <label htmlFor={availableId} className="text-[13px] text-ink-muted">
                    Taking {role === "coach" ? "submissions" : "translations"} —
                    untick to pause without removing the role
                  </label>
                </div>
              )}

              {has.languages && (
                <Field
                  label="Languages"
                  hint={
                    role === "coach"
                      ? "What this coach reads. A submission is translated when it shares none with the customer."
                      : "What they translate between."
                  }
                >
                  <input
                    name="languages"
                    defaultValue={(stored?.languages ?? []).join(", ")}
                    placeholder="English, Japanese"
                    className={inputClass}
                  />
                </Field>
              )}

              {has.specialties && (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium text-ink">
                    Specialties
                  </legend>
                  <p className="mb-2 text-[13px] text-ink-muted">
                    {role === "coach"
                      ? "What they will be given to review."
                      : "The vocabularies they are fluent in."}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {FOCUS_OPTIONS.map((focus) => {
                      const id = `${operatorId}-${role}-focus-${focus}`;
                      return (
                        <span key={focus} className="flex items-center gap-1.5">
                          <input
                            id={id}
                            type="checkbox"
                            name="specialties"
                            value={focus}
                            defaultChecked={stored?.specialties.includes(focus)}
                          />
                          <label htmlFor={id} className="text-sm text-ink-muted">
                            {focus}
                          </label>
                        </span>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {has.public && (
                <>
                  <Field label="Bio" hint="A short blurb for the public site.">
                    <textarea
                      name="bio"
                      rows={3}
                      defaultValue={stored?.bio ?? ""}
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label="Photo"
                    hint="JPG or PNG. Leave blank to keep the current one."
                  >
                    <input
                      name="image"
                      type="file"
                      accept="image/*"
                      className={inputClass}
                    />
                  </Field>
                </>
              )}

              {!has.availability && !has.languages && !has.specialties && (
                <p className="text-[13px] text-ink-muted">
                  Admin has no further settings — there is nothing about running
                  the platform that depends on languages, focuses or
                  availability.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : `Save ${copy.title.toLowerCase()}`}
          </Button>
          {saved && <SavedBadge />}
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-red-700">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
