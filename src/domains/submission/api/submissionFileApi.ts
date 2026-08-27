/**
 * Files attached to a submission — everything the app does to the
 * `submission_files` table.
 *
 * The table holds **four kinds** (the four folders), kept apart by the `kind`
 * column — `intake` and `intake_translation` for what the customer sent,
 * `response` and `feedback_translation` for what the coach wrote back. Every
 * read here is scoped to one side, so the two never bleed together.
 *
 * **Reads scope by *side*, not by a single kind.** "The customer's files" means
 * the originals *and* their translation, because a translation sits beside its
 * original rather than replacing it. `INTAKE_KINDS` / `FEEDBACK_KINDS` carry
 * that, so adding a fifth kind can't silently fall out of a query.
 *
 * ⚠️ Retention: today the sweep empties intake files only. The settled northstar
 * is that **everything is swept together** — safe because the clock cannot start
 * until the customer has collected. That lands with Phase 6 of the rollout plan;
 * until then this file's behaviour is the old rule.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/shared/db";
import { submissionFileTable } from "../model/submissionFileTable";
import { submissionTable } from "../model/submissionTable";
import {
  INTAKE_KINDS,
  FEEDBACK_KINDS,
  type FileKind,
  type NewSubmissionFile,
  type SubmissionFile,
} from "../model/submissionFile";
import { fromFileRow } from "./submissionRow";

export async function addSubmissionFile(
  input: NewSubmissionFile,
  kind: FileKind = "intake",
): Promise<SubmissionFile> {
  const [row] = await db
    .insert(submissionFileTable)
    .values({
      submissionId: input.submissionId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      fileUrl: input.fileUrl,
      kind,
    })
    .returning();
  return fromFileRow(row);
}

/**
 * Insert one intake file, but only while the submission is under its file
 * limit — atomically, so a concurrent burst can't beat the count.
 *
 * `authorizeUpload` counts, then the route inserts. That check-then-act let a
 * client fire N `/complete` calls at once: each read the same `used` count, each
 * passed, and all N rows landed, sailing past `maxFilesPerSubmission`. Here the
 * count and the insert happen under a row lock on the submission, so uploads to
 * the same submission serialise and the (N+1)th sees the real count and is
 * refused. Returns `null` when the limit is already reached. Intake only — the
 * limit is a promise about what the *customer* may send.
 */
export async function addIntakeFileWithinLimit(
  input: NewSubmissionFile,
  maxFiles: number,
): Promise<SubmissionFile | null> {
  return db.transaction(async (tx) => {
    // Lock the submission row so two concurrent uploads for it can't both pass
    // the count below — the loser waits here, then re-reads the true count.
    await tx
      .select({ id: submissionTable.id })
      .from(submissionTable)
      .where(eq(submissionTable.id, input.submissionId))
      .for("update");

    const existing = await tx
      .select({ id: submissionFileTable.id })
      .from(submissionFileTable)
      .where(
        and(
          eq(submissionFileTable.submissionId, input.submissionId),
          eq(submissionFileTable.kind, "intake"),
        ),
      );
    if (existing.length >= maxFiles) return null;

    const [row] = await tx
      .insert(submissionFileTable)
      .values({
        submissionId: input.submissionId,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        fileUrl: input.fileUrl,
        kind: "intake",
      })
      .returning();
    return fromFileRow(row);
  });
}

/** One submission's intake files — originals and translations — oldest first. */
export async function listSubmissionFiles(
  submissionId: string,
): Promise<SubmissionFile[]> {
  const rows = await db
    .select()
    .from(submissionFileTable)
    .where(
      and(
        eq(submissionFileTable.submissionId, submissionId),
        inArray(submissionFileTable.kind, INTAKE_KINDS),
      ),
    )
    .orderBy(asc(submissionFileTable.uploadedAt));
  return rows.map(fromFileRow);
}

/** One submission's response files — the coach's, translated or not. */
export async function listFeedbackFiles(
  submissionId: string,
): Promise<SubmissionFile[]> {
  const rows = await db
    .select()
    .from(submissionFileTable)
    .where(
      and(
        eq(submissionFileTable.submissionId, submissionId),
        inArray(submissionFileTable.kind, FEEDBACK_KINDS),
      ),
    )
    .orderBy(asc(submissionFileTable.uploadedAt));
  return rows.map(fromFileRow);
}

/**
 * Intake files for several submissions at once — the portal's read. One query
 * for a whole page; the caller groups by `submissionId`.
 */
export async function listFilesForSubmissions(
  submissionIds: string[],
): Promise<Map<string, SubmissionFile[]>> {
  const grouped = new Map<string, SubmissionFile[]>();
  if (submissionIds.length === 0) return grouped;

  const rows = await db
    .select()
    .from(submissionFileTable)
    .where(
      and(
        inArray(submissionFileTable.submissionId, submissionIds),
        inArray(submissionFileTable.kind, INTAKE_KINDS),
      ),
    )
    .orderBy(asc(submissionFileTable.uploadedAt));

  for (const row of rows) {
    const file = fromFileRow(row);
    const existing = grouped.get(file.submissionId);
    if (existing) existing.push(file);
    else grouped.set(file.submissionId, [file]);
  }
  return grouped;
}

/**
 * The files that make up one language set — the read behind both hand-offs.
 *
 * Takes kinds rather than a set + side so the *decision* stays in
 * `kindsForSet`: this is the query, not the policy. An empty list returns
 * nothing rather than everything, which is the safer way round for a function
 * whose output gets emailed to someone.
 */
export async function listFilesByKinds(
  submissionId: string,
  kinds: readonly FileKind[],
): Promise<SubmissionFile[]> {
  if (kinds.length === 0) return [];
  const rows = await db
    .select()
    .from(submissionFileTable)
    .where(
      and(
        eq(submissionFileTable.submissionId, submissionId),
        inArray(submissionFileTable.kind, kinds),
      ),
    )
    .orderBy(asc(submissionFileTable.uploadedAt));
  return rows.map(fromFileRow);
}

/**
 * Every file on a submission, grouped by kind — the admin's four folders.
 *
 * One query rather than four, and the map always has all four keys so the UI can
 * render an empty folder without deciding whether "missing" and "empty" differ.
 */
export async function listFilesByFolder(
  submissionId: string,
): Promise<Record<FileKind, SubmissionFile[]>> {
  const rows = await db
    .select()
    .from(submissionFileTable)
    .where(eq(submissionFileTable.submissionId, submissionId))
    .orderBy(asc(submissionFileTable.uploadedAt));

  const folders = {
    intake: [],
    intake_translation: [],
    feedback: [],
    feedback_translation: [],
  } as Record<FileKind, SubmissionFile[]>;

  for (const row of rows) {
    const file = fromFileRow(row);
    folders[file.kind].push(file);
  }
  return folders;
}

/** Every file on a submission, whatever folder — the purge's read. */
export async function listAllSubmissionFiles(
  submissionId: string,
): Promise<SubmissionFile[]> {
  const rows = await db
    .select()
    .from(submissionFileTable)
    .where(eq(submissionFileTable.submissionId, submissionId))
    .orderBy(asc(submissionFileTable.uploadedAt));
  return rows.map(fromFileRow);
}

/**
 * Forget every locator on a submission, keeping every record.
 *
 * The settled rule is that **everything is swept together** — the coach's
 * response included — which is only safe because the clock cannot start until
 * the customer has collected. The narrower `clearFileLocators` remains for the
 * abandoned path, where only intake exists anyway.
 */
export async function clearAllFileLocators(
  submissionId: string,
): Promise<void> {
  await db
    .update(submissionFileTable)
    .set({ fileUrl: null })
    .where(eq(submissionFileTable.submissionId, submissionId));
}

export async function getSubmissionFile(
  id: string,
): Promise<SubmissionFile | null> {
  const [row] = await db
    .select()
    .from(submissionFileTable)
    .where(eq(submissionFileTable.id, id))
    .limit(1);
  return row ? fromFileRow(row) : null;
}

/**
 * How many files the customer has attached — checked against the upload limit.
 *
 * Counts `intake` only, not its translation: the limit is a promise to the
 * customer about what *they* may send, and the admin's translations must not eat into
 * it.
 */
export async function countSubmissionFiles(
  submissionId: string,
): Promise<number> {
  const rows = await db
    .select({ id: submissionFileTable.id })
    .from(submissionFileTable)
    .where(
      and(
        eq(submissionFileTable.submissionId, submissionId),
        eq(submissionFileTable.kind, "intake"),
      ),
    );
  return rows.length;
}

/**
 * Forget the bytes, keep the record — the retention sweep, once the storage
 * object is gone.
 *
 * ⚠️ Intake only, for now. Phase 6 widens this to every kind.
 */
export async function clearFileLocators(submissionId: string): Promise<void> {
  await db
    .update(submissionFileTable)
    .set({ fileUrl: null })
    .where(
      and(
        eq(submissionFileTable.submissionId, submissionId),
        inArray(submissionFileTable.kind, INTAKE_KINDS),
      ),
    );
}

/**
 * Forget one file's bytes, keeping its record — the operator's manual purge.
 *
 * The single-file counterpart to `clearFileLocators`. Same shape deliberately:
 * a purged file is a row with no locator, whether a person or a schedule did it,
 * so `/api/files/[id]` answers 410 either way and nothing downstream has to know
 * which.
 */
export async function clearFileLocator(fileId: string): Promise<void> {
  await db
    .update(submissionFileTable)
    .set({ fileUrl: null })
    .where(eq(submissionFileTable.id, fileId));
}

/** Drop a file record outright — used when an upload half-completes. */
export async function deleteSubmissionFile(id: string): Promise<void> {
  await db.delete(submissionFileTable).where(eq(submissionFileTable.id, id));
}
