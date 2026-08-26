#!/usr/bin/env node
/**
 * Build the QA record from the itinerary.
 *
 *   docs/qa/itinerary.md  ──▶  docs/qa/qa-run.html  ──▶  published artifact
 *
 * **The markdown is the only source.** The checks used to exist twice — as
 * tables here and as a hand-transcribed array inside the artifact — which is
 * two homes for one fact, and the pair drifted the first time either was
 * edited. Editing the itinerary and re-running this is now the whole pipeline.
 *
 * **Marks survive a rebuild.** A pass is edited *while it is being run* — Q12
 * removes checks that became gates, and findings add new ones — so a rebuild
 * that discarded progress would make the pipeline unusable exactly when it is
 * needed. Existing marks are carried over by id, and any mark whose check has
 * gone is reported rather than dropped silently.
 *
 *   node scripts/qa-build.mjs                     rebuild, keeping marks
 *   node scripts/qa-build.mjs --marks state.json  merge marks from a file
 *   node scripts/qa-build.mjs --check             parse and report, write nothing
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "docs/qa/itinerary.md");
const TEMPLATE = join(ROOT, "docs/qa/template.html");
const OUTPUT = join(ROOT, "docs/qa/qa-run.html");
/* The site's /qa page renders from this. Same parse, same source, so the
   in-app record and the shareable artifact cannot disagree about what the
   itinerary says. */
const DATA = join(ROOT, "src/domains/qa/model/itinerary.json");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const marksFile = args[args.indexOf("--marks") + 1];
/* The same string is passed to the publish, so the page and the host's version
   picker carry identical text. Matching them needs no version number. */
const VERSION = join(ROOT, "docs/qa/version.json");
const LEDGER = join(ROOT, "docs/qa/ledger.json");

/* ── Parse ────────────────────────────────────────────────────────────────
   Deliberately strict. A row that looks like a check but cannot be read is a
   hard error, never a skip: silently dropping a check is the one failure mode
   that would make the artifact quietly claim less coverage than the itinerary
   promises. */
const md = readFileSync(SOURCE, "utf8");
const lines = md.split("\n");

const phases = [];
let phase = null;
let group = null;
let inRetired = false;
let noteLines = [];
const retiredIds = new Set();
const allChecks = new Map();
const problems = [];

/** Attach the collected prose to the phase it followed, once. */
function flushNote() {
  if (phase && !phase.note && noteLines.length) {
    phase.note = strip(noteLines.join(" "));
  }
  noteLines = [];
}
const seen = new Map();

const CHECK_ROW = /^\|\s*(\d+(?:\.\d+)*)\s*\|(.*)$/;
const PHASE_HEAD = /^##\s+Phase\s+(\d+)\s*·\s*(.+?)\s*$/;
const GROUP_HEAD = /^###\s+(.+?)\s*$/;

lines.forEach((line, i) => {
  const at = `itinerary.md:${i + 1}`;

  // `<details>` wraps superseded content kept for reference; its rows are not
  // part of the pass.
  if (/^<details>/.test(line)) inRetired = true;
  if (/^<\/details>/.test(line)) { inRetired = false; return; }

  const ph = line.match(PHASE_HEAD);
  if (ph) {
    // Everything after "Results" is the summary table, not checks.
    phase = { n: ph[1], title: ph[2].replace(/\s*—.*$/, "").replace(/`/g, ""), id: `p${ph[1]}`, note: null, groups: [] };
    phases.push(phase);
    group = null;
    noteLines = [];
    return;
  }

  /* Prose between a phase heading and its first group or table is the phase's
     note — the sentence that says how to read the phase, which test cards to
     use, or which rows are decisions rather than defects. The first version of
     this parser read only tables and silently dropped all twelve of them,
     including the one carrying the payment test-card numbers. */
  if (phase && !inRetired && !group && phase.groups.length === 0) {
    if (/^\s*$/.test(line) || /^[|#>]/.test(line) || /^<details/.test(line)) {
      if (noteLines.length && !/^\s*$/.test(line)) flushNote();
    } else {
      noteLines.push(line.trim());
      return;
    }
  }
  if (/^##\s+Results/.test(line)) { phase = null; return; }

  const gh = line.match(GROUP_HEAD);
  if (gh && phase && !inRetired) {
    flushNote();
    group = { head: gh[1].replace(/[*`~]/g, "").trim(), checks: [] };
    phase.groups.push(group);
    return;
  }

  const row = line.match(CHECK_ROW);
  if (!row || inRetired) return;
  flushNote();
  if (!phase) { problems.push(`${at}: check ${row[1]} outside any phase`); return; }

  const cells = row[2].split("|").map((c) => c.trim());
  // A trailing empty cell is normal (markdown row ends with `|`).
  while (cells.length && cells[cells.length - 1] === "") cells.pop();
  if (cells.length < 1) { problems.push(`${at}: check ${row[1]} has no description`); return; }

  const id = row[1];
  if (seen.has(id)) { problems.push(`${at}: duplicate id ${id} (also ${seen.get(id)})`); return; }
  seen.set(id, at);

  let what = cells[0];
  const expect = cells[1] ?? "";

  /* A check is retired by striking it through in the markdown, never by
     deleting the row. Deleting frees an id for reuse, and a reused id makes
     every verdict recorded against the old one silently describe the new one —
     which is the one way a QA record can lie without anybody editing it. */
  const retired = /^~~[\s\S]*~~$/.test(what.trim());
  if (retired) what = what.trim().replace(/^~~/, "").replace(/~~$/, "");
  // Convention: an expectation opening with ⚠️ is a row worth being picky
  // about — a decision to ratify, or a failure that hurts. It renders as a
  // badge rather than as an emoji in the sentence.
  const flag = expect.startsWith("⚠️") ? "flag" : expect.startsWith("✅") ? "done" : null;

  if (!group) {
    group = { head: null, checks: [] };
    phase.groups.push(group);
  }
  allChecks.set(id, {
    what: strip(what),
    expect: strip(expect.replace(/^(?:⚠️|✅)\s*/u, "")),
    retired,
  });
  group.checks.push([
    id,
    strip(what),
    // Alternation, not a character class: ⚠️ is U+26A0 followed by U+FE0F, and
    // a class matches one code point — which left the variation selector
    // stranded at the head of every flagged expectation.
    strip(expect.replace(/^(?:⚠️|✅)\s*/u, "")),
    ...(flag ? [flag] : []),
  ]);
  if (retired) retiredIds.add(id);
});

/** Markdown emphasis is noise once the page has its own type hierarchy. */
function strip(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const total = phases.reduce((a, p) => a + p.groups.reduce((b, g) => b + g.checks.length, 0), 0);

/* ── The ledger ───────────────────────────────────────────────────────────
   Every id the itinerary has ever carried, what it said, and what it used to
   say. It exists to make three promises the record depends on:

     · an id is permanent — it is never renumbered and never reused
     · a check is retired, never deleted, so verdicts recorded against it stay
       attached to the thing that was verified
     · an edit is visible — the wording that a verdict was given under is kept,
       because "5.4 passed" means something different if 5.4 used to say
       something else

   Kept in git beside the itinerary, so its history is reviewable the same way
   the checks are. */
const ledger = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, "utf8"))
  : { entries: {} };

const stamp = new Date().toISOString();
const liveIds = new Set(seen.keys());

for (const [id, at] of seen) {
  const check = allChecks.get(id);
  const entry = ledger.entries[id];

  if (!entry) {
    ledger.entries[id] = {
      firstSeen: stamp,
      what: check.what,
      expect: check.expect,
      retired: check.retired,
      history: [],
    };
    continue;
  }

  /* An id that was retired and has come back is either a resurrection — fine,
     the verdicts still describe it — or a reuse, which is not. The wording
     decides which, and a reuse is refused rather than guessed at. */
  if (entry.retired && !check.retired && entry.what !== check.what) {
    problems.push(
      `${at}: id ${id} was retired reading "${entry.what}" and has come back reading ` +
        `"${check.what}" — an id is never reused. Give the new check a new id.`,
    );
    continue;
  }

  if (entry.what !== check.what || entry.expect !== check.expect) {
    entry.history.push({ at: stamp, what: entry.what, expect: entry.expect });
    entry.what = check.what;
    entry.expect = check.expect;
  }
  entry.retired = check.retired;
}

/* A check that has left the markdown entirely. Its verdicts are still in the
   record and now describe nothing. */
for (const [id, entry] of Object.entries(ledger.entries)) {
  if (liveIds.has(id) || entry.deletedAt) continue;
  problems.push(
    `itinerary.md: check ${id} ("${entry.what}") has been deleted. Retire it ` +
      `instead — strike the text through with ~~…~~ — so the verdicts recorded ` +
      `against it stay attached to what was verified.`,
  );
}

if (problems.length) {
  console.error(`[qa:build] ${problems.length} problem(s) in the itinerary:\n`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

/* ── Marks ──────────────────────────────────────────────────────────────── */
let marks = {};
if (marksFile && existsSync(marksFile)) {
  const raw = JSON.parse(readFileSync(marksFile, "utf8"));
  marks = raw.marks ?? raw;
} else if (existsSync(OUTPUT)) {
  const prev = readFileSync(OUTPUT, "utf8");
  const m = prev.match(/<script id="qa-state" type="application\/json">([\s\S]*?)<\/script>/);
  if (m) { try { marks = (JSON.parse(m[1]) || {}).marks ?? {}; } catch { /* start clean */ } }
}

/* The trail is carried across a rebuild too. It records how the record was
   used, and an itinerary edit is no reason to forget it. */
let trail = [];
if (marksFile && existsSync(marksFile)) {
  trail = (JSON.parse(readFileSync(marksFile, "utf8")).trail) || [];
} else if (existsSync(OUTPUT)) {
  const prev = readFileSync(OUTPUT, "utf8");
  const m = prev.match(/<script id="qa-state" type="application\/json">([\s\S]*?)<\/script>/);
  if (m) { try { trail = (JSON.parse(m[1]) || {}).trail || []; } catch { /* start clean */ } }
}

const ids = new Set(seen.keys());
const orphans = Object.keys(marks).filter((id) => !ids.has(id));
for (const id of orphans) delete marks[id];

/* ── Emit ───────────────────────────────────────────────────────────────── */
console.log(`[qa:build] ${phases.length} phases, ${total} checks`);
for (const p of phases) {
  const n = p.groups.reduce((a, g) => a + g.checks.length, 0);
  console.log(`  ${String(p.n).padStart(2)} · ${p.title.padEnd(28)} ${String(n).padStart(3)}`);
}
const marked = Object.keys(marks).length;
console.log(`[qa:build] ${marked} mark(s) carried over` + (orphans.length ? `, ${orphans.length} dropped: ${orphans.join(", ")}` : ""));

if (checkOnly) process.exit(0);

/* An incrementing build number, stamped in the masthead.

   Tried and dropped once in favour of matching the host's version, then
   brought back: the host's number is not knowable at build time, and a build
   number that is ours answers the only question being asked — "are we both
   looking at the thing you just published?" — without pretending to be the
   host's. The publish also carries a label, so the picker row says what
   changed. Two identifiers for two different jobs, not two for one.

   Superseded note kept for the record:
   The host already versions every publish and shows it in a picker, and a
   second scheme beside it is two names for one thing — the drift this project
   spends its nomenclature law preventing. It cannot be mirrored honestly
   either: the version is assigned at publish, after this file is written, and
   when the page republishes ITSELF to save a tick it carries whatever was
   baked in while the host increments underneath it. */
const version = existsSync(VERSION) ? JSON.parse(readFileSync(VERSION, "utf8")) : { build: 0 };
version.build += 1;
version.builtAt = new Date().toISOString();
writeFileSync(VERSION, JSON.stringify(version, null, 2) + "\n");
const buildLabel = `Build ${version.build}`;

const template = readFileSync(TEMPLATE, "utf8");
const html = template
  .replace("__LABEL__", buildLabel.replace(/</g, "\\u003c"))
  .replace(
    /const PHASES = \/\*__PHASES__\*\/[\s\S]*?\/\*__END_PHASES__\*\/;/,
    "const PHASES = " + JSON.stringify(phases, null, 2) + ";",
  )
  .replace(
    "/*__STATE__*/",
    JSON.stringify({ marks, trail }).replace(/</g, "\\u003c"),
  );

if (html.includes("__PHASES__") || html.includes("__STATE__") || html.includes("__LABEL__")) {
  console.error("[qa:build] a placeholder survived — the template and this script disagree");
  process.exit(1);
}

/* Emitted before the HTML, so a failure here stops both outputs rather than
   leaving the page and the artifact describing different runs. */
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");

const retiredCount = [...allChecks.values()].filter((c) => c.retired).length;
const editedCount = Object.values(ledger.entries).filter(
  (e) => !e.deletedAt && e.history.length > 0,
).length;

writeFileSync(
  DATA,
  JSON.stringify(
    {
      /* Stamped so `/qa` can say which itinerary it is showing. Unlike the
         artifact's, this number is unambiguous: the page is server-rendered
         from a deploy, so what you see is what was built. */
      meta: {
        build: version.build,
        generatedAt: stamp,
        checks: allChecks.size,
        live: allChecks.size - retiredCount,
        retired: retiredCount,
        edited: editedCount,
      },
      phases: phases.map((p) => ({
        ...p,
        groups: p.groups.map((g) => ({
          head: g.head,
          checks: g.checks.map(([id, what, expect, flag]) => ({
            id,
            what,
            expect,
            ...(flag ? { flag } : {}),
            ...(ledger.entries[id]?.retired ? { retired: true } : {}),
            ...(ledger.entries[id]?.history.length
              ? { history: ledger.entries[id].history }
              : {}),
          })),
        })),
      })),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `[qa:build] ${allChecks.size} checks — ${allChecks.size - retiredCount} live, ` +
    `${retiredCount} retired, ${editedCount} edited since first written`,
);
console.log(`[qa:build] ledger: ${Object.keys(ledger.entries).length} ids ever issued`);

writeFileSync(OUTPUT, html);
console.log(`[qa:build] ${trail.length} trail entr${trail.length === 1 ? "y" : "ies"} carried over`);
console.log(`[qa:build] wrote docs/qa/qa-run.html (${Math.round(html.length / 1024)} KB)`);
console.log(`[qa:build] ${buildLabel} — stamped in the masthead; give the publish a label too`);
