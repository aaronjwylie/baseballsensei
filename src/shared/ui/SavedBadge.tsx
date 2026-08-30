/**
 * "Saved", beside the button that saved it.
 *
 * One component so every form in the portal confirms the same way. They did not:
 * the role cards showed plain green text next to the button, while settings,
 * identity, profile and change-password each drew a full-width green banner
 * above the whole form. Same event, four presentations, and the banner moved
 * everything below it down by a row at the moment the operator was looking at
 * the button they had just pressed.
 *
 * ── Why beside the button ───────────────────────────────────────────────────
 *
 * That is where the eye already is. A confirmation at the top of a long form is
 * a confirmation someone has to go looking for — and on the operator page,
 * where three role cards each have their own save, a banner at the top of a
 * card is far enough from its button to read as belonging to the wrong one.
 *
 * ── `role="status"` ─────────────────────────────────────────────────────────
 *
 * Announced politely rather than drawn silently. A confirmation nobody hears is
 * not a confirmation for the person who cannot see it, and "polite" means it
 * waits rather than interrupting — which is right for good news. The matching
 * failure messages use `role="alert"`, which does interrupt, because being told
 * late that something did not save is worse than being interrupted.
 */
export function SavedBadge({
  children = "Saved",
}: {
  children?: React.ReactNode;
}) {
  return (
    <span
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-700"
    >
      {children}
    </span>
  );
}
