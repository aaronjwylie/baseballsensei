/**
 * Escape a value for inclusion in email HTML.
 *
 * Every template here interpolates things people typed — a player's name, a
 * filename, a message written into a contact form — into markup that is then
 * delivered to somebody's inbox. Unescaped, a name containing a tag is markup
 * by the time it arrives.
 *
 * **One home, deliberately.** This lived as a private function inside
 * `paymentEmail.ts`, and the instruction for new templates was to give them the
 * same treatment — which is a copy of a security control per template, and a
 * template that forgets is indistinguishable from one that didn't need it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
