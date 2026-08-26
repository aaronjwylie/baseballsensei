#!/usr/bin/env node
/**
 * Read how the shared record was used.
 *
 *   npm run qa:trail -- <saved-artifact.html>
 *
 * The product's instrument posts to an endpoint and `qa:tail` follows it live.
 * The record cannot do that — the viewer sandbox blocks requests to other
 * hosts — so its trail rides along in the state the page publishes and arrives
 * whenever the page is next read. Coarser, and later, by construction.
 *
 * **It sees nothing during a session that never publishes.** Somebody reading
 * the record without ticking anything leaves no trace at all, which is a real
 * blind spot rather than an implementation gap.
 *
 * Times in the reader's zone, UTC beside them — same reasoning as `qa:tail`.
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: npm run qa:trail -- <saved-artifact.html>");
  process.exit(1);
}

const html = readFileSync(file, "utf8");
const m = html.match(/<script id="qa-state" type="application\/json">([\s\S]*?)<\/script>/);
if (!m) { console.error("No state block — is this the published record?"); process.exit(1); }

const state = JSON.parse(m[1]);
const trail = state.trail || [];
const marks = state.marks || {};

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

console.log(`Build ${state.build ?? "?"} · ${Object.keys(marks).length} mark(s) · ${trail.length} trail entr${trail.length === 1 ? "y" : "ies"}`);
console.log(`Times in ${Intl.DateTimeFormat().resolvedOptions().timeZone}, UTC beside.\n`);

const DESCRIBE = {
  open: (d) => `opened the record (${d?.marks ?? 0} marks already on it)`,
  reading: (d) => `reading ${d?.phase ?? "?"}`,
  jump: (d) => `jumped to ${d?.phase ?? "?"}`,
  filter: (d) => `filtered to "${d?.to ?? "?"}"`,
  mark: (d) => `marked ${d?.id} ${d?.v}` + (d?.was ? ` (was ${d.was})` : ""),
  unmark: (d) => `cleared ${d?.id}` + (d?.was ? ` (was ${d.was})` : ""),
  note: (d) => `started a note on ${d?.id}`,
};

for (const e of trail) {
  const d = new Date(e.t);
  const say = (DESCRIBE[e.kind] || ((x) => `${e.kind} ${JSON.stringify(x ?? {})}`))(e.d);
  console.log(`${clock.format(d)} (${e.t.slice(11, 19)}Z)  ${say}`);
}

if (!trail.length) {
  console.log("  (nothing yet — the trail only travels when the page publishes,");
  console.log("   which happens when somebody marks a check)");
}
