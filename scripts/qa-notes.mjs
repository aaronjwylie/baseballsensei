#!/usr/bin/env node
/**
 * The findings from the pass, for the session that has to fix them.
 *
 *   npm run qa:notes                    -- everything still pending
 *   npm run qa:notes -- --all           -- every note, whatever its state
 *   npm run qa:notes -- --status accepted
 *   npm run qa:notes -- --fixed <id>    -- say a patch has landed
 *   npm run qa:notes -- --local http://localhost:3000
 *
 * Each finding prints with the check's own wording beside it, because "the
 * panel is see-through" is not actionable without "solid dark ground — the hero
 * photo must not show through it".
 *
 * **It never marks anything resolved.** `--fixed` is the strongest thing a
 * fixer can say; `resolved` belongs to whoever re-ran the check, and is given
 * on the board. Collapsing the two would let the record go green on the word of
 * the person who wrote the patch.
 *
 * **`accepted` notes are not work.** A tester marks a finding accepted when it
 * records a decision rather than a defect — the eyebrow is blue because that is
 * how it was drawn. They are excluded from the default listing and the count of
 * what is excluded is printed, because a queue that filters silently is how a
 * finding gets lost between two people who each thought the other had it.
 */
import env from "@next/env";
env.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const token = process.env.QA_TOKEN;
if (!token) {
  console.error("QA_TOKEN is not set. It lives in .env.local.");
  process.exit(1);
}
const base = valueOf("--local") ?? "https://www.baseball-sensei.com";

const fixedId = valueOf("--fixed");
if (fixedId) {
  const res = await fetch(`${base}/api/qa/notes?token=${encodeURIComponent(token)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: fixedId, status: "fixed", by: valueOf("--by") ?? "fix session" }),
  });
  console.log(res.ok ? `Marked ${fixedId} fixed — awaiting re-test.` : `Failed: ${res.status}`);
  process.exit(res.ok ? 0 : 1);
}

const status = has("--all") ? null : (valueOf("--status") ?? "pending");
const url = new URL(`${base}/api/qa/notes`);
url.searchParams.set("token", token);
if (status) url.searchParams.set("status", status);

const res = await fetch(url);
if (!res.ok) {
  console.error(`${res.status} from ${base} — is QA_TOKEN right?`);
  process.exit(1);
}
const { build, notes } = await res.json();

/* What this listing is not showing. Fetched separately rather than inferred,
   so the number is the server's answer and not this script's arithmetic. */
let hidden = "";
if (status === "pending") {
  const other = new URL(`${base}/api/qa/notes`);
  other.searchParams.set("token", token);
  const all = await (await fetch(other)).json();
  const counts = { fixed: 0, resolved: 0, accepted: 0 };
  for (const n of all.notes) if (n.status in counts) counts[n.status]++;
  const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  if (parts.length) hidden = `  (not shown: ${parts.join(", ")})`;
}

console.log(`Itinerary build ${build} — ${notes.length} ${status ?? "note"}${notes.length === 1 ? "" : "s"}${hidden}\n`);
for (const n of notes) {
  console.log(`── ${n.checkId}  [${n.status}]  ${n.browser ?? "browser unstated"}`);
  if (n.check) {
    console.log(`   check:    ${n.check.what}`);
    console.log(`   expected: ${n.check.expect}`);
  } else {
    console.log("   (this check is no longer in the itinerary)");
  }
  console.log(`   found:    ${n.body.replace(/\n/g, "\n             ")}`);
  console.log(`   by ${n.author ?? "—"} at ${n.at.slice(11, 16)}Z    note id ${n.id}`);
  console.log();
}
if (notes.length) {
  console.log("Mark one fixed:  npm run qa:notes -- --fixed <note id>");
  console.log("A tester resolves it on /qa after re-testing — never this script.");
} else {
  console.log("Nothing pending.");
}
if (hidden) console.log("See everything:  npm run qa:notes -- --all");
