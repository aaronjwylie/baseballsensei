"use server";
/**
 * Admin-page actions on a submission that don't belong to another domain's
 * verbs. Archiving is the admin filing finished work away, so it lives with the
 * admin page rather than in the submission slice (which imports no other domain,
 * including account/auth). Admin-only — the guard is re-checked here.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/shared/lib/actionResult";
import { requireRole } from "@/domains/account";
import { numberedRungLabel,
  FILE_KINDS,
  FILE_SETS,
  SUBMISSION_STATUSES,
  addSubmissionFile,
  deleteSubmission,
  listFilesByKinds,
  recordSubmissionEvent,
  archiveSubmission,
  deleteSubmissionFile,
  getSubmission,
  getSubmissionFile,
  isPaid,
  isReleased,
  unarchiveSubmission,
  updateSubmission,
  undoneByReset,
  assigneeFor,
  unassignOperator,
  type FileKind,
  type FileSet,
  type SubmissionStatus,
} from "@/domains/submission";
import { approveAndComplete, resolveSubmission } from "@/domains/feedback";
import { getSettings } from "@/domains/settings";
import { storage, folderFileKey } from "@/shared/storage";

export async function archiveSubmissionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const id = String(formData.get("submissionId") ?? "");
  if (!id) return { error: "No submission. Reload and try again." };

  const reason = String(formData.get("reason") ?? "").trim();

  const submission = await getSubmission(id);
  if (!submission) return { error: "That submission no longer exists." };
  if (submission.archivedAt) return { error: "It is already archived." };

  /*
    Archiving anywhere in the pipeline now (Ben, QA 5.6) — a duplicate, a test
    entry, a cancelled or refunded customer can never reach `complete`, and had
    no way out of the queue before. But archiving *finished* work is bookkeeping,
    while archiving a **live** one sets aside a paid customer still owed feedback:
    that is a decision, not tidying, so it must carry a reason. Either way the
    trail records who did it and why, on the current rung, like a status reset —
    and the Archived view badges the owed ones so they can't be mistaken for
    filed-and-done.
  */
  const owed = !isReleased(submission);
  if (owed && !reason) {
    return {
      error:
        "This customer is still owed feedback. Give a reason for setting it aside.",
    };
  }

  await archiveSubmission(id);
  await noteSubmissionAction(
    id,
    submission.status,
    owed
      ? `archived while owed — ${reason}`
      : reason
        ? `archived — ${reason}`
        : "archived",
  );
  revalidatePath("/admin");
  return { ok: true };
}

export async function unarchiveSubmissionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const id = String(formData.get("submissionId") ?? "");
  if (!id) return { error: "No submission. Reload and try again." };

  await unarchiveSubmission(id);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * the admin approves the coach's uploaded feedback: complete the submission and send
 * the customer their download link. Guarded to `awaiting_approval` inside
 * `approveAndComplete`, so it's safe to call from a button.
 */
/**
 * Steps 6–7 and 11–12 — the admin puts a translation back.
 *
 * Both directions are one action because they are one act: the only difference
 * is which folder it lands in, which is the `kind` the caller names. Writing it
 * twice would be two chances to get the retention or the guard wrong.
 *
 * Translations don't count against the customer's upload limit — that limit is a
 * promise about what *they* may send, and the admin's working copies must not eat
 * into it.
 */
export async function uploadToFolderAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const id = String(formData.get("submissionId") ?? "");
  const rawKind = String(formData.get("kind") ?? "");
  if (!id) return { error: "No submission. Reload and try again." };

  /*
    All four folders take uploads (Ben, 2026-08-31). This was restricted to the
    two translation folders on the reasoning that the originals are the
    customer's and the coach's own, and an admin writing to them would destroy
    the record of what was actually submitted.

    Half of that still holds and half of it never did. Adding a file **is not
    overwriting one** — nothing here replaces or removes anything, every upload
    is its own row, and the folder keeps what was already in it. And the cases
    are ordinary: a customer whose upload failed emails the clip instead, a
    coach sends their response by reply rather than through the portal. Refusing
    those means the admin does the work outside the system and the folder is a
    lie either way.

    What the old rule was protecting is worth keeping, so it is kept
    differently: an admin writing into a folder that is somebody else's earns a
    trail row naming the file. The record of who put what where survives, which
    is the thing that actually mattered.
  */
  if (!FILE_KINDS.includes(rawKind as FileKind)) {
    return { error: "That is not one of the four folders." };
  }
  const kind: FileKind = rawKind as FileKind;
  const isSomeoneElses = kind === "intake" || kind === "feedback";

  const submission = await getSubmission(id);
  if (!submission) return { error: "That submission no longer exists." };
  if (!isPaid(submission)) {
    return { error: "Nothing can be attached before the payment clears." };
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { error: "Choose at least one file." };

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const key = folderFileKey(id, kind, file.name);
    const fileUrl = await storage.save(key, bytes, file.type);
    await addSubmissionFile(
      {
        submissionId: id,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: bytes.byteLength,
        fileUrl,
      },
      kind,
    );
    if (isSomeoneElses) {
      // Whose folder this is belongs in the trail, because the folder itself
      // can no longer tell you — a file the admin added and a file the customer
      // uploaded look identical once they are both rows.
      await recordSubmissionEvent(
        id,
        submission.status,
        `Admin uploaded "${file.name}" into the ${kind} folder`,
      );
    }
  }

  /*
    The status follows the folder, and only from the rung that makes sense.

    A translation arriving on a submission that has already moved past its
    translation step is filed without disturbing where it is — the admin adding a
    late copy shouldn't walk a released submission backwards.
  */
  /*
    Accept the upload from either side of the translation.

    `intake_translating` is the rung a submission is *on* while out for
    translation, so it is the ordinary case — and it was the one case this
    refused, because the guard only knew about `assigned`. A late upload onto an
    already-translated submission is filed without disturbing where it is.
  */
  const wasIntake =
    submission.status === "assigned" ||
    submission.status === "intake_translator_assigned" ||
    submission.status === "sent_to_intake_translator" ||
    submission.status === "intake_translating";
  const wasResponse =
    submission.status === "awaiting_approval" ||
    submission.status === "feedback_translator_assigned" ||
    submission.status === "sent_to_feedback_translator" ||
    submission.status === "feedback_translating";

  if (kind === "intake_translation" && wasIntake) {
    await updateSubmission(id, { status: "intake_translated" });
  }
  if (kind === "feedback_translation" && wasResponse) {
    await updateSubmission(id, { status: "feedback_translated" });
  }

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Remove one file from a folder. Admin-only.
 *
 * Removing is not purging, and the difference is what each leaves behind.
 * `purgeFolderAction` used to sit beside this and was retired on 2026-09-03
 * once the folders took a per-file Remove; the distinction it drew is worth
 * keeping, because the retention sweep still draws it.
 *
 * A **purge** keeps the row and drops the bytes, so the folder can still say
 * what was there and `/api/files/[id]` answers 410 rather than 404. That is
 * right for retention: the file existed, it was collected, and it is gone on
 * schedule.
 *
 * A **removal** is the admin saying it should not have been there at all — the
 * wrong take, a duplicate, a file uploaded to the wrong folder. A tombstone for
 * that is noise in a folder someone has to read at a glance, so the row goes
 * too, and the event carries the name instead. Nothing is silently destroyed;
 * it simply stops occupying the working surface.
 *
 * Bytes first, then the row, so a failed storage delete can't strand a row
 * pointing at nothing.
 */
export async function removeFileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const fileId = String(formData.get("fileId") ?? "");
  if (!fileId) return { error: "No file. Reload and try again." };

  const file = await getSubmissionFile(fileId);
  if (!file) return { error: "That file is already gone." };

  const submission = await getSubmission(file.submissionId);
  if (!submission) return { error: "That submission no longer exists." };

  if (file.fileUrl) await storage.remove(file.fileUrl);
  await deleteSubmissionFile(fileId);

  // Loud, like every other override. A folder that lost a file with no
  // explanation is worse than one that still has it.
  await recordSubmissionEvent(
    submission.id,
    submission.status,
    `Admin removed "${file.filename}" from the ${file.kind} folder`,
  );

  revalidatePath("/admin");
  return { ok: true };
}


/**
 * Phase 5 — the last override: delete a submission outright.
 *
 * Below the folder purge and more final than it. A purge takes the *bytes* and
 * keeps the record, so the portal can still say what was sent; this takes the
 * record too — the row, its file rows, and its whole trail. It is for the cases
 * where "still says what was sent" is the wrong answer: scrubbing a test
 * submission, or honouring a delete-my-data request.
 *
 * Gated on typing DELETE, because there is no way back and nothing scheduled
 * will ever undo it. No status restriction — a delete-my-data request is exactly
 * a paid, released submission, so refusing those would defeat the point.
 */
export async function deleteSubmissionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const id = String(formData.get("submissionId") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (!id) return { error: "No submission. Reload and try again." };
  if (confirm !== "DELETE") {
    return {
      error: "Type DELETE to confirm. This removes the submission for good.",
    };
  }

  const submission = await getSubmission(id);
  if (!submission) return { error: "That submission no longer exists." };

  /*
    Bytes first. `deleteSubmission` cascades the file *rows* and the trail on the
    foreign key, but the stored objects live outside the database and have to be
    removed by hand — the same order the discard path uses. A stray object is a
    rounding error on the storage bill; a half-deleted submission still in the
    queue is the real problem, so a failed remove logs and presses on.
  */
  const files = await listFilesByKinds(id, [...FILE_KINDS]);
  for (const file of files) {
    if (!file.fileUrl) continue;
    try {
      await storage.remove(file.fileUrl);
    } catch (err) {
      console.error(`[admin] deleting file ${file.id} failed:`, err);
    }
  }

  await deleteSubmission(id);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Phase 5 — move a submission back to an earlier rung.
 *
 * **The only route backwards, and the answer to "what can be undone".** Not a
 * set of per-stage undo buttons: one general handle an operator can reach for
 * beats eleven specific ones nobody remembers exist. Work the admin won't accept goes
 * back to `in_review`; a mis-picked language set goes back to `assigned`.
 *
 * If the admin isn't satisfied with a coach's work he'll speak to them directly — the
 * system's job is to let him put the submission back where it needs to be, not
 * to model the conversation.
 *
 * **Forward-only rungs are refused.** `purged` cannot be undone, because the
 * bytes are gone; letting the status claim otherwise would make the queue lie
 * about what a customer can still download.
 */
export async function resetStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const id = String(formData.get("submissionId") ?? "");
  const rawStatus = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  /*
    Which line of the step they meant. **Recorded, never enforced** — only the
    rung is stored, because a chain line is derived from the data and has no
    column to set. It earns its place in the note: "back to Assigned" and "back
    to Assigned, at the hand-off" are different intentions, and the second is
    the one worth being able to say afterwards.
  */
  const substep = String(formData.get("substep") ?? "").trim();
  /*
    Every refusal below used to be a bare `return`, which is why this button
    read as broken: the dropdown starts on the current status, so pressing it
    unchanged hit the second guard and did nothing, silently. See
    `shared/lib/actionResult.ts`.
  */
  if (!id) return { error: "No submission. Reload the page and try again." };
  if (!SUBMISSION_STATUSES.includes(rawStatus as SubmissionStatus)) {
    return { error: `“${rawStatus}” is not a status on the ladder.` };
  }
  const status = rawStatus as SubmissionStatus;

  const submission = await getSubmission(id);
  if (!submission) return { error: "That submission no longer exists." };

  if (submission.status === status) {
    return {
      error: `It is already at ${numberedRungLabel(status)}. Pick a different rung to move it back to.`,
    };
  }
  // Nothing may be moved out of `purged`: the files it describes no longer
  // exist, and a status that implies otherwise is worse than no status at all.
  if (submission.status === "purged") {
    return { error: "Purged submissions cannot be moved: the files are gone." };
  }
  // Nor back before payment — that would put a paid submission somewhere the
  // discard path is willing to delete it outright.
  if (!PAID_AT_STATUS_SAFE(status)) {
    return {
      error: `${numberedRungLabel(status)} is before payment, and the discard sweep deletes anything sitting there. Pick a rung from New onward.`,
    };
  }

  /*
    A reset moves the rung *and* drops what the rung no longer supports.

    It used to move only the status, so a submission sent back to the coach went
    on reporting the set the customer was sent, when they collected it, and the
    translator on a leg it was no longer running — every line present-tense, on a
    panel that answers where the submission is now (Ben, 2026-09-04). The history
    is not lost: the trail holds every rung, every hand-off and every collection,
    which is the half of the question it exists to answer.
  */
  const { patch, release } = undoneByReset(status);
  await updateSubmission(
    id,
    { ...patch, status },
    [
      substep ? `reset — resume at “${substep}”` : "reset",
      reason || "by an admin",
    ].join(": "),
  );
  // After the status, so a failure here leaves the rung moved and the assignment
  // standing — visible and fixable — rather than work owed by nobody.
  for (const produces of release) {
    if (await assigneeFor(id, produces)) await unassignOperator(id, produces);
  }
  revalidatePath("/admin");
  return { ok: true };
}

/** A reset may only land on a rung that still counts as paid. */
function PAID_AT_STATUS_SAFE(status: SubmissionStatus): boolean {
  return isPaid({ status });
}

/**
 * Write an event without changing the status — the trail's note-taking mode.
 *
 * Used by the purge, which changes files rather than state but still owes an
 * explanation. Re-recording the current status is the honest shape: nothing
 * moved, and something happened.
 */
async function noteSubmissionAction(
  id: string,
  status: SubmissionStatus,
  note: string,
): Promise<void> {
  await recordSubmissionEvent(id, status, note);
}

/**
 * Step 15 — the admin closes the job.
 *
 * Manual by decision, not by omission: the `collected` status makes the pending
 * work a list he can pull up, which is what the "he'll forget" objection actually
 * needed. Automating it later stays cheap.
 */
export async function resolveSubmissionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const id = String(formData.get("submissionId") ?? "");
  if (!id) return { error: "No submission. Reload and try again." };

  const settings = await getSettings();
  await resolveSubmission(id, settings.retainCollectedDays);
  revalidatePath("/admin");
  return { ok: true };
}

export async function completeSubmissionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const id = String(formData.get("submissionId") ?? "");
  if (!id) return { error: "No submission. Reload and try again." };

  // Same fallback as step 8: an unrecognised choice sends the originals, which
  // are the set that always exists.
  const requested = String(formData.get("fileSet") ?? "original");
  const fileSet: FileSet = FILE_SETS.includes(requested as FileSet)
    ? (requested as FileSet)
    : "original";

  await approveAndComplete(id, fileSet);
  revalidatePath("/admin");
  return { ok: true };
}
