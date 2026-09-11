#!/usr/bin/env node
/**
 * release — cut a release (_ReleaseLaw §7 step 1; _ReleaseDocumentation §1b).
 *
 *   npm run release -- 1.0.0            cut, commit, tag, push
 *   npm run release -- 1.0.0 --dry-run  show what would change, touch nothing
 *   npm run release -- 1.0.0 --no-ci    skip the "CI is green on HEAD" check
 *
 * A release is a tag on a commit of main whose package.json, changelog heading
 * and migration journal agree. This script makes the three agree and then asks
 * check-release to confirm it, so the cut is mechanical rather than remembered.
 *
 * What it does, in order — and it refuses before touching anything if a step
 * cannot be true:
 *
 *   1. on `main`, clean tree, level with origin/main
 *   2. CI green on HEAD (via `gh`), unless --no-ci
 *   3. the version is package.json's, or newer — never older
 *   4. CHANGELOG.md: an `## [X.Y.Z] — in progress` heading is dated, or the
 *      [Unreleased] body moves under a new dated heading; either way the
 *      heading gains `· schema NNNN` and, if floors.json names a migration
 *      newer than the previous release's schema, `· floor`
 *   5. package.json version bumped if needed
 *   6. check-release must pass on the result
 *   7. commit "Release X.Y.Z", annotated tag vX.Y.Z, push main + the tag
 *
 * The tag is the release. Nothing here deploys — that is `npm run promote`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const version = argv.find((a) => /^\d+\.\d+\.\d+$/.test(a));
const dryRun = argv.includes("--dry-run");
const noCi = argv.includes("--no-ci");

const die = (m) => { console.error(`\n[release] refused — ${m}\n`); process.exit(1); };
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], ...opts }).toString().trim();
const shQuiet = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const today = () => new Date().toISOString().slice(0, 10);
const cmp = (a, b) => { const [x, y] = [a, b].map((v) => v.split(".").map(Number)); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

if (!version) die("usage: npm run release -- X.Y.Z [--dry-run] [--no-ci]");

// ── 1 · where we are ───────────────────────────────────────────────────────
if (sh("git branch --show-current") !== "main") die("releases are cut from main");
if (sh("git status --porcelain")) die("working tree is not clean");
sh("git fetch -q origin main --tags");
if (sh("git rev-parse HEAD") !== sh("git rev-parse origin/main")) die("main is not level with origin/main — pull or push first");
const head = sh("git rev-parse HEAD");

// ── 2 · CI green on HEAD ───────────────────────────────────────────────────
if (!noCi) {
  const runs = shQuiet(`gh run list --branch main --limit 20 --json headSha,conclusion,status,name`);
  if (!runs) die("cannot read CI runs (is `gh` installed and logged in?) — pass --no-ci to skip, and say why in the commit");
  const forHead = JSON.parse(runs).filter((r) => r.headSha === head && r.name === "CI");
  if (!forHead.length) die(`no CI run found for ${head.slice(0, 7)} — wait for it, or --no-ci`);
  const bad = forHead.find((r) => r.status !== "completed" || r.conclusion !== "success");
  if (bad) die(`CI on ${head.slice(0, 7)} is ${bad.status}/${bad.conclusion ?? "pending"} — a release is cut from green`);
}

// ── 3 · the version ────────────────────────────────────────────────────────
const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (cmp(version, pkg.version) < 0) die(`${version} is older than package.json's ${pkg.version} — a release never goes backwards`);
if (shQuiet(`git tag --list v${version}`)) die(`v${version} already exists — a tag never moves; cut the next version`);

// ── 4 · the changelog ──────────────────────────────────────────────────────
let changelog = readFileSync("CHANGELOG.md", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const schema = journal.entries.at(-1).tag.slice(0, 4);
const floors = existsSync("drizzle/floors.json") ? JSON.parse(readFileSync("drizzle/floors.json", "utf8")).floors ?? [] : [];

const HEADING = /^## \[(\d+\.\d+\.\d+)\](.*)$/gm;
const headings = [...changelog.matchAll(HEADING)].map((m) => ({ version: m[1], rest: m[2], line: m[0], index: m.index }));
const previous = headings.find((h) => h.version !== version);
const previousSchema = previous?.rest.match(/schema (\d{4})/)?.[1] ?? "0000";
const floorsHere = floors.filter((f) => f.slice(0, 4) > previousSchema && f.slice(0, 4) <= schema);
const newHeading = `## [${version}] — ${today()} · schema ${schema}${floorsHere.length ? " · floor" : ""}`;

const inProgress = headings.find((h) => h.version === version && /in progress/.test(h.rest));
if (inProgress) {
  changelog = changelog.replace(inProgress.line, newHeading);
} else if (headings.some((h) => h.version === version)) {
  die(`CHANGELOG.md already has a dated [${version}] section`);
} else {
  const m = changelog.match(/^## \[Unreleased\]\n([\s\S]*?)(?=^## \[|\Z)/m);
  const body = (m?.[1] ?? "").replace(/^---\s*$/m, "").trim();
  if (!/^- /m.test(body)) die("[Unreleased] has no lines — a release with nothing to say is not a release; write the changelog with the change (P5)");
  changelog = changelog.replace(m[0], `## [Unreleased]\n\n---\n\n${newHeading}\n\n${body}\n\n`);
}

// ── 5 · show, or write ─────────────────────────────────────────────────────
console.log(`[release] ${version} from ${head.slice(0, 7)} — ${newHeading}`);
if (floorsHere.length) console.log(`  · this release is a ROLLBACK FLOOR (${floorsHere.join(", ")}): nothing older can be promoted again`);
if (cmp(version, pkg.version) > 0) console.log(`  · package.json ${pkg.version} → ${version}`);
if (dryRun) { console.log("  · dry run — nothing written"); process.exit(0); }

writeFileSync("CHANGELOG.md", changelog);
if (cmp(version, pkg.version) > 0) {
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

// ── 6 · the gate confirms ──────────────────────────────────────────────────
try { sh("node scripts/check-release.mjs"); }
catch { sh("git checkout -- CHANGELOG.md package.json"); die("check-release rejected the cut — reverted"); }

// ── 7 · commit, tag, push ──────────────────────────────────────────────────
sh(`git commit -qam "Release ${version}"`);
sh(`git tag -a v${version} -m "Release ${version} — ${newHeading.slice(3)}"`);
sh(`git push -q origin main v${version}`);
console.log(`[release] tagged v${version} and pushed. Next: npm run promote -- v${version}`);
