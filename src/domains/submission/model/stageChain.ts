/**
 * The chain — what has to happen *within* the rung a submission is sitting on.
 *
 * The ladder says where a submission is; this says how far through that place it
 * has got, and what is outstanding. Together they're the "then, in order" column
 * of [`_SubmissionDocumentation.md` §2](../_SubmissionDocumentation.md), reduced
 * to what the database can actually answer.
 *
 * **Every line carries its own `met` predicate.** A checklist that has to be
 * ticked by a human is a checklist that goes stale the first busy week, so
 * nothing here is a flag someone sets — each line asks the row, the files, or
 * the trail. That constrains what can be listed, which is the point: if it can't
 * be observed, it doesn't belong on a progress view pretending to observe it.
 *
 * **Passive lines never hold the pointer.** the admin translating on his laptop can't
 * be watched, so treating it as a gate would leave a row showing nothing to do
 * while an upload was plainly outstanding. Such a line still renders — it's part
 * of the story — but the next actionable line is what the row is waiting on.
 *
 * Pure and client-safe: no database, no `process.env`. A `"use client"`
 * component imports this directly rather than the slice barrel.
 */
import { needsTranslation } from "./submission";
import type { Submission, SubmissionStatus } from "./submission";
import type { FileKind } from "./submissionFile";

/** What the server gathers once so every line can be answered without a query. */
export interface ProgressFacts {
  /** How many files sit in each of the four folders. */
  files: Record<FileKind, number>;
  /** Rungs this submission has actually passed through, from the trail. */
  reached: ReadonlySet<SubmissionStatus>;
  /** Messages we tried to send, and whether they landed. */
  emails: ReadonlyMap<string, boolean>;
  /**
   * Who currently owes each kind of file.
   *
   * Lives here rather than on the `Submission` because assignment is its own
   * table now (ADR 018) — a submission can carry a coach and two translators,
   * and the scalar column that used to answer this could only hold one.
   */
  assignees: Readonly<Partial<Record<FileKind, string>>>;
  /**
   * The assigned coach's languages — the one fact the translation stages gate
   * on (Ben, QA 5.9).
   *
   * On the facts rather than the `Submission` because it isn't the submission's:
   * it's the coach's, and only the chain's two "pick a translator" lines ask it.
   * Empty when no coach is assigned yet, which reads as **can't tell** — the
   * intersection is meaningless without both sides, so `needsTranslation`
   * returns `null` and the stage stays passive rather than falsely gating.
   */
  coachLanguages: readonly string[];
}

/**
 * What a line offers to do about itself.
 *
 * The control lives *on* the outstanding line rather than in a button bar: a bar
 * makes you read the status, work out what it implies, then find the matching
 * button. Naming the action here means what you read and what you press cannot
 * drift apart.
 */
export type ChainAction =
  | "assign"
  | "handoff"
  | "approve"
  | "resolve"
  | "sendForTranslation"
  | "uploadIntake"
  | "uploadResponse"
  | "waitCustomer"
  | "waitCoach"
  // Waiting on a named translator, not on the admin doing it themselves. The
  // distinction only became expressible when a translator could log in.
  | "waitTranslator"
  // Picking is its own act, and its own rung, for a translator as for a coach.
  // The leg is in the name because the two are staffed at different points and
  // may be different people.
  | "pickIntakeTranslator"
  | "pickFeedbackTranslator"
  | "waitCron";

export interface ChainLine {
  /** What has to be true, in the operator's words. Past voice — a condition met. */
  what: string;
  /**
   * The same line before it happens — terse, and in the other voice.
   *
   * `what` is a condition met; this is the thing to do. Same register, same
   * length: "Payment cleared" against "Clear payment". A greyed-out past-tense
   * line still reads as something that occurred, and a full sentence beside a
   * column of clipped ones reads as a different kind of entry altogether.
   */
  next: string;
  /** How we know — the field, the file, or the event. Shown small. */
  from: string;
  /** Why it matters, where that isn't obvious. */
  why?: string;
  /**
   * **Nobody can act on it**, so it never holds the pointer.
   *
   * Two kinds qualify. Off-platform steps we can't observe — a translator
   * downloading the originals. And **records of a send**: an email either went
   * or it didn't, and no button in the portal makes a failed one true.
   *
   * That second kind is why this matters. The pointer is the first unmet
   * non-passive line, and the control hangs off it — so a notification that
   * failed for reasons having nothing to do with the work would sit there
   * unmet forever, **hiding the control on the line below it**. That is
   * exactly what happened: `② arrival → Admin` failed on a placeholder address
   * and took the whole assign control with it.
   *
   * A line where the send *is* the action — the hand-off — keeps its pointer,
   * because there a person really does press something.
   *
   * **A function when the answer depends on the submission** (Ben, QA 5.9). Most
   * lines are passive or not by their nature — a send, an off-platform download.
   * The two translation stages are the exception: optional for a coach who
   * shares a language, a real gate for one who doesn't, and only *this*
   * submission's languages say which. A constant boolean can't express "steps
   * aside for most, blocks for some", so those lines answer it per submission.
   */
  passive?: boolean | ((submission: Submission, facts: ProgressFacts) => boolean);
  /**
   * **This line does not apply to this submission at all** — as against
   * `passive`, which means "real, but nobody here presses it".
   *
   * The two were one field until 2026-09-03, and conflating them put "then Pick
   * a translator, if needed" in the *upcoming* list of every submission that
   * skips translation — advertising a step that was never going to happen, on
   * the majority of submissions (Ben, QA b2j).
   *
   * The difference is what the reader should do with the line. A passive line
   * is coming: the receipt will be sent, the coach will download. A skipped
   * line is not coming, and a list of what happens next has no business naming
   * it. So passive lines still render under "then" and skipped ones render
   * nowhere.
   *
   * That the submission *could* have needed translating is not lost with it —
   * the detail panel's pipeline-status line says which way the decision went,
   * which is the right place for a road not taken.
   */
  skipped?: (submission: Submission, facts: ProgressFacts) => boolean;
  /** The control that satisfies it, if a person can. */
  act?: ChainAction;
  /**
   * Every row the trail writes when this line goes wrong, verbatim.
   *
   * The chain said what has to be true and nothing about the other outcome —
   * and the other outcome is the one somebody has to act on. `② arrival → Admin`
   * failing is what hid the assign control for a day, and no list anywhere said
   * that was a thing that could happen.
   */
  failures?: string[];
  /**
   * What a **person** is told when this line goes wrong, and who.
   *
   * The trail is the record; this is the experience. They are not the same
   * event and they don't always both happen — a bounced verification code
   * writes a row *and* puts a sentence in front of the customer, while a
   * refused reassignment does neither today.
   *
   * **Every entry names its audience and the surface it lands on.** Four
   * surfaces, not three: the customer meets the checkout **flow** while paying
   * and the **status** page afterwards — they log in to it with their email and
   * an access code — and those are different screens reached different ways. A
   * dead download link is a status-page problem and could never appear in the
   * flow.
   *
   * **Northstar.** Where nobody is told today, the entry says exactly that and
   * carries `*(not built)*` — silence is a gap, not the absence of one.
   */
  toldOnFail?: string[];
  /**
   * What a person sees when this line goes *right*, and who.
   *
   * Mostly the emails, which is the point: ⑥ is not merely a row in the trail,
   * it is the thing the customer actually receives. The rest are the screens
   * and the queue changing under someone — a rung that moves with nothing
   * visible attached to it is a rung nobody can act on.
   */
  toldOnSuccess?: string[];
  /**
   * The rows this line writes when it *works*, verbatim.
   *
   * Sends, checks and attachments — **not the rung row.** A step writes exactly
   * one status row and writes it *on arrival*, naming itself, so it belongs to
   * the step rather than to any substep inside it. `Draft` is the first line of
   * every trail; `Upload` opens the upload step rather than closing the draft.
   *
   * Attributing it to the substep that triggered the move read as the move
   * being that substep's output, which put the name of a step under the step
   * before it.
   *
   * `what` is the condition in the operator's words; this is what the trail
   * actually prints, and they aren't the same sentence — "Email proven" is the
   * condition, `code accepted — on attempt 3` is the row. Listing summaries
   * beside verbatim failures would make the table lie about half of itself.
   *
   * Absent where the two coincide, or where nothing is written at all.
   */
  records?: string[];
  met: (submission: Submission, facts: ProgressFacts) => boolean;
}

/**
 * Every row a message can leave in the trail, verbatim.
 *
 * **These are the exact strings**, not summaries of them — the whole use of the
 * list is being able to search a trail for a line and find it here, or read it
 * here and know what to look for.
 *
 * `sent` only ever means Resend accepted it; everything below arrives later by
 * webhook. Bounces carry their classification when Resend gives us one, and a
 * shape we don't recognise still records the bounce without it — losing the
 * detail is survivable, losing the bounce is not.
 */
/** What a message writes when it lands: accepted, then confirmed. */
const sendRecords = (label: string) => [label, `${label} delivered`];

const sendFailures = (label: string) => [
  `${label} failed`,
  `${label} bounced — hard`,
  `${label} bounced — soft`,
  `${label} bounced`,
  `${label} complained`,
];

/**
 * What the **customer's** upload is refused with, in their own words. Every one
 * is a refusal at the door, so they belong to `told`, never `failures` — there
 * is no submission-level event for a file that was never accepted.
 *
 * Only the three `/api/upload*` routes run this policy.
 *
 * Two of the limits are operator-tunable, so the numbers here are the seeded
 * defaults; the sentence is what's fixed.
 */
/**
 * What the **operator's and the coach's** uploads say when they go wrong:
 * nothing.
 *
 * `uploadToFolderAction` is a Server Action returning `void`, and the
 * feedback route runs no policy — neither checks size, type or count, and
 * neither has a channel to report a refusal through. A file that fails is a
 * page that refreshes unchanged.
 *
 * Listed rather than left blank because a blank cell reads as "nothing can go
 * wrong here", which is the opposite of true.
 */
/**
 * Attachment rows, one per file — the running count is in the note.
 *
 * **A row per file, not one per upload.** The browser sends them separately and
 * any one of them can fail on its own, so a single "3 files attached" would be
 * a summary of three events that didn't necessarily all happen.
 *
 * Five is the seeded `maxFilesPerSubmission`; the cap is operator-tunable, so
 * the ceiling moves with it and the shape of the row doesn't.
 */
const attached = (kind: string) =>
  Array.from(
    { length: 5 },
    (_, i) => `files attached — ${i + 1} ${kind} *(not built)*`,
  );

/** Wrong-code rows, one per attempt — the count is in the note. */
const WRONG_CODE = Array.from(
  { length: 5 },
  (_, i) => `code rejected — wrong code — ${i + 1} of 5 attempts spent`,
);

const sent = (label: string) => (_s: Submission, f: ProgressFacts) =>
  f.emails.get(label) === true;
const has = (kind: FileKind) => (_s: Submission, f: ProgressFacts) =>
  f.files[kind] > 0;
const reached = (status: SubmissionStatus) => (_s: Submission, f: ProgressFacts) =>
  f.reached.has(status);

/**
 * What has to happen **while a submission sits on this rung** — and nothing else.
 *
 * Every rung used to open by restating the condition that got it there: "Coach
 * chosen" closed `new` and opened `assigned`, "Response uploaded" closed
 * `in_review` and opened `awaiting_approval`. The intent was that a rung read as
 * a complete account of itself. What it produced was eleven lines that say a
 * thing twice, and in a flat list — the override's substep dropdown — two
 * identical entries one step apart with no way to tell which is which.
 *
 * So the rule is now strict: **a line earns its place only if its truth can
 * change during this rung.** How the submission arrived is the previous rung's
 * business, and the trail already records it.
 *
 * An email that fires on *entry* does belong here — it is triggered by arriving,
 * and whether it landed is live information while you're looking at the rung.
 * That is why `③ hand-off → coach` sits on `sent_to_coach` rather than beside
 * the button that sent it: the button is an act, the delivery is an outcome, and
 * they are two facts a rung apart.
 *
 * **Two lines still appear at two rungs, and should.** "Handed to the coach" is
 * the way out of both `assigned` and `intake_translated`; "Approved and sent" is
 * the way out of both `awaiting_approval` and `feedback_translated`. Those are
 * one action reachable by two routes — translate first, or don't — not a fact
 * stated twice.
 */
export const STAGE_CHAIN: Record<SubmissionStatus, ChainLine[]> = {
  draft: [
    { what: "Code sent to the customer", next: "Send the code", from: "①", passive: true, records: [...sendRecords("① code → customer")], failures: [...sendFailures("① code → customer")], toldOnFail: ["Customer/flow: \"That email address doesn't exist. Please check it for a typo and try again.\"", "Customer/flow: \"That inbox couldn't accept our email. It may be full, so please try a different address.\"", "Customer/flow: \"We couldn't deliver your code to that address. Check it for a typo, or try a different email.\"", "Customer/flow: \"We couldn't send your code — please check the address and try again.\"", "Customer/flow: \"We couldn't send your code — please try again in a moment.\""], toldOnSuccess: ["Customer/flow: \"Enter the code from your email.\"", "Customer/flow: \"We've sent a new code.\" on a resend"], met: sent("① code → customer") },
    { what: "Email proven", next: "Prove the email", from: "emailVerifiedAt", act: "waitCustomer", records: ["code accepted", ...Array.from({ length: 4 }, (_, i) => `code accepted — on attempt ${i + 2}`)], failures: [...WRONG_CODE, "code rejected — 5 attempts spent", "code rejected — the window had closed", "code rejected — no code outstanding"], toldOnFail: ["Customer/flow: \"That code doesn't match. Check the email and try again.\"", "Customer/flow: \"Too many incorrect attempts. Ask for a new code to try again.\"", "Customer/flow: \"We haven't sent a code yet. Ask for a new one below.\"", "Customer/flow: \"Too many attempts. Please wait a few minutes.\"", "Customer/flow: \"Too many code requests. Please wait a few minutes.\" on the resend"], toldOnSuccess: ["Customer/flow: the upload step opens — no message, the screen simply advances"], met: (s) => !!s.emailVerifiedAt },
  ],
  awaiting_payment: [
    { what: "At least one file attached", next: "Attach a file", from: "intake", records: [...attached("intake")], toldOnFail: ["Customer/flow: \"You can attach up to 5 files.\"", "Customer/flow: \"Files must be under 50 MB.\"", "Customer/flow: \"That file type isn't supported.\"", "Customer/flow: \"That file is empty.\"", "Customer/flow: \"Your session has expired. Please start again.\"", "Customer/flow: \"Please attach at least one file first.\" on trying to advance"], toldOnSuccess: ["Customer/flow: each file appears in the list with its size"], met: has("intake") },
    { what: "Payment cleared", next: "Clear payment", from: "paidAt", act: "waitCustomer", failures: ["card declined → customer", ...sendFailures("card declined → customer"), "declined *(not built)* — only the notice is recorded, not the decline"], toldOnFail: ["Customer/flow: \"That card didn't go through\"", "Customer/flow: \"That payment didn't go through.\"", "Customer/flow: \"We couldn't start the payment. Please try again.\"", "Customer/flow: \"Your payment is still processing. We'll email you as soon as it clears.\"", "Customer/email: the decline email, carrying a way back in", "Customer/flow: after the window their attempt is gone and the flow restarts at step 1, with nothing saying why *(not built)*"], toldOnSuccess: ["Customer/flow: the confirmation screen"], met: (s) => !!s.paidAt },
  ],
  new: [
    { what: "Receipt sent to the customer", next: "Send the receipt", from: "②", passive: true, records: [...sendRecords("② receipt → customer")], failures: [...sendFailures("② receipt → customer")], toldOnFail: ["Admin/portal: “The receipt to {customer} bounced — they may not know their submission arrived.” *(not built)*"], toldOnSuccess: ["Customer/email: ② the receipt, listing every file"], met: sent("② receipt → customer") },
    { what: "Arrival announced", next: "Tell Admin it arrived", from: "②", passive: true, records: [...sendRecords("② arrival → Admin")], failures: [...sendFailures("② arrival → Admin")], toldOnFail: ["Admin/portal: a banner on the row — “Your arrival notice bounced. Check the address on your account.” *(not built)*"], toldOnSuccess: ["Admin/email: ② the arrival notice"], met: sent("② arrival → Admin") },
    { what: "Coach chosen", next: "Pick a coach", from: "submission_assignment", act: "assign", toldOnFail: ["Admin/portal: “This has already gone to a coach. Reload to see where it is.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Assigned and the coach's name appears on it"], met: (_s, f) => !!f.assignees.feedback },
  ],
  assigned: [
    {
      what: "Translator chosen, if this coach needs one", next: "Pick a translator, if needed",
      from: "rung 5",
      why: "optional — a coach who reads everything the customer might have sent skips it",
      act: "pickIntakeTranslator",
      /*
        Passive for most, a gate for the ones that need it (Ben/Aaron, QA 5.9).
        The customer is the source, the coach the target: it steps aside when the
        coach reads every language the customer declared — or when we can't yet
        tell — and holds the pointer when the customer reads a language the coach
        doesn't, because the files may be in that one. That catches the bilingual
        customer sending to a monolingual coach, not just the no-overlap case.
        `!== true` keeps the null case (one side undeclared) as skip, never a gate
        on a question nobody answered.
      */
      skipped: (s, f) => needsTranslation(s.languages, f.coachLanguages) !== true,
      toldOnFail: ["Admin/portal: “That did not go through — try again.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Translating"], met: (_s, f) => f.files.intake_translation > 0,
    },
    { what: "Handed to the coach", next: "Hand to the coach", from: "③", act: "handoff", records: [...sendRecords("③ hand-off → coach")], failures: [...sendFailures("③ hand-off → coach")], toldOnFail: ["Admin/portal: “This has already gone to a coach. Reload to see where it is.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Sent"], met: sent("③ hand-off → coach") },
  ],
  intake_translator_assigned: [
    {
      what: "Sent to the translator", next: "Send to the translator",
      from: "rung 6", act: "sendForTranslation",
      records: [...sendRecords("⑩ hand-off → intake translator")],
      failures: [...sendFailures("⑩ hand-off → intake translator"), "Refused — that folder is empty, so there is nothing to send"],
      toldOnFail: ["Admin/portal: “Pick a translator first.”", "Admin/portal: “There is nothing for the translator to work from.”"],
      toldOnSuccess: ["Admin/portal: the row moves to Sent", "Translator/email: the hand-off, with a download link per file"],
      /* Measured by the send, not by the rung (Ben, QA 5.9.14). It used to be
         `reached("sent_to_intake_translator")` — so the ladder asserted an email, this
         line confirmed the assertion from the ladder, and nothing observed an
         actual send. The hand-off shipped for weeks sending nothing. */
      met: sent("⑩ hand-off → intake translator"),
    },
  ],
  sent_to_intake_translator: [
    {
      what: "Translator downloaded the originals", next: "Translator downloads the originals",
      from: "trail · intake_translating",
      why: "the only evidence the translator actually has it",
      act: "waitTranslator",
      
      toldOnFail: ["Translator/portal: the download is gone — the folder was purged before they collected (410)"], toldOnSuccess: ["Translator/portal: the file downloads", "Admin/email: the translator has it"], met: reached("intake_translating"),
    },
  ],
  intake_translating: [
    { what: "Translated files uploaded", next: "Upload the translated files", from: "intake_translation", act: "uploadIntake", records: [...attached("intake_translation")], toldOnFail: ["Admin/portal: “That file was rejected — too large, wrong type, or empty.” *(not built)*"], toldOnSuccess: ["Admin/portal: the files appear in the folder"], met: has("intake_translation") },
  ],
  intake_translated: [
    { what: "Handed to the coach", next: "Hand to the coach", from: "③", act: "handoff", records: [...sendRecords("③ hand-off → coach")], failures: [...sendFailures("③ hand-off → coach")], toldOnFail: ["Admin/portal: “This has already gone to a coach. Reload to see where it is.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Sent"], met: sent("③ hand-off → coach") },
  ],
  sent_to_coach: [
    { what: "Hand-off emailed", next: "Email the hand-off", from: "③", passive: true, records: [...sendRecords("③ hand-off → coach")], failures: [...sendFailures("③ hand-off → coach")], toldOnFail: ["Admin/portal: a banner on the row — “They never received this. They do not know they have work waiting.” *(not built)*"], toldOnSuccess: ["Coach/email: ③ the hand-off, with a download link per file"], met: sent("③ hand-off → coach") },
    {
      what: "Coach downloaded the files", next: "Coach downloads the files",
      from: "trail · in_review",
      why: "the only evidence the coach actually has it",
      act: "waitCoach",
      
      toldOnFail: ["Coach/portal: the download is gone — the folder was purged before they collected (410)"], toldOnSuccess: ["Coach/portal: the file downloads", "Admin/email: ④ picked up — the coach has it"], met: reached("in_review"),
    },
  ],
  in_review: [
    { what: "Response uploaded", next: "Upload the response", from: "feedback", act: "waitCoach", records: [...attached("feedback")], toldOnFail: ["Coach/portal: “That file was rejected — too large, wrong type, or empty.” *(not built)*"], toldOnSuccess: ["Coach/portal: the file appears in their folder"], met: has("feedback") },
  ],
  awaiting_approval: [
    { what: "Admin and the coach told", next: "Tell Admin and the coach", from: "⑤", passive: true, records: [...sendRecords("⑤ response submitted → Admin + coach")], failures: [...sendFailures("⑤ response submitted → Admin + coach")], toldOnFail: ["Admin/portal: “That did not go through — try again.” *(not built)*"], toldOnSuccess: ["Admin/email: ⑤ response submitted", "Coach/email: ⑤ the same notice"], met: sent("⑤ response submitted → Admin + coach") },
    {
      what: "Translator chosen, if the customer needs one", next: "Pick a translator, if needed",
      from: "rung 10",
      why: "optional — skipped when the response is already readable",
      act: "pickFeedbackTranslator",
      // The response leg runs the OTHER way (Ben/Aaron, QA 5.9): the coach's
      // feedback must become readable to the customer, so the coach is the
      // source and the customer the target — the reverse of the intake gate. A
      // bilingual coach writing for a monolingual customer is the case this
      // catches; the intake gate would miss it.
      skipped: (s, f) => needsTranslation(f.coachLanguages, s.languages) !== true,
      toldOnFail: ["Admin/portal: “That did not go through — try again.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Translating"], met: (_s, f) => f.files.feedback_translation > 0,
    },
    { what: "Approved and sent", next: "Approve and send", from: "feedbackEmailedAt", act: "approve", records: [...sendRecords("⑥ feedback ready → customer")], failures: [...sendFailures("⑥ feedback ready → customer"), "Refused — there is no response file to send"], toldOnFail: ["Admin/portal: “There is no response file to send yet.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Delivered"], met: (s) => !!s.feedbackEmailedAt },
  ],
  feedback_translator_assigned: [
    {
      what: "Sent to the translator", next: "Send to the translator",
      from: "rung 12", act: "sendForTranslation",
      records: [...sendRecords("⑪ hand-off → feedback translator")],
      failures: [...sendFailures("⑪ hand-off → feedback translator"), "Refused — that folder is empty, so there is nothing to send"],
      toldOnFail: ["Admin/portal: “Pick a translator first.”", "Admin/portal: “There is nothing for the translator to work from.”"],
      toldOnSuccess: ["Admin/portal: the row moves to Sent", "Translator/email: the hand-off, with a download link per file"],
      /* Measured by the send, not by the rung (Ben, QA 5.9.14). It used to be
         `reached("sent_to_feedback_translator")` — so the ladder asserted an email, this
         line confirmed the assertion from the ladder, and nothing observed an
         actual send. The hand-off shipped for weeks sending nothing. */
      met: sent("⑪ hand-off → feedback translator"),
    },
  ],
  sent_to_feedback_translator: [
    {
      what: "Translator downloaded the feedback", next: "Translator downloads the feedback",
      from: "trail · feedback_translating",
      why: "the only evidence the translator actually has it",
      act: "waitTranslator",
      
      toldOnFail: ["Translator/portal: the download is gone — the folder was purged before they collected (410)"], toldOnSuccess: ["Translator/portal: the file downloads", "Admin/email: the translator has it"], met: reached("feedback_translating"),
    },
  ],
  feedback_translating: [
    { what: "Translation uploaded", next: "Upload the translation", from: "feedback_translation", act: "uploadResponse", records: [...attached("feedback_translation")], toldOnFail: ["Admin/portal: “That file was rejected — too large, wrong type, or empty.” *(not built)*"], toldOnSuccess: ["Admin/portal: the files appear in the folder"], met: has("feedback_translation") },
  ],
  feedback_translated: [
    { what: "Approved and sent", next: "Approve and send", from: "feedbackEmailedAt", act: "approve", records: [...sendRecords("⑥ feedback ready → customer")], failures: [...sendFailures("⑥ feedback ready → customer"), "Refused — there is no response file to send"], toldOnFail: ["Admin/portal: “There is no response file to send yet.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Delivered"], met: (s) => !!s.feedbackEmailedAt },
  ],
  complete: [
    { what: "Feedback emailed", next: "Email the feedback", from: "⑥", passive: true, records: [...sendRecords("⑥ feedback ready → customer")], failures: [...sendFailures("⑥ feedback ready → customer")], toldOnFail: ["Admin/portal: a banner on the row — “They never received this. They do not know they have work waiting.” *(not built)*"], toldOnSuccess: ["Customer/email: ⑥ feedback ready, stating the retention window"], met: sent("⑥ feedback ready → customer") },
    {
      what: "Customer downloaded it", next: "Customer downloads it",
      from: "collectedAt",
      why: "starts the retention clock — nothing is purged before this",
      act: "waitCustomer",
      
      toldOnFail: ["Customer/status: the download is gone — an operator purged the folder early (410)"], toldOnSuccess: ["Customer/status: the file downloads"], met: (s) => !!s.collectedAt,
    },
  ],
  collected: [
    { what: "Collection announced", next: "Tell Admin they collected", from: "⑦", passive: true, records: [...sendRecords("⑦ collected → Admin")], failures: [...sendFailures("⑦ collected → Admin")], toldOnFail: ["Admin/portal: “That did not go through — try again.” *(not built)*"], toldOnSuccess: ["Admin/email: ⑦ collected — the customer has it"], met: sent("⑦ collected → Admin") },
    { what: "Marked resolved", next: "Mark resolved", from: "trail · resolved", act: "resolve", toldOnFail: ["Admin/portal: “That did not go through — try again.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Resolved"], met: reached("resolved") },
  ],
  resolved: [
    { what: "Thank-you sent", next: "Send the thank-you", from: "⑧", passive: true, records: [...sendRecords("⑧ thank you → customer")], failures: [...sendFailures("⑧ thank you → customer")], toldOnFail: ["Admin/portal: “That did not go through — try again.” *(not built)*"], toldOnSuccess: ["Customer/email: ⑧ thank you, carrying the deletion date"], met: sent("⑧ thank you → customer") },
    { what: "Deletion warning due", next: "Warning falls due", from: "deletionWarnedAt", act: "waitCron", failures: ["The sweep didn't run — CRON_SECRET unset, and it refuses rather than run unguarded"], toldOnFail: ["Admin/portal: “The nightly sweep has not run since {date}.” *(not built)*"], toldOnSuccess: ["Admin/portal: the row moves to Deleting"], met: (s) => !!s.deletionWarnedAt },
  ],
  purge_imminent: [
    { what: "Warning sent", next: "Send the warning", from: "⑨", passive: true, records: [...sendRecords("⑨ deletion warning → customer")], failures: [...sendFailures("⑨ deletion warning → customer"), "Stamped even when the send failed — retrying nightly would turn one miss into seven"], toldOnFail: ["Admin/portal: “The deletion warning to {customer} did not send. They have no notice, and it will not retry.” *(not built)*"], toldOnSuccess: ["Customer/email: ⑨ the deletion warning, a week out"], met: sent("⑨ deletion warning → customer") },
    { what: "Files deleted", next: "Delete the files", from: "filesPurgedAt", act: "waitCron", failures: ["Storage refused the delete — the locator stays and the sweep retries *(not built)*"], toldOnFail: ["Admin/portal: “Storage refused the delete — {n} files are still there.” *(not built)*"], toldOnSuccess: ["Customer/status: any link they kept now answers 410", "Admin/portal: the filenames show struck through in the folders"], met: (s) => !!s.filesPurgedAt },
  ],
  purged: [
    { what: "Bytes removed from storage", next: "Remove the bytes", from: "filesPurgedAt", toldOnSuccess: ["Admin/portal: the filenames show struck through in the folders"], met: (s) => !!s.filesPurgedAt },
    { what: "Locators cleared", next: "Clear the locators", from: "fileUrl = null", toldOnSuccess: ["Customer/status: an old link answers 410 — gone, not missing"], met: (s) => !!s.filesPurgedAt },
    { what: "Record kept, permanently", next: "Keep the record", from: "the row survives", toldOnSuccess: ["Admin/portal: the row still says what was sent, forever"], met: () => true },
  ],
};

/**
 * A resolved line, ready to render — **and deliberately serialisable.**
 *
 * Not `ChainLine` with a flag bolted on: that would carry the `met` predicate
 * across the server/client boundary, which React refuses (a function can't be
 * serialised into the payload). Resolving to plain data here is also the right
 * shape regardless — the client renders what it's told and has no business
 * re-deciding whether a line is met.
 */
export interface ChainState {
  what: string;
  /** The future-voice reading, for the one line still outstanding. */
  next: string;
  from: string;
  why?: string;
  act?: ChainAction;
  met: boolean;
  /** The one line the submission is actually waiting on. */
  now: boolean;
  /** Does not apply to this submission — render it nowhere. */
  skipped: boolean;
  /**
   * The line whose control is offered — **not always the same as `now`.**
   *
   * Usually they're identical. They part when every line of a rung is met and
   * the status still hasn't moved, which a reset produces every time: sending a
   * submission back to `new` leaves its coach assigned, so "Coach chosen" reads
   * met, nothing is outstanding, and the assign control renders nowhere. The
   * row is then stuck with no way forward but another override.
   *
   * So when there is nothing outstanding, the control falls to the **last line
   * a person can act on** — re-running that action is exactly what moves the
   * rung. One field, read by both the page choosing *which* control and the
   * panel choosing *where*, so the two cannot disagree about it.
   */
  holdsControl: boolean;
}

/**
 * Resolve the chain for a submission's current rung.
 *
 * `now` is the first **unmet and non-passive** line — the thing to act on. When
 * every line is met, nothing is highlighted: that is the honest reading of a
 * rung waiting on a transition rather than on a person.
 *
 * `holdsControl` is deliberately more forgiving. Honesty about the *state* must
 * not cost the operator the *handle* — see the field's own note.
 */
export function describeStage(
  submission: Submission,
  facts: ProgressFacts,
): ChainState[] {
  const lines = STAGE_CHAIN[submission.status];
  const met = lines.map((line) => line.met(submission, facts));
  // Passive can be a constant or a question about this submission (QA 5.9), so
  // resolve it once per line and read the answer everywhere below.
  const passive = lines.map((line) =>
    typeof line.passive === "function"
      ? line.passive(submission, facts)
      : !!line.passive,
  );
  const skipped = lines.map((line) =>
    line.skipped ? line.skipped(submission, facts) : false,
  );
  // A line nobody presses and a line that will never happen are both unable to
  // be the outstanding one, for different reasons.
  const now = lines.findIndex((_line, i) => !met[i] && !passive[i] && !skipped[i]);

  // Nothing outstanding: fall back to the last line anyone can press, so a
  // reset can't strand the rung with its work done and its status behind.
  const actionable = (i: number) => !!lines[i].act && !passive[i] && !skipped[i];
  let control = now >= 0 && actionable(now) ? now : -1;
  if (control < 0 && now < 0) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (actionable(i)) { control = i; break; }
    }
  }
  if (control < 0 && now >= 0) control = now;

  return lines.map((line, i) => ({
    what: line.what,
    next: line.next,
    from: line.from,
    why: line.why,
    act: line.act,
    met: met[i],
    now: i === now,
    skipped: skipped[i],
    holdsControl: i === control,
  }));
}
