#!/usr/bin/env node
/**
 * The findings from the pass, for the session that has to fix them.
 *
 *   npm run qa:notes                    -- unclaimed work
 *   npm run qa:notes -- --on 9.5.1 --say "what I saw" --by "Claude (watcher)"
 *   npm run qa:notes -- --edit <id> --say "corrected wording"
 *   npm run qa:notes -- --delete <id>
 *   npm run qa:notes -- --claim <id>    -- TAKE IT FIRST, before editing code
 *   npm run qa:notes -- --fixed <id>    -- say the patch has landed
 *   npm run qa:notes -- --unclaim <id>  -- put it back
 *   npm run qa:notes -- --all           -- every note, whatever its state
 *   npm run qa:notes -- --status blocked
 *   npm run qa:notes -- --local http://localhost:3000
 *
 * ── Claim before you work ────────────────────────────────────────────────
 * A tester may edit or delete a note while it is pending, because nobody has
 * acted on it. Claiming is how you say otherwise: it locks the note, so the
 * wording cannot change under a fix that is already being written. Read the
 * queue, claim what you are taking, then start.
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
 * **`blocked` notes are real but not yours.** A tester marks a finding blocked
 * when it is waiting on someone — client copy, a photograph, a decision. They
 * are excluded from the default listing, and the count of what is excluded is
 * printed, because a queue that filters silently is how a finding gets lost
 * between two people who each thought the other had it.
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

const say = valueOf("--say");
const on = valueOf("--on");
if (on) {
  if (!say) { console.error("--on needs --say"); process.exit(1); }
  const res = await fetch(`${base}/api/qa/notes?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      checkId: on,
      body: say,
      browser: valueOf("--browser") ?? null,
      by: valueOf("--by"),
    }),
  });
  const payload = await res.json().catch(() => ({}));
  console.log(payload.ok ? `Noted on ${on} — ${payload.id}` : `Failed: ${payload.error ?? res.status}`);
  process.exit(payload.ok ? 0 : 1);
}

const editId = valueOf("--edit");
if (editId) {
  if (!say) { console.error("--edit needs --say"); process.exit(1); }
  const res = await fetch(`${base}/api/qa/notes?token=${encodeURIComponent(token)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: editId, body: say }),
  });
  const payload = await res.json().catch(() => ({}));
  console.log(payload.ok ? `Edited ${editId} — the previous wording is kept.` : `Failed: ${payload.error ?? res.status}`);
  process.exit(payload.ok ? 0 : 1);
}

const delId = valueOf("--delete");
if (delId) {
  const res = await fetch(
    `${base}/api/qa/notes?token=${encodeURIComponent(token)}&id=${encodeURIComponent(delId)}`,
    { method: "DELETE" },
  );
  const payload = await res.json().catch(() => ({}));
  console.log(payload.ok ? `Deleted ${delId}.` : `Failed: ${payload.error ?? res.status}`);
  process.exit(payload.ok ? 0 : 1);
}

const transitions = [
  ["--claim", "claimed", "claimed — it is locked against edits while you work on it."],
  ["--fixed", "fixed", "fixed — awaiting a tester's re-test. CONFIRM THE DEPLOY IS LIVE FIRST: a pushed commit is not a landed patch, and a tester re-running against the old bundle will report the fix as failed."],
  ["--unclaim", "pending", "put back — a tester may edit or delete it again."],
];
for (const [flag, status, said] of transitions) {
  const id = valueOf(flag);
  if (!id) continue;
  const res = await fetch(`${base}/api/qa/notes?token=${encodeURIComponent(token)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, status, by: valueOf("--by") ?? "fix session" }),
  });
  const payload = await res.json().catch(() => ({}));
  console.log(res.ok && payload.ok ? `${id} ${said}` : `Failed: ${payload.error ?? res.status}`);
  process.exit(res.ok && payload.ok ? 0 : 1);
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
  const counts = { claimed: 0, fixed: 0, resolved: 0, blocked: 0 };
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
  console.log("Take one:        npm run qa:notes -- --claim <note id>   ← before you edit code");
  console.log("Then, on landing: npm run qa:notes -- --fixed <note id>");
  console.log("A tester resolves it on /qa after re-testing — never this script.");
} else {
  console.log("Nothing unclaimed.");
}
if (hidden) console.log("See everything:  npm run qa:notes -- --all");
