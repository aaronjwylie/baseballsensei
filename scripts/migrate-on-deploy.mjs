/**
 * Apply pending migrations as part of a deploy.
 *
 * We shipped code whose schema hadn't landed and took the site down with it
 * (2026-08-02). The gap between "push" and "someone remembers to migrate" is
 * an outage, and it will keep being one for as long as it depends on
 * remembering.
 *
 * ## Why this fails the build rather than warning
 *
 * A build that can't migrate must not produce a deploy. The alternative is
 * fresh code live against an old schema, every request erroring. Failing here
 * leaves the previous deploy serving — Vercel keeps the last good build live
 * when a new one fails.
 *
 * ## Which builds migrate — the rung decides
 *
 * A build migrates the database it is pointed at, so it may only run where
 * the environment OWNS that database (_ReleaseLaw P6). Two signals say so:
 *
 *   - `VERCEL_ENV=production` — the production branch of a project, which is
 *     the live site on the `baseball-sensei` project and `main` on the
 *     staging project. Each has its own database. Always migrates.
 *   - `VERCEL_ENV=preview` **and** `RUNG=qa` — a PR preview on a project whose
 *     Preview environment carries the qa database. Migrates.
 *
 * A preview with no `RUNG` is skipped. Until 2026-09-10 previews shared the
 * production database, and a branch carrying a migration nobody had agreed to
 * would have applied it to live data the moment a pull request opened; the
 * skip was the guard. `RUNG=qa` is set only in a Preview environment that has
 * its own database (OPERATIONS §16, Phase 1), so the guard now has a key
 * instead of being permanent.
 *
 * ## The backward direction — a warning, not a gate
 *
 * A rollback builds an OLDER journal against a database that has moved on.
 * `drizzle-kit migrate` is a no-op then (nothing pending), which is correct
 * when every newer migration only expanded the schema — and an outage when
 * one of them contracted it. This script cannot tell which: the migrations
 * it has never heard of are exactly the ones it cannot classify. So it
 * WARNS loudly when the database is ahead, and the refusal lives in
 * `scripts/promote.mjs`, which has both commits and reads floors.json at the
 * newer one. Production only moves through promote, so the gate is upstream
 * of this script rather than inside it.
 *
 * ## Why it's safe to run on every build
 *
 * `drizzle-kit migrate` is journal-tracked and idempotent — a redeploy with
 * no new migrations is a no-op. Running it every time is what makes it
 * reliable; running it only "when needed" reintroduces the judgement call
 * this exists to remove.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const vercelEnv = process.env.VERCEL_ENV;
const rung = process.env.RUNG;
const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;

// Local `npm run build` has no VERCEL_ENV. Developers migrate deliberately
// (`npm run db:migrate`); a build shouldn't reach into their database.
if (!vercelEnv) {
  console.log("[migrate] not a Vercel build — skipping (use npm run db:migrate)");
  process.exit(0);
}

const owns = vercelEnv === "production" || (vercelEnv === "preview" && rung === "qa");
if (!owns) {
  console.log(
    `[migrate] ${vercelEnv} deploy with RUNG=${rung ?? "(unset)"} — skipping; a build migrates only a database its rung owns (set RUNG=qa in a Preview environment that has one)`,
  );
  process.exit(0);
}

if (!url) {
  // A build with no database is misconfigured, and shipping it would only
  // move the failure to the first request.
  console.error(`[migrate] ${vercelEnv} build with no database URL — refusing to build`);
  process.exit(1);
}

// Is the database ahead of this build's journal? Only a rollback does that.
try {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, prepare: false });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const lastKnown = journal.entries.at(-1)?.when ?? 0;
  const [{ ahead }] = await sql`
    select count(*)::int as ahead from drizzle.__drizzle_migrations where created_at > ${lastKnown}
  `.catch(() => [{ ahead: 0 }]);
  await sql.end();
  if (ahead > 0) {
    console.warn(
      `[migrate] ⚠ the database is ${ahead} migration(s) AHEAD of this build's journal — this is a rollback. ` +
        `It is safe only if every newer migration expanded the schema; promote.mjs checks floors.json for that. ` +
        `If you got here another way, stop and read _ReleaseDocumentation §1d.`,
    );
  }
} catch (error) {
  console.warn(`[migrate] could not compare the journal with the database (${error?.message ?? error}) — continuing`);
}

console.log(`[migrate] ${vercelEnv}${rung ? ` (${rung})` : ""} deploy — applying pending migrations`);
const result = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit", env: process.env });

if (result.status !== 0) {
  console.error("[migrate] migration failed — failing the build so the current deploy keeps serving");
  process.exit(result.status ?? 1);
}

console.log("[migrate] schema is up to date");
