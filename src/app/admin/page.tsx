import type { Metadata } from "next";
import { Container, LocalTime, pillClass } from "@/shared/ui";
import { FLOW_WINDOW_MINUTES } from "@/shared/lib";
import {
  listFeedbackFilesForSubmissions,
  listFilesForSubmissions,
  listSubmissions,
  SubmissionFileList,
  type Submission,
  type SubmissionFile,
  type SubmissionStatus,
  isReleased,
  awaitsTranslationDecision,
  availableSets,
  listFoldersForSubmissions,
  type FileKind,
  isPaid,
  listProgressFacts,
  describeStage,
  listEventsForSubmissions,
  type SubmissionEvent,
  whoseCourt,
  needsTranslation,
  requiredDirection,
  describeDirection,
  RUNG_LABEL,
} from "@/domains/submission";
import { listCoaches, listTranslators, notifyCoachAction, sendForTranslationAction, AssignCoachSelect, AssignTranslatorSelect, type OperatorProfile } from "@/domains/operator";
import { requireRole } from "@/domains/account";
import { RowActionForm } from "./RowActionForm";
import { SendWithFileSet } from "./SendWithFileSet";
import { FileFolders } from "./FileFolders";
import { OperatorOverride } from "./OperatorOverride";
import { QueueRow } from "./QueueRow";
import { QueueTabs } from "./QueueTabs";
import {
  archiveSubmissionAction,
  completeSubmissionAction,
  deleteSubmissionAction,
  purgeFolderAction,
  resetStatusAction,
  resolveSubmissionAction,
  removeFileAction,
  uploadToFolderAction,
  unarchiveSubmissionAction,
} from "./adminActions";

export const metadata: Metadata = {
  title: "Admin: Submissions",
  robots: { index: false },
};

/**
 * The queue only ever holds paid submissions (`listSubmissions` filters the
 * pre-payment states out), but the map is exhaustive so a new status can't be
 * added without deciding how the portal shows it.
 */
/**
 * The filter tabs above the table — "all" plus one per status the queue can
 * actually contain, then "Archived".
 *
 * Archiving is a separate dimension from status: an archived submission still
 * sits somewhere on the ladder, so every non-archived tab (including "All")
 * excludes it, and only "Archived" shows it. There is no "awaiting upload" tab —
 * files arrive before payment, so that state no longer exists.
 *
 * **Not one tab per rung.** Sixteen tabs would be a worse queue than seven; a
 * tab earns its place by answering "what needs me?", which is why the translation
 * rungs are folded into their neighbours and `sent_to_coach` gets its own — it's
 * the one that means *chase somebody*.
 */
/*
  Tabs are named from `RUNG_LABEL`, never from a string typed here.

  They carried their own vocabulary once — "Not picked up", "In review", "Coach
  submitted" — which read fine until the rungs were renamed and the two sets
  drifted apart in the same view. The worst of it: a tab called "Sent" filtered
  everything *released*, while the rung newly called "Sent" means handed to the
  coach, which that tab excludes.

  A tab spanning several rungs takes the name of the one it's about — "Assigned"
  covers the two translation rungs too, because that is still where the
  submission is.
*/
const TABS: { key: string; label: string; match: (s: Submission) => boolean }[] = [
  { key: "all", label: "All", match: (s) => !s.archivedAt },
  {
    key: "unpaid",
    label: "In progress",
    /*
      Someone filling in the form right now, or stalled before paying.

      Its own tab rather than hidden: at this volume a live attempt is the most
      interesting thing on the page, and during a test run a queue that shows
      nothing until money moves is a queue you can't follow. They clear
      themselves — the abandonment sweep deletes them outright — so nothing
      accumulates here.
    */
    match: (s) => !isPaid(s) && !s.archivedAt,
  },
  { key: "new", label: RUNG_LABEL.new, match: (s) => s.status === "new" && !s.archivedAt },
  {
    key: "assigned",
    label: RUNG_LABEL.assigned,
    // Assignment through translation — the coach has it on their desk but
    // hasn't been handed anything yet.
    match: (s) =>
      (s.status === "assigned" ||
        s.status === "intake_translator_assigned" ||
        s.status === "sent_to_intake_translator" ||
        s.status === "intake_translating" ||
        s.status === "intake_translated") &&
      !s.archivedAt,
  },
  {
    key: "sent_to_coach",
    label: RUNG_LABEL.sent_to_coach,
    // The row that means someone is waiting on a person. Its own tab because
    // that's the whole reason the rung exists.
    match: (s) => s.status === "sent_to_coach" && !s.archivedAt,
  },
  { key: "in_review", label: RUNG_LABEL.in_review, match: (s) => s.status === "in_review" && !s.archivedAt },
  {
    key: "awaiting_approval",
    label: RUNG_LABEL.awaiting_approval,
    // Delivered, plus the response-translation pair — all of it is waiting on
    // the admin and none of it has reached the customer.
    match: (s) =>
      (s.status === "awaiting_approval" ||
        s.status === "feedback_translator_assigned" ||
        s.status === "sent_to_feedback_translator" ||
        s.status === "feedback_translating" ||
        s.status === "feedback_translated") &&
      !s.archivedAt,
  },
  {
    key: "complete",
    label: RUNG_LABEL.complete,
    // Everything released, whether or not the customer has collected it yet.
    match: (s) => isReleased(s) && !s.archivedAt,
  },
  { key: "archived", label: "Archived", match: (s) => !!s.archivedAt },
];

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole("admin");
  const { status } = await searchParams;
  const [all, coaches, translators] = await Promise.all([
    listSubmissions(),
    listCoaches(),
    listTranslators(),
  ]);

  const initialKey = TABS.some((t) => t.key === status) ? status! : "all";

  /*
    Every per-row read the queue needs, each batched into ONE query for the page,
    over EVERY row — the filter is client-side now (QA 5.2), so the server hands
    the whole queue over once and the browser narrows it.

    This is the page the admin lives on, and it was fanning out ~three queries
    per submission — the folders, the trail, and the feedback files, a round trip
    each per row — so the queue grew linearly with the business (QA 5.1). Two of
    these reads were already batched; the other three now have batched siblings
    (`inArray` + group in memory) that leave the per-row versions for the detail
    page. The five run in parallel — they answer different questions and none
    depends on another.
  */
  const ids = all.map((s) => s.id);
  const [
    filesBySubmission,
    foldersBySubmission,
    progressBySubmission,
    eventsBySubmission,
    feedbackBySubmission,
  ] = await Promise.all([
    listFilesForSubmissions(ids),
    listFoldersForSubmissions(ids),
    listProgressFacts(ids),
    listEventsForSubmissions(ids),
    listFeedbackFilesForSubmissions(ids),
  ]);

  /*
    Every row, tagged with the tabs it belongs to, so the browser filters with a
    membership test rather than a second copy of the match rules (QA 5.2). The
    counts come off the same predicates, so a tab and its rows can't disagree.
  */
  const tabs = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count: all.filter(t.match).length,
  }));
  const rows = all.map((s) => ({
    id: s.id,
    tabKeys: TABS.filter((t) => t.match(s)).map((t) => t.key),
    node: (
      <SubmissionRow
        submission={s}
        translators={translators}
        files={filesBySubmission.get(s.id) ?? []}
        feedbackFiles={feedbackBySubmission.get(s.id) ?? []}
        folders={foldersBySubmission.get(s.id)}
        progress={progressBySubmission.get(s.id)}
        events={eventsBySubmission.get(s.id) ?? []}
        coaches={coaches}
      />
    ),
  }));

  return (
    <Container>
      <div>
        <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">Submissions</h1>
        <p className="mt-1 text-sm text-ink-muted">{`${all.length} total · the coaching queue`}</p>
      </div>

      <QueueTabs tabs={tabs} initialKey={initialKey} rows={rows} />
    </Container>
  );
}

/**
 * One submission, as the queue shows it.
 *
 * A server component that assembles everything and hands it to `QueueRow`,
 * which owns only the open/closed state. The controls are passed as nodes
 * because they're bound to Server Actions — the row shouldn't know which.
 */
function SubmissionRow({
  submission,
  files,
  feedbackFiles,
  folders,
  progress,
  events,
  coaches,
  translators,
}: {
  submission: Submission;
  files: SubmissionFile[];
  feedbackFiles: SubmissionFile[];
  folders?: Record<FileKind, SubmissionFile[]>;
  progress?: {
    reached: Set<SubmissionStatus>;
    emails: Map<string, boolean>;
    assignees: Partial<Record<FileKind, string>>;
  };
  events: SubmissionEvent[];
  coaches: OperatorProfile[];
  translators: OperatorProfile[];
}) {
  const assignedCoachId = progress?.assignees.feedback;
  const assignedCoach = coaches.find((c) => c.id === assignedCoachId);
  const empty: Record<FileKind, SubmissionFile[]> = {
    intake: [], intake_translation: [], feedback: [], feedback_translation: [],
  };
  const folderMap = folders ?? empty;

  /*
    What each hand-off may offer, derived from what actually exists.

    `availableSets` returns a single entry when there's no translation, which is
    the common case — `SendWithFileSet` then renders the button with no radio at
    all, rather than a question with one answer.
  */
  const present = (Object.keys(folderMap) as FileKind[]).filter((k) => folderMap[k].length > 0);
  const intakeSets = availableSets(present.filter((k) => k === "intake" || k === "intake_translation"));
  const responseSets = availableSets(present.filter((k) => k === "feedback" || k === "feedback_translation"));

  // The intake question: could the customer have sent files this coach can't
  // read? True when the customer declares a language the coach doesn't — no
  // overlap, or a bilingual customer against a monolingual coach (QA 5.9). Null
  // when either side hasn't declared.
  const wantsTranslation = needsTranslation(
    submission.languages,
    assignedCoach?.languages,
  );

  /*
    The way each leg must run, when it needs one — the same derivation the gate
    makes, kept as the pair so the picker offers only translators who cover it
    (QA 5.9). The legs run OPPOSITE ways, so they are computed separately: intake
    is the customer's files → the coach, response is the coach's feedback → the
    customer. Null when the leg needs no translation, or a side is undeclared.
  */
  const intakeDirection = requiredDirection(
    submission.languages,
    assignedCoach?.languages,
  );
  const responseDirection = requiredDirection(
    assignedCoach?.languages,
    submission.languages,
  );

  /*
    The routing decision in words, for the detail panel (Ben, QA 5.9.13). The
    panel used to show the two inputs and leave the conclusion to the reader; the
    code already reached it, so it prints it — and the "cannot tell" state names
    the blank side rather than passing as aligned, which is where an admin would
    notice a coach's grant was never filled in. Derived from the same directions
    the gate and picker use, never a second comparison.
  */
  const alignmentLine = !assignedCoach
    ? null
    : (submission.languages?.length ?? 0) === 0
      ? "The customer didn't declare a language. Translation can't be assessed."
      : assignedCoach.languages.length === 0
        ? "The coach has no languages recorded. Translation can't be assessed."
        : intakeDirection || responseDirection
          ? `Linguistic non-alignment. Route through translator (${[
              intakeDirection && `${describeDirection(intakeDirection)} for the client files`,
              responseDirection && `${describeDirection(responseDirection)} for the response`,
            ]
              .filter(Boolean)
              .join(", ")}).`
          : "Linguistic alignment. The coach handles this directly.";

  /*
    The gate fired, but the two DO share a language — the bilingual-source case,
    where translating is a recommendation rather than a certainty (Ben, QA 5.9.5,
    option B). The files might already be in the shared language, and only the
    outstanding line carries a control, so a hard gate would strand the admin on
    a translator they may not need. When they share a language we keep the skip
    available beside the picker; a no-overlap gate stays hard, because there is
    nothing the target could read to hand over.
  */
  const sharesLanguage =
    !!assignedCoach &&
    (submission.languages ?? []).some((a) =>
      assignedCoach.languages.some(
        (b) => a.trim().toLowerCase() === b.trim().toLowerCase(),
      ),
    );

  /*
    The hint explains the delay when translation is wanted, or names a missing
    declaration otherwise. It's phrased for both reasons the intake gate fires —
    no shared language, and a bilingual customer whose files might be in the one
    the coach lacks — since "no shared language" would be a lie in the second.

    **Gated on the decision still being open** (Ben, 2026-08-31). Everything
    else here is a comparison of two language sets, which goes true the moment a
    coach is assigned and can never go false again: nothing about a customer's
    languages changes when the work gets done. So a submission that had been
    translated, delivered and *collected* was still flagged "Translate the
    client files first", and the flag out-ranks the outstanding line — so the
    one place the queue says what to do next was permanently occupied by a job
    finished days ago.

    `awaitsTranslationDecision` is the missing half: the languages say whether
    translating is called for, the rung says whether it is still anyone's
    problem.
  */
  const translationHint =
    !assignedCoach || !awaitsTranslationDecision(submission)
      ? null
      : wantsTranslation === true
        ? `Translate the client files first. ${assignedCoach.name} may not read the language they're in.`
        : (submission.languages?.length ?? 0) === 0
          ? "The customer didn't declare a language."
          : null;

  const stage = describeStage(submission, {
    files: {
      intake: folderMap.intake.length,
      intake_translation: folderMap.intake_translation.length,
      feedback: folderMap.feedback.length,
      feedback_translation: folderMap.feedback_translation.length,
    },
    reached: progress?.reached ?? new Set<SubmissionStatus>(),
    emails: progress?.emails ?? new Map<string, boolean>(),
    assignees: progress?.assignees ?? {},
    // The one fact the translation stages gate on (QA 5.9) — already in hand
    // from the coach resolved above for the hint. Empty when none is assigned.
    coachLanguages: assignedCoach?.languages ?? [],
  });

  /*
    The control belongs to the outstanding line, so it's chosen from the chain
    rather than from the status. Two sources of truth about "what happens next"
    is exactly how a button bar and a status badge drift apart.
  */
  // From the line that *holds the control*, not the outstanding one. They are
  // the same line in every ordinary case; where they differ, the difference is
  // the whole point — see `holdsControl`.
  const act = stage.find((line) => line.holdsControl)?.act;

  const control = submission.archivedAt ? (
    <RowActionForm
      action={unarchiveSubmissionAction}
      submissionId={submission.id}
      label="Unarchive"
      className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
    />
  ) : act === "assign" ? (
    <div className="flex flex-col items-start gap-2">
      <AssignCoachSelect
        key={assignedCoachId ?? "unassigned"}
        submissionId={submission.id}
        assignedOperatorId={assignedCoachId}
        coaches={coaches}
      />
      <p className="text-[11px] text-ink-muted">
        Assigning is also what makes translation need derivable — the coach decides it.
      </p>
    </div>
  ) : act === "handoff" ? (
    <SendWithFileSet
      action={notifyCoachAction}
      submissionId={submission.id}
      sets={intakeSets}
      side="intake"
      label="Send email →"
      className="rounded-md border border-accent px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/5"
    />
  ) : act === "approve" ? (
    <div className="flex flex-col items-start gap-2">
      <FeedbackFileLinks files={feedbackFiles} />
      <SendWithFileSet
        action={completeSubmissionAction}
        submissionId={submission.id}
        sets={responseSets}
        side="feedback"
        label="Approve & send →"
        className="rounded-md border border-emerald-500 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
      />
    </div>
  ) : act === "resolve" ? (
    <div className="flex flex-wrap items-center gap-2">
      <RowActionForm
        action={resolveSubmissionAction}
        submissionId={submission.id}
        label="Mark resolved"
        className="rounded-md border border-emerald-500 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
      />
      <RowActionForm
        action={archiveSubmissionAction}
        submissionId={submission.id}
        label="Archive"
        className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
      />
    </div>
  ) : act === "pickIntakeTranslator" || act === "pickFeedbackTranslator" ? (
    <div className="flex flex-col items-start gap-2">
      <AssignTranslatorSelect
        key={
          (act === "pickIntakeTranslator"
            ? progress?.assignees.intake_translation
            : progress?.assignees.feedback_translation) ?? "unassigned"
        }
        submissionId={submission.id}
        leg={act === "pickIntakeTranslator" ? "intake_translation" : "feedback_translation"}
        direction={act === "pickIntakeTranslator" ? intakeDirection : responseDirection}
        assignedOperatorId={
          act === "pickIntakeTranslator"
            ? progress?.assignees.intake_translation
            : progress?.assignees.feedback_translation
        }
        translators={
          // On intake the assigned coach can't translate files they can't read
          // (that's why the leg exists), so they never appear (QA 5.9). The
          // response leg is their own feedback, which they can.
          act === "pickIntakeTranslator"
            ? translators.filter((t) => t.id !== assignedCoachId)
            : translators
        }
      />
      {sharesLanguage ? (
        /*
          Bilingual-source recommendation (QA 5.9.5, B): they share a language,
          so hand-over stays available beside the picker — for when the files
          turn out to be in it. Intake hands to the coach; the response leg's
          equivalent skip is approving and sending as-is.
        */
        <>
          {act === "pickIntakeTranslator" ? (
            <SendWithFileSet
              action={notifyCoachAction}
              submissionId={submission.id}
              sets={intakeSets}
              side="intake"
              label="or hand to the coach →"
              className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
            />
          ) : (
            <SendWithFileSet
              action={completeSubmissionAction}
              submissionId={submission.id}
              sets={responseSets}
              side="feedback"
              label="or approve &amp; send →"
              className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
            />
          )}
          <p className="text-[11px] text-ink-muted">
            They share a language. If the files are already in one the{" "}
            {act === "pickIntakeTranslator" ? "coach" : "customer"} understands,
            hand it over instead.
          </p>
        </>
      ) : (
        <p className="text-[11px] text-ink-muted">
          Needed because the languages don&apos;t line up. Picking is what makes
          the hand-off sendable.
        </p>
      )}
    </div>
  ) : act === "sendForTranslation" ? (
    <RowActionForm
      action={sendForTranslationAction}
      submissionId={submission.id}
      label="Send for translation →"
      className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
    />
  ) : act === "uploadIntake" || act === "uploadResponse" ? (
    <p className="text-[11px] text-ink-muted">
      Off-platform work: upload the result into the{" "}
      {act === "uploadIntake" ? "client" : "coach"}-translated folder on the right.
    </p>
  ) : act ? (
    // The waits. Naming who we're waiting on is more use than a disabled button.
    <p className="text-[11px] text-ink-muted">
      {act === "waitCoach"
        ? "Waiting on the coach. Chase them if this sits."
        : act === "waitCustomer"
          ? "Waiting on the customer. No clock runs until they act."
          : "Waiting on the nightly sweep."}
    </p>
  ) : isReleased(submission) && !submission.archivedAt ? (
    <RowActionForm
      action={archiveSubmissionAction}
      submissionId={submission.id}
      label="Archive"
      className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink"
    />
  ) : undefined;

  const outstanding = stage.find((line) => line.now);

  const lastActivity = submission.updatedAt ?? submission.submittedAt;
  const sessionExpiry = lastActivity
    ? new Date(new Date(lastActivity).getTime() + FLOW_WINDOW_MINUTES * 60_000).toISOString()
    : undefined;

  /*
    The coach gets their name; everyone else gets their role.

    A name is only more useful than a role when there's a specific person to
    chase — and for the customer, the admin himself, or an off-platform translator
    there isn't one, or it's obvious. "Waiting on the translator" is actionable
    in a way "assigned to Yuki" isn't when Yuki hasn't been sent anything yet.
  */
  const court = whoseCourt(submission);
  const courtName =
    court === "coach"
      ? (assignedCoach?.name ?? "the coach")
      : court === "system"
        ? "the sweep"
        : court;

  return (
    <QueueRow
      playerName={submission.playerName}
      /*
        The short id leads, because it's the handle.

        A uuid is unusable in conversation and the first eight characters are
        unambiguous at any volume this product will see — enough to say "look at
        6dccefdb" and both people know which row. The full one is in the details,
        where it can be copied.
      */
      shortId={submission.id.slice(0, 8)}
      meta={[
        submission.focus,
        `${folderMap.intake.length} file${folderMap.intake.length === 1 ? "" : "s"}`,
        submission.customerEmail,
      ]
        .filter(Boolean)
        .join(" · ")}
      rail={{
        status: submission.status,
        needsTranslation: wantsTranslation === true,
      }}
      /*
        Whose court the ball is in — not who is assigned.

        A submission can belong to a coach for days while everyone is actually
        waiting on the admin to approve it. The assigned coach is only sometimes the
        answer to "who is holding this up", and the queue exists to answer the
        second question.

        An archived row is nobody's move, whatever rung it stopped on.
      */
      facts={
        submission.archivedAt ? (
          isReleased(submission) ? (
            <span className={`${pillClass} border-line text-ink-muted`}>archived</span>
          ) : (
            /*
              Archived while the feedback was still owed — a paid customer set
              aside before they got anything (Ben, QA 5.6). This must NOT read
              like a filed-and-done row: an archived `resolved` is "finished and
              filed", an archived `in_review` is "an open obligation, parked".
              Colour and text both mark it, and the rail still names the rung it
              stopped on.
            */
            <span
              className={`${pillClass} border-amber-300 bg-amber-50 text-amber-800`}
            >
              archived · owed
            </span>
          )
        ) : (
          /*
            Filled ink when it's ours, outlined when it isn't.

            The design system carries emphasis by weight and contrast rather than
            hue (globals.css), so "primary" here means the same solid ink the
            active status pill uses. Scanning the column, the filled pills are
            the work waiting on us — which is the one thing an operator opening
            this page is actually looking for.
          */
          <span
            className={`${pillClass} ${
              court === "admin"
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-ink-soft"
            }`}
          >
            {courtName}
          </span>
        )
      }
      /* The flag names what's owed, in the same future voice the pill's second
         line and the trail's last line use — one sentence, three places —
         the rail already says where it is. */
      /* The hint wins when it's set: "no shared language" is more actionable
         than naming the outstanding line, and it's the reason for the delay. */
      flag={
        translationHint ??
        (outstanding && !submission.archivedAt ? outstanding.next : undefined)
      }
      stage={stage}
      control={control}
      folders={
        isPaid(submission) ? (
          <FileFolders
            submissionId={submission.id}
            folders={folderMap}
            uploadAction={uploadToFolderAction}
            removeAction={removeFileAction}
          />
        ) : (
          <SubmissionFileList files={files} emptyLabel="Nothing uploaded yet." />
        )
      }
      details={
        <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-xs">
          <dt className="text-ink-muted">ID</dt>
          <dd className="m-0 font-mono text-[11.5px] break-all text-ink-soft">
            {submission.id}
          </dd>
          <dt className="text-ink-muted">Started</dt>
          <dd className="m-0 font-mono text-[11.5px] text-ink-soft">
            <LocalTime iso={submission.submittedAt} />
          </dd>
          {/*
            Only while it can still lapse. After payment the flow cookie is
            released deliberately, so an expiry here would describe a session
            nobody is holding.

            Derived, not stored: the cookie is re-issued on every action and the
            server never records when. Measuring from the last write is the
            earliest it can die, never the latest — hence the qualifier, which is
            the honest thing to show rather than a precise-looking time that can
            be wrong.
          */}
          {!isPaid(submission) && (
            <>
              <dt className="text-ink-muted">Session expires</dt>
              <dd className="m-0 font-mono text-[11.5px] text-ink-soft">
                <LocalTime iso={sessionExpiry} />
                <span className="ml-1.5 font-sans text-ink-muted">at the earliest</span>
              </dd>
            </>
          )}
          {/* Each party is followed by the language they understand, so the
              reader pairs them without scrolling; "understands" not "reads"
              because most of what a customer uploads is spoken (Ben, QA 5.9.13). */}
          <dt className="text-ink-muted">Customer</dt>
          <dd className="m-0 font-mono text-[11.5px] text-ink-soft">{submission.customerEmail}</dd>
          <dt className="text-ink-muted">Customer understands</dt>
          <dd className="m-0 font-mono text-[11.5px] text-ink-soft">
            {submission.languages?.join(", ") || "not declared"}
          </dd>
          <dt className="text-ink-muted">Coach</dt>
          <dd className="m-0 font-mono text-[11.5px] text-ink-soft">{assignedCoach?.name ?? "—"}</dd>
          <dt className="text-ink-muted">Coach understands</dt>
          <dd className="m-0 font-mono text-[11.5px] text-ink-soft">
            {assignedCoach ? assignedCoach.languages.join(", ") || "none recorded" : "—"}
          </dd>
          {alignmentLine && (
            <>
              <dt className="text-ink-muted">Pipeline status</dt>
              <dd className="m-0 text-[11.5px] text-ink-soft">{alignmentLine}</dd>
            </>
          )}
          <dt className="text-ink-muted">Sent to coach</dt>
          <dd className="m-0 font-mono text-[11.5px] text-ink-soft">{submission.coachFileSet ?? "—"}</dd>
          <dt className="text-ink-muted">Sent to customer</dt>
          <dd className="m-0 font-mono text-[11.5px] text-ink-soft">{submission.customerFileSet ?? "—"}</dd>
          <dt className="text-ink-muted">Collected</dt>
          <dd className="m-0 font-mono text-[11.5px] text-ink-soft"><LocalTime iso={submission.collectedAt} /></dd>
        </dl>
      }
      events={events}
      override={
        isPaid(submission) ? (
          <OperatorOverride
            submissionId={submission.id}
            status={submission.status}
            archiveAction={archiveSubmissionAction}
            purgeAction={purgeFolderAction}
            resetAction={resetStatusAction}
            deleteAction={deleteSubmissionAction}
          />
        ) : null
      }
    />
  );
}

function FeedbackFileLinks({ files }: { files: SubmissionFile[] }) {
  if (files.length === 0) {
    return <span className="text-xs text-ink-muted">No feedback files</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {files.map((file) => (
        <a
          key={file.id}
          href={`/api/feedback/${file.id}`}
          className="text-xs font-semibold text-accent hover:underline"
        >
          {file.filename} ↓
        </a>
      ))}
    </div>
  );
}

