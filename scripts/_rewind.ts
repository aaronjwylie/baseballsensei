/**
 * Put the 8.9.1 fixture back at `awaiting_approval` so the admin panel's own
 * Approve sends a real ⑥ — a token minted by production, which is the only
 * place that can mint one. AUTH_SECRET is a Vercel "sensitive" variable and is
 * unreadable by anyone, including us. That is the point of it.
 */
import { db } from "@/shared/db";
import { sql } from "drizzle-orm";
import { updateSubmission } from "@/domains/submission";
async function main() {
  const [s] = await db.execute(sql`
    select id from submission where player_name = 'QA 8.9.1 row shape'`);
  await updateSubmission(String(s!.id), {
    status: "awaiting_approval",
    completedAt: null,
    feedbackEmailedAt: null,
    customerFileSet: null,
  });
  const [after] = await db.execute(sql`
    select status, feedback_emailed_at from submission where id = ${s!.id}`);
  console.log(`  ${String(s!.id).slice(0,8)}  status=${after!.status}  feedbackEmailedAt=${after!.feedback_emailed_at ?? "null"}`);
  process.exit(0);
}
main();
