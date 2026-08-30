"use client";

import { useActionState } from "react";
import { Button, Field, SavedBadge, inputClass } from "@/shared/ui";
import type { PlatformSettings } from "../model/settings";
import {
  updateSettingsAction,
  type SettingsFormState,
} from "../api/settingsActions";

/**
 * The admin's four knobs.
 *
 * `defaultValue` rather than controlled state: the server component above owns
 * the current values and re-renders on save, so holding a second copy in React
 * would only give the two a chance to disagree.
 */
export function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    updateSettingsAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      {state && "error" in state && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Pricing
        </legend>

        <Field
          label="Price per review ($ CAD)"
          hint="What the customer pays at checkout. Shown across the site and charged by Stripe."
        >
          <input
            name="priceDollars"
            type="number"
            min={1}
            max={10000}
            step="0.01"
            required
            defaultValue={(settings.priceCents / 100).toFixed(2)}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Upload limits
        </legend>

        <Field
          label="Largest file (MB)"
          hint="Applies to each file, not the total. A phone clip is usually 20–80 MB."
        >
          <input
            name="maxFileSizeMb"
            type="number"
            min={1}
            max={2000}
            required
            defaultValue={settings.maxFileSizeMb}
            className={inputClass}
          />
        </Field>

        <Field
          label="Files per submission"
          hint="How many files one customer may attach before checkout."
        >
          <input
            name="maxFilesPerSubmission"
            type="number"
            min={1}
            max={20}
            required
            defaultValue={settings.maxFilesPerSubmission}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Retention
        </legend>

        <Field
          label="Delete files this long after the customer downloads (days)"
          hint="The clock starts when they collect, not when we send — so nothing is ever deleted before they have it. Everything goes together, their uploads and the coach's response alike."
        >
          <input
            name="retainCollectedDays"
            type="number"
            min={1}
            max={3650}
            required
            defaultValue={settings.retainCollectedDays}
            className={inputClass}
          />
        </Field>

        <Field
          label="…or this long after we send it, if they never download (days)"
          hint="The backstop. Without it, a customer who never collects would keep their files forever. Whichever window ends later wins."
        >
          <input
            name="retainDeliveredDays"
            type="number"
            min={1}
            max={3650}
            required
            defaultValue={settings.retainDeliveredDays}
            className={inputClass}
          />
        </Field>

        <Field
          label="Warn the customer this many days before deleting"
          hint="One email, sent once. Set to 0 to delete without warning — not recommended, since it's their only chance to grab another copy."
        >
          <input
            name="warnBeforeDeletionDays"
            type="number"
            min={0}
            max={365}
            required
            defaultValue={settings.warnBeforeDeletionDays}
            className={inputClass}
          />
        </Field>

        <Field
          label="Delete uploads this long after an unpaid submission starts (hours)"
          hint="Covers abandoned checkouts — files uploaded by someone who never paid."
        >
          <input
            name="retainUnpaidHours"
            type="number"
            min={1}
            max={8760}
            required
            defaultValue={settings.retainUnpaidHours}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        {state && "ok" in state && <SavedBadge>Saved</SavedBadge>}
      </div>
    </form>
  );
}
