#!/usr/bin/env node
/**
 * check-release — the release gate (_ReleaseLaw P12).
 *
 * A version string is a well-typed string. `package.json` read `"version":
 * "0.1.0"` on a production system for six weeks and nothing could object; a
 * changelog is a valid markdown file whether or not it mentions the version
 * that shipped; a rollback across a dropped column is a git push like any
 * other. Every other gate is green while all three are wrong. This one asks
 * the release to answer for itself, from the tag alone, with no one who
 * remembers.
 *
 * Five checks:
 *
 *   1. VERSION    package.json is the one home; any `v*` tag on HEAD equals it
 *                 (an `-rc.N` suffix allowed)
 *   2. CHANGELOG  CHANGELOG.md has a `## [<version>]` heading, and that heading
 *                 names the schema head it was built against:
 *                   ## [1.2.0] — 2026-10-01 · schema 0031[ · floor]
 *   3. SCHEMA     the heading's schema equals the migration journal's head;
 *                 `· floor` is present iff drizzle/meta/floors.json names a
 *                 migration newer than the previous release's schema
 *   4. FLOORS     every floor names a migration that exists
 *   5. OPERATE    every variable added to .env.example since the last tag is
 *                 named in the changelog (a release whose deploy needs a hand
 *                 says so — P5). Skipped with a note until a tag exists.
 *
 * Runs first in `npm run build` and in CI's static job. Vacuity floor: a
 * changelog with no version heading, or an empty journal, is a failure.
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const findings = [];
const notes = [];
const fail = (m) => findings.push(m);
const git = (cmd) => {
  try { return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
};

// ── 1 · VERSION ────────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail(`package.json version "${version}" is not X.Y.Z`);
if (pkg.name === "dev") fail('package.json name is "dev" — name the product');

const headTags = git("tag --points-at HEAD").split("\n").filter((t) => /^v/.test(t));
for (const tag of headTags) {
  if (!new RegExp(`^v${version.replace(/\./g, "\\.")}(-rc\\.\\d+)?$`).test(tag)) {
    fail(`HEAD carries tag ${tag} but package.json says ${version} — the two homes disagree`);
  }
}

// ── 2 · CHANGELOG ──────────────────────────────────────────────────────────
if (!existsSync("CHANGELOG.md")) fail("no CHANGELOG.md");
const changelog = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8") : "";
const HEADING = /^## \[(\d+\.\d+\.\d+)\](.*)$/gm;
const sections = [...changelog.matchAll(HEADING)].map((m) => ({
  version: m[1],
  rest: m[2],
  schema: m[2].match(/schema (\d{4})/)?.[1] ?? null,
  floor: /·\s*floor\b/.test(m[2]),
  start: m.index,
}));
if (!sections.length) fail("CHANGELOG.md has no `## [X.Y.Z]` heading — vacuity");
const current = sections.find((s) => s.version === version);
if (!current) fail(`CHANGELOG.md has no section for [${version}]`);
else if (!current.schema) fail(`CHANGELOG.md [${version}] heading names no schema head — expected "· schema NNNN"`);

const sectionBody = (s) => {
  const i = sections.indexOf(s);
  const end = i + 1 < sections.length ? sections[i + 1].start : changelog.length;
  return changelog.slice(s.start, end);
};

// ── 3 · SCHEMA ─────────────────────────────────────────────────────────────
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const entries = journal.entries ?? [];
if (!entries.length) fail("drizzle/meta/_journal.json has no entries — vacuity");
const head = entries.at(-1)?.tag ?? "";
const headIdx = head.slice(0, 4);
if (current?.schema && current.schema !== headIdx) {
  fail(`CHANGELOG.md [${version}] says schema ${current.schema}; the journal head is ${head}`);
}

// ── 4 · FLOORS ─────────────────────────────────────────────────────────────
const floorsFile = "drizzle/meta/floors.json";
const floors = existsSync(floorsFile) ? JSON.parse(readFileSync(floorsFile, "utf8")).floors ?? [] : [];
const tags = new Set(entries.map((e) => e.tag));
for (const f of floors) if (!tags.has(f)) fail(`floors.json names ${f}, which is not in the journal`);

if (current?.schema) {
  const i = sections.indexOf(current);
  const previousSchema = sections[i + 1]?.schema ?? "0000";
  const floorsInRelease = floors.filter((f) => f.slice(0, 4) > previousSchema && f.slice(0, 4) <= current.schema);
  if (floorsInRelease.length && !current.floor) {
    fail(`[${version}] carries a contracting migration (${floorsInRelease.join(", ")}) but its heading lacks "· floor"`);
  }
  if (!floorsInRelease.length && current.floor) {
    fail(`[${version}] heading says "· floor" but floors.json names nothing between ${previousSchema} and ${current.schema}`);
  }
}

// ── 5 · OPERATE ────────────────────────────────────────────────────────────
const lastTag = git("describe --tags --abbrev=0 --match 'v*'");
if (!lastTag) {
  notes.push("no v* tag yet — the .env.example-vs-changelog check starts with the first tag");
} else {
  const added = git(`diff ${lastTag} HEAD -- .env.example`)
    .split("\n")
    .filter((l) => /^\+[A-Z][A-Z0-9_]*=/.test(l))
    .map((l) => l.slice(1).split("=")[0]);
  const scope = (current ? sectionBody(current) : "") + (changelog.split(/^## \[Unreleased\]/m)[1]?.split(/^## \[/m)[0] ?? "");
  for (const name of added) {
    if (!scope.includes(name)) fail(`.env.example gained ${name} since ${lastTag} and the changelog does not name it — a deploy that needs a hand says so under Operate`);
  }
  const ahead = Number(git(`rev-list ${lastTag}..HEAD --count`) || 0);
  const unreleased = changelog.split(/^## \[Unreleased\]/m)[1]?.split(/^## \[/m)[0] ?? "";
  if (ahead > 0 && !/^- /m.test(unreleased)) {
    notes.push(`${ahead} commit(s) since ${lastTag} and [Unreleased] has no line — write it with the change (P5)`);
  }
}

// ── report ─────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  · ${n}`);
if (findings.length) {
  console.error(`\n[release] ${findings.length} problem${findings.length === 1 ? "" : "s"}:\n`);
  for (const f of findings) console.error(`  ${f}`);
  console.error("");
  process.exit(1);
}
console.log(`[release] ok — v${version}, schema ${head}, ${floors.length} floor${floors.length === 1 ? "" : "s"}${headTags.length ? `, tagged ${headTags.join(" ")}` : ""}`);
