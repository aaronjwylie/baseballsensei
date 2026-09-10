#!/usr/bin/env node
/**
 * check-doctrine — the doctrine's own rail.
 *
 * Every law in this pack preaches *make the rail mechanical* ([PRINCIPLES §14]),
 * and until 2026-08-06 the doctrine itself had none: nothing asserted that a law
 * had a live companion, that a `{{placeholder}}` had been filled, or that a
 * cross-reference pointed at a file that exists. By its own §14 that is a defect.
 *
 * It is not hypothetical. Writing the six Documentation companions produced
 * **fourteen broken links in files that had just been authored**, and moving one
 * law between folders silently orphaned twelve more. Both were found by a script
 * written in five minutes, after neither `tsc`, `eslint`, `next build` nor
 * `check:names` could see them — a markdown link is a string, and a wrong string
 * is a well-typed string.
 *
 * Five checks, cheapest first:
 *
 *   1. PAIRING      every laws/_XLaw.md has documentation/_XDocumentation.md
 *   2. PLACEHOLDERS no {{…}} survives outside templates/, where it is the point
 *   3. LINKS        every relative markdown link resolves to a real path
 *   4. SLICES       every domain carries a _XxxDocumentation.md
 *   5. DRIFT        every law matches the hash pinned in doctrine.json — a law
 *                   is "copied verbatim" from the pack, and until 2026-09-10
 *                   nothing could say whether it still was (_ReleaseLaw P13,
 *                   applied to the documents: every copy says which version)
 *
 * Runs in `npm run build`. A broken doctrine link blocking a deploy is a
 * deliberate trade: this project has spent more time on documents that quietly
 * stopped being true than on any bug.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, normalize, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".storage", "drizzle"]);

/** Every .md in the repo, excluding build output and dependencies. */
function markdownFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      markdownFiles(full, out);
    } else if (entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

const findings = [];
const note = (file, message) => findings.push({ file: relative(ROOT, file), message });

// ── 1 · PAIRING ────────────────────────────────────────────────────────────
// A law with no companion is a rule nobody has had to apply, which is the state
// a rule is least trustworthy in.
const lawsDir = join(ROOT, "laws");
const docsDir = join(ROOT, "documentation");
let laws = [];
if (existsSync(lawsDir)) {
  laws = readdirSync(lawsDir).filter((f) => /^_[A-Za-z]+Law\.md$/.test(f));
  for (const law of laws) {
    const stem = law.replace(/^_(.+)Law\.md$/, "$1");
    const companion = join(docsDir, `_${stem}Documentation.md`);
    if (!existsSync(companion)) {
      note(join(lawsDir, law), `no companion — expected documentation/_${stem}Documentation.md`);
    }
  }
}

// ── 2 · PLACEHOLDERS ───────────────────────────────────────────────────────
// `templates/` is where {{…}} belongs; anywhere else it is an unfinished doc
// wearing a finished one's name.
for (const file of markdownFiles()) {
  const rel = relative(ROOT, file);
  if (rel.startsWith("templates/")) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    /*
      A placeholder inside a fence is a *form* — a law showing the shape a thing
      must take, which is a law doing its job. In prose it is an unfinished
      document wearing a finished one's name. That distinction is the whole rule,
      and it is why this check reads fences rather than grepping for braces:
      `_DesignLaw` §2 legitimately shows the shape of a principle, and a blunter
      version of this check flagged it on the first run.
    */
    if (inFence) return;
    const hit = line.match(/\{\{[^}]{1,60}\}\}/);
    if (hit) note(file, `line ${i + 1}: unfilled placeholder ${hit[0]}`);
  });
}

// ── 3 · LINKS ──────────────────────────────────────────────────────────────
// The check that has already paid for itself twice.
const LINK = /\]\((?!https?:|mailto:|#)([^)\s#]+)(?:#[^)]*)?\)/g;
for (const file of markdownFiles()) {
  const body = readFileSync(file, "utf8");
  for (const match of body.matchAll(LINK)) {
    const target = match[1].trim();
    if (target.startsWith("/") || target.includes("{{")) continue;
    const resolved = normalize(join(dirname(file), target));
    if (!existsSync(resolved)) note(file, `dead link → ${target}`);
  }
}

// ── 4 · SLICES ─────────────────────────────────────────────────────────────
// "Read the slice's doc before changing the slice" only works if there is one.
const domainsDir = join(ROOT, "src", "domains");
if (existsSync(domainsDir)) {
  for (const slice of readdirSync(domainsDir)) {
    const dir = join(domainsDir, slice);
    if (!statSync(dir).isDirectory()) continue;
    const expected = `_${slice[0].toUpperCase()}${slice.slice(1)}Documentation.md`;
    if (!existsSync(join(dir, expected))) {
      note(dir, `slice has no doc — expected ${expected}`);
    }
  }
}

// ── 5 · DRIFT ──────────────────────────────────────────────────────────────
// doctrine.json is written by the pack's `tools/doctrine/doctrine.mjs pin`. It
// records the pack version adopted and each law's hash as pinned. A law whose
// hash has moved since is one of two things — an amendment nobody recorded in
// _DoctrineFeedback.md, or a pack upgrade nobody re-pinned — and both are
// findings. Position against the pack (amended / behind) is the pack's job to
// report, not this gate's to fail: those are decisions a project may have made.
const pinFile = join(ROOT, "doctrine.json");
if (!existsSync(pinFile)) {
  note(pinFile, "no doctrine.json — run `doctrine pin` from the pack (see documentation/README.md)");
} else {
  const pin = JSON.parse(readFileSync(pinFile, "utf8"));
  const pinnedDir = join(ROOT, pin.lawsDir ?? "laws");
  const pinned = Object.keys(pin.laws ?? {});
  if (pinned.length < 3) note(pinFile, `vacuity: only ${pinned.length} law(s) pinned — wrong lawsDir?`);
  for (const law of pinned) {
    const file = join(pinnedDir, law);
    if (!existsSync(file)) { note(file, "pinned in doctrine.json but missing"); continue; }
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (hash !== pin.laws[law].sha256) {
      note(file, "changed since pinned — record the amendment in documentation/_DoctrineFeedback.md and upstream it, or re-pin deliberately (`doctrine pin`)");
    }
  }
  for (const law of laws) {
    if (!pin.laws?.[law]) note(join(lawsDir, law), "present but not pinned in doctrine.json — `doctrine pin`");
  }
}

// ── report ─────────────────────────────────────────────────────────────────
if (findings.length) {
  console.error(`\n[doctrine] ${findings.length} problem${findings.length === 1 ? "" : "s"}:\n`);
  for (const f of findings) console.error(`  ${f.file}\n      ${f.message}`);
  console.error("");
  process.exit(1);
}

const docCount = existsSync(docsDir)
  ? readdirSync(docsDir).filter((f) => f.endsWith("Documentation.md")).length
  : 0;
const pinnedPack = existsSync(pinFile) ? JSON.parse(readFileSync(pinFile, "utf8")).pack : "unpinned";
console.log(`[doctrine] ok — ${laws.length} laws (pack v${pinnedPack}, no drift), ${docCount} companions, every link resolves`);
