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

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const marksFile = args[args.indexOf("--marks") + 1];
/* The same string is passed to the publish, so the page and the host's version
   picker carry identical text. Matching them needs no version number. */
const buildLabel = args.includes("--label") ? args[args.indexOf("--label") + 1] : "unlabelled build";

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

  const what = cells[0];
  const expect = cells[1] ?? "";
  // Convention: an expectation opening with ⚠️ is a row worth being picky
  // about — a decision to ratify, or a failure that hurts. It renders as a
  // badge rather than as an emoji in the sentence.
  const flag = expect.startsWith("⚠️") ? "flag" : expect.startsWith("✅") ? "done" : null;

  if (!group) {
    group = { head: null, checks: [] };
    phase.groups.push(group);
  }
  group.checks.push([
    id,
    strip(what),
    // Alternation, not a character class: ⚠️ is U+26A0 followed by U+FE0F, and
    // a class matches one code point — which left the variation selector
    // stranded at the head of every flagged expectation.
    strip(expect.replace(/^(?:⚠️|✅)\s*/u, "")),
    ...(flag ? [flag] : []),
  ]);
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

/* No build number of our own.
   The host already versions every publish and shows it in a picker, and a
   second scheme beside it is two names for one thing — the drift this project
   spends its nomenclature law preventing. It cannot be mirrored honestly
   either: the version is assigned at publish, after this file is written, and
   when the page republishes ITSELF to save a tick it carries whatever was
   baked in while the host increments underneath it. So the picker is the
   version, and the publish carries a human-readable label beside it. */

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

writeFileSync(OUTPUT, html);
console.log(`[qa:build] ${trail.length} trail entr${trail.length === 1 ? "y" : "ies"} carried over`);
console.log(`[qa:build] wrote docs/qa/qa-run.html (${Math.round(html.length / 1024)} KB)`);
console.log(`[qa:build] label "${buildLabel}" — pass the SAME string to the publish so page and picker match`);
