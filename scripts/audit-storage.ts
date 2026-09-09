/**
 * Does storage match the database? (QA 8.9.49, 8.9.50)
 *
 *   npm run audit:storage          -- report
 *   npm run audit:storage -- --fix -- delete objects no row points at
 *
 * Two failure modes, and they are not equally bad:
 *
 * - **A dangling row** — the database points at an object that is gone. The
 *   portal offers a download that 404s, which is a lie to somebody's face.
 * - **An orphan** — an object no row points at. Nobody sees it; it costs money
 *   and it holds a customer's video past the retention window we promised, which
 *   is the part that matters. Deleting a submission's row from SQL rather than
 *   through the app leaves exactly these.
 *
 * Both locator columns are checked, because a coach photo is stored the same way
 * a video is and was audited by nobody: `submission_file.file_url` and
 * `operator_role_grant.image_url`.
 *
 * **Reads `PROD_BLOB_READ_WRITE_TOKEN` first.** A production credential under
 * the name the app reads means `npm run dev` writes to the production store —
 * the same trap `DATABASE_URL` had, and it is how five test files ended up in
 * the live bucket on 2026-09-07.
 */
import "./loadEnv";
import { list, del } from "@vercel/blob";
import { db } from "@/shared/db";
import { sql } from "drizzle-orm";

const token =
  process.env.PROD_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
const fix = process.argv.includes("--fix");

async function main() {
  if (!token) {
    console.error("No blob token. Set PROD_BLOB_READ_WRITE_TOKEN.");
    process.exit(1);
  }

  const objects: { pathname: string; url: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ token, cursor, limit: 1000 });
    objects.push(
      ...page.blobs.map((b) => ({ pathname: b.pathname, url: b.url, size: b.size })),
    );
    cursor = page.cursor;
  } while (cursor);

  const files = await db.execute(
    sql`select file_url from submission_file where file_url is not null`,
  );
  const photos = await db.execute(
    sql`select image_url from operator_role_grant where image_url is not null`,
  );
  const known = new Set<string>();
  for (const r of files) known.add(String(r.file_url));
  for (const r of photos) known.add(String(r.image_url));

  const inStore = new Set(objects.map((o) => o.url));
  const orphans = objects.filter((o) => !known.has(o.url));
  const dangling = [...known].filter((u) => !inStore.has(u));

  console.log(`storage: ${objects.length} objects`);
  console.log(`database: ${known.size} locators (${files.length} files, ${photos.length} photos)`);

  console.log(`\ndangling rows — the database points at nothing: ${dangling.length}`);
  for (const u of dangling) console.log("   ", u);

  console.log(`\norphans — objects no row points at: ${orphans.length}`);
  for (const o of orphans) console.log(`    ${o.pathname}  (${o.size} bytes)`);

  // 8.9.50 — a replaced photo must not leave the old object behind.
  const perCoach = new Map<string, string[]>();
  for (const o of objects) {
    if (!o.pathname.startsWith("coaches/")) continue;
    const id = o.pathname.split("/")[1]!;
    perCoach.set(id, [...(perCoach.get(id) ?? []), o.pathname]);
  }
  const stale = [...perCoach].filter(([, paths]) => paths.length > 1);
  console.log(`\ncoaches with more than one photo object: ${stale.length}`);
  for (const [id, paths] of stale) console.log(`    ${id}: ${paths.length}`);

  if (fix && orphans.length) {
    for (const o of orphans) {
      await del(o.url, { token });
      console.log("removed", o.pathname);
    }
  } else if (orphans.length) {
    console.log("\nRun with --fix to delete the orphans.");
  }

  const clean = dangling.length === 0 && orphans.length === 0 && stale.length === 0;
  console.log(`\n${clean ? "clean — storage matches the database" : "MISMATCH"}`);
  process.exit(clean ? 0 : 1);
}
main();
