"use client";

import { useState } from "react";
import { Button, Field, SavedBadge, inputClass, selectClass } from "@/shared/ui";
import {
  FOCUS_OPTIONS,
  LANGUAGE_CHOICES,
  choiceForLanguages,
} from "@/domains/submission/model/submission";
import { saveRoleAction } from "../api/roleCardActions";
import { type Role } from "../model/operatorRoleEnum";
import {
  DEFAULT_LANGUAGE_CHOICE,
  TRANSLATOR_DIRECTIONS,
  type TranslatorDirection,
} from "../model/operatorProfile";
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
      "Runs the platform: the queue, onboarding, settings, and who else is an operator.",
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
  {
    availability: boolean;
    languages: boolean;
    specialties: boolean;
    public: boolean;
    notify: boolean;
  }
> = {
  /*
    Admin has no pause, no languages, no specialties — holding admin *is* being
    one, and nothing about running the platform depends on what you read. What it
    does have is a mail switch (Ben, QA 5.13.6.2): an admin is copied on every
    submission and system notice, and this is how one steps out of that firehose
    without giving up the role. It is not a pause — they stay a full admin — which
    is why it is `notify` and not `availability`.
  */
  admin: { availability: false, languages: false, specialties: false, public: false, notify: true },
  /*
    A coach's languages decide whether a submission needs translating at all;
    their specialties decide what they are assigned. They are the only role the
    public site shows, so bio and photo live here and nowhere else.
  */
  coach: { availability: true, languages: true, specialties: true, public: true, notify: false },
  /*
    A translator's languages are what they work BETWEEN — a different question
    from a coach's, and the reason these moved off the person in 2026-08-30.
    Specialties matter because the focus of a submission decides the vocabulary
    a leg needs, even though they are not the one reviewing it.
  */
  translator: { availability: true, languages: true, specialties: true, public: false, notify: false },
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
    ? `${stored.isActive}|${stored.notify}|${stored.languages.join(",")}|${stored.specialties.join(",")}|${stored.bio ?? ""}|${stored.imageUrl ?? ""}`
    : "none";

  const heldId = `${operatorId}-${role}-held`;
  const availableId = `${operatorId}-${role}-available`;
  const notifyId = `${operatorId}-${role}-notify`;

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
                    Taking {role === "coach" ? "submissions" : "translations"}.
                    Untick to pause without removing the role
                  </label>
                </div>
              )}

              {has.notify && (
                <div className="flex items-start gap-2">
                  <input
                    id={notifyId}
                    name="notify"
                    type="checkbox"
                    defaultChecked={stored?.notify ?? true}
                    className="mt-0.5"
                  />
                  <label htmlFor={notifyId} className="text-[13px] text-ink-muted">
                    Email me submission and system notifications. Untick to stop
                    your own copies; you stay a full admin, and the shared inbox
                    still receives everything.
                  </label>
                </div>
              )}

              {has.languages && (
                <Field
                  label="Languages"
                  hint={
                    role === "coach"
                      ? "What this coach understands. A submission is translated when it shares none with the customer."
                      : "Which direction they translate."
                  }
                >
                  {/*
                    A fixed dropdown, not free text (Ben, QA 5.13.4 / 5.13.6). A
                    coach picks a language set; a translator picks a direction —
                    different questions, so different options, chosen by role.
                  */}
                  {role === "coach" ? (
                    <select
                      name="languages"
                      defaultValue={choiceForLanguages(
                        stored?.languages ?? [],
                        DEFAULT_LANGUAGE_CHOICE,
                      )}
                      className={selectClass}
                    >
                      {LANGUAGE_CHOICES.map((choice) => (
                        <option key={choice} value={choice}>
                          {choice === "both" ? "Both" : choice}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      name="languages"
                      defaultValue={
                        TRANSLATOR_DIRECTIONS.includes(
                          stored?.languages[0] as TranslatorDirection,
                        )
                          ? stored!.languages[0]
                          : TRANSLATOR_DIRECTIONS[0]
                      }
                      className={selectClass}
                    >
                      {TRANSLATOR_DIRECTIONS.map((direction) => (
                        <option key={direction} value={direction}>
                          {direction === "both directions"
                            ? "Both directions"
                            : direction}
                        </option>
                      ))}
                    </select>
                  )}
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
                    hint="JPG or PNG. Leave the file empty to keep the current one."
                  >
                    {stored?.imageUrl && (
                      <div className="mb-3 flex items-center gap-3">
                        {/* The photo lives in a private blob; our own route
                            streams it by operator id. The stored key rides along
                            as a cache-buster so a fresh upload isn't masked by the
                            route's short cache (Ben, QA 5.13.6.9). */}
                        {/* eslint-disable-next-line @next/next/no-img-element -- a 64px admin thumbnail from our own route; next/image would only add an optimizer hop. */}
                        <img
                          src={`/api/coach-image/${operatorId}?v=${encodeURIComponent(stored.imageUrl)}`}
                          alt={`${copy.title} photo`}
                          className="h-16 w-16 rounded-lg border border-line object-cover"
                        />
                        <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                          <input type="checkbox" name="removeImage" />
                          Remove photo
                        </label>
                      </div>
                    )}
                    {/* Style the native control's own button so "Choose file"
                        reads as a button with a hover, without hiding the input
                        and losing the chosen-file name beside it (Ben, QA
                        5.13.6.9). */}
                    <input
                      name="image"
                      type="file"
                      accept="image/*"
                      className="block w-full text-sm text-ink-muted file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-paper-alt file:px-4 file:py-2 file:font-semibold file:text-ink file:transition-colors hover:file:border-ink hover:file:bg-white"
                    />
                  </Field>
                </>
              )}

              {!has.availability && !has.languages && !has.specialties && !has.notify && (
                <p className="text-[13px] text-ink-muted">
                  No further settings for this role.
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
