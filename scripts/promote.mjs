#!/usr/bin/env node
/**
 * promote — move a release to production, or back (_ReleaseLaw P9–P11;
 * _ReleaseDocumentation §1c–§1d).
 *
 *   npm run promote -- v1.2.0                     production ← v1.2.0
 *   npm run promote -- v1.1.0                     rollback, if no floor is crossed
 *   npm run promote -- v1.2.0-rc.1 --branch staging-release   rehearse elsewhere
 *   npm run promote -- v1.2.0 --dry-run
 *
 * Production is a branch that only this script moves. Forward is a
 * fast-forward; backward is a forced push — and backward is refused when a
 * migration between the target's schema and production's is a FLOOR (a
 * contraction recorded in drizzle/floors.json at the newer commit),
 * because the older code would read a column that is gone.
 *
 * This is the rollback gate. It lives here rather than in migrate-on-deploy
 * because only this side has both commits: a build of the OLD tag cannot
 * know which of the migrations it has never heard of were floors.
 */
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const tag = argv.find((a) => /^v\d+\.\d+\.\d+(-rc\.\d+)?$/.test(a));
const branch = argv.includes("--branch") ? argv[argv.indexOf("--branch") + 1] : "production";
const dryRun = argv.includes("--dry-run");

const die = (m) => { console.error(`\n[promote] refused — ${m}\n`); process.exit(1); };
const sh = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
const shQuiet = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const fileAt = (ref, path) => { const s = shQuiet(`git show ${ref}:${path}`); return s ? JSON.parse(s) : null; };
const schemaAt = (ref) => fileAt(ref, "drizzle/meta/_journal.json")?.entries.at(-1)?.tag.slice(0, 4) ?? "0000";
const floorsAt = (ref) => fileAt(ref, "drizzle/floors.json")?.floors ?? [];

if (!tag) die("usage: npm run promote -- vX.Y.Z[-rc.N] [--branch production] [--dry-run]");

sh("git fetch -q origin --tags");
if (!shQuiet(`git rev-parse -q --verify refs/tags/${tag}`)) die(`${tag} is not a tag — cut it with npm run release first`);
const target = sh(`git rev-parse ${tag}^{commit}`);
const current = shQuiet(`git rev-parse -q --verify refs/remotes/origin/${branch}`);

const isAncestor = (a, b) => { try { execSync(`git merge-base --is-ancestor ${a} ${b}`, { stdio: "ignore" }); return true; } catch { return false; } };

let direction;
if (!current) direction = "first";
else if (current === target) die(`${branch} is already at ${tag}`);
else if (isAncestor(current, target)) direction = "forward";
else if (isAncestor(target, current)) direction = "backward";
else die(`${tag} and ${branch} have diverged — only releases on the main line can be promoted`);

const targetSchema = schemaAt(target);
const currentSchema = current ? schemaAt(current) : "0000";

if (direction === "backward") {
  // Floors are read at the NEWER commit — it is the one that knows.
  const crossed = floorsAt(current).filter((f) => f.slice(0, 4) > targetSchema && f.slice(0, 4) <= currentSchema);
  if (crossed.length) {
    die(`rolling ${branch} back to ${tag} (schema ${targetSchema}) would cross a floor — ${crossed.join(", ")} contracted the schema and ${tag}'s code would read what is gone. A restore from the snapshot named in that release's Operate section is the only way back.`);
  }
}
if (direction === "forward" || direction === "first") {
  const introduced = floorsAt(target).filter((f) => f.slice(0, 4) > currentSchema && f.slice(0, 4) <= targetSchema);
  if (introduced.length) console.log(`  · ${tag} is a ROLLBACK FLOOR (${introduced.join(", ")}) — after this, ${branch} cannot go back past it. Take the snapshot named in its Operate section first.`);
}

console.log(`[promote] ${branch}: ${current ? current.slice(0, 7) : "(none)"} → ${target.slice(0, 7)} (${tag}) — ${direction}, schema ${currentSchema} → ${targetSchema}`);
if (dryRun) { console.log("  · dry run — nothing pushed"); process.exit(0); }

if (direction === "backward") {
  sh(`git push --force-with-lease=refs/heads/${branch}:${current} origin ${target}:refs/heads/${branch}`);
} else {
  sh(`git push origin ${target}:refs/heads/${branch}`);
}
console.log(`[promote] ${branch} is at ${tag}. Vercel builds it with ${branch}'s own environment; confirm the footer reads ${tag.replace(/^v/, "v")} when it is live.`);
