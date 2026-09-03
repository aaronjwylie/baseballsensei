/**
 * The submission domain model — the vocabulary the whole app speaks.
 *
 * Knows nothing about storage. The Postgres column names live in
 * `./submissions.ts`; the row↔domain mapping lives in `api/submissionRow.ts`.
 * If storage ever moves, this file doesn't change.
 *
 * **The vocabularies here are the source.** `./submissionStatusEnum.ts` and
 * `./focusEnum.ts` derive their values from `SUBMISSION_STATUSES` and
 * `FOCUS_OPTIONS` below, so a word is spelled once and storage follows. Not the
 * reverse — a model reading its own words back out of the schema would make the
 * first line of this docblock a lie.
 *
 * One name per concept: a property here is spelled the same way in the form,
 * the API, and the UI.
 *
 * **A submission carries a pack of files, not one video.** Its uploads are rows
 * in `submissionFiles` (see `./submissionFile.ts`); nothing here holds a single
 * locator, and phrasing anything as "the video" is how the old one-column model
 * crept back in.
 */

/**
 * The languages either side can declare.
 *
 * Two, because that's what the business is: parents in English, coaches in
 * Japanese, and the ones in the middle. Kept as free text in the column rather
 * than an enum so a third can be added by typing it, and compared
 * case-insensitively so "english" and "English" are the same claim.
 */
export const LANGUAGES = ["English", "Japanese"] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * Does `source`'s content need translating for `target` to read it?
 *
 * **Directional, and a subset — not a symmetric overlap** (Ben + Aaron, QA 5.9).
 * `target` can read `source`'s files only if it reads *every* language `source`
 * might have used, so translation is needed exactly when `source` declares a
 * language `target` does not — **`source` is not a subset of `target`**.
 *
 * The direction is the leg: on **intake** `source` is the customer and `target`
 * the coach (the customer's files must become readable to the coach); on
 * **response** they swap (the coach's feedback must become readable to the
 * customer). The same pairing therefore answers differently on the two legs,
 * which is why the caller passes the sides in the leg's order rather than always
 * customer-first.
 *
 * **Why subset and not any-overlap.** The old rule skipped whenever the two
 * shared *any* language — which is wrong the moment `source` is bilingual and
 * `target` is not. A customer who reads English and Japanese, sending to an
 * English-only coach, may have uploaded Japanese footage the coach can't read;
 * we share English, but that guarantees nothing about the files. Any-overlap
 * trusted a file language nobody recorded. Subset translates that case instead
 * of assuming.
 *
 * **The limitation this leaves standing — noted, deferred by decision (QA 5.9).**
 * We still infer a file's language from its owner's declared languages, because
 * nothing records the file's own. That inference is safe for a monolingual side
 * and unsafe for a bilingual one, which is exactly why the bilingual case
 * translates rather than trusts the guess. Recording the file's language at
 * upload would retire the proxy — a real fix, scheduled, not built here.
 *
 * **Null means we can't tell** — either side declared nothing — and is not
 * `false`. It reads as skip, never as gate: prompting on a blank nobody filled
 * in nags on every submission until someone does.
 */
export function needsTranslation(
  source: readonly string[] | undefined,
  target: readonly string[] | undefined,
): boolean | null {
  const from = normalise(source);
  const to = normalise(target);
  if (from.size === 0 || to.size === 0) return null;
  // `source` reads a language `target` can't — its files may be in that
  // language, so they need translating.
  for (const language of from) if (!to.has(language)) return true;
  return false;
}

function normalise(languages: readonly string[] | undefined): Set<string> {
  return new Set(
    (languages ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean),
  );
}

/** Map a possibly-messy language string to its canonical `Language`, or null. */
function canonicalLanguage(value: string): Language | null {
  const n = value.trim().toLowerCase();
  return LANGUAGES.find((l) => l.toLowerCase() === n) ?? null;
}

/** One leg's translation, as the pair a translator is staffed against. */
export interface Direction {
  from: Language;
  to: Language;
}

/**
 * The direction a leg must run to become readable — the pair
 * `needsTranslation` reduces to a boolean (Ben, QA 5.9).
 *
 * **From** a language the source declares that the target does not (the file may
 * be in it, and the target can't read it); **to** a language the target reads
 * (where it must land). Null when no translation is needed, or either side is
 * undeclared. Derived from the same `normalise` and the same rule, so a leg has a
 * required direction *exactly* when `needsTranslation(source, target)` is true —
 * the gate and the picker cannot disagree about which way the work runs.
 *
 * With two languages exactly one such pair exists whenever the gate fires,
 * including the bilingual cases: there the ambiguity is over *whether* to
 * translate, never over *which way*.
 */
export function requiredDirection(
  source: readonly string[] | undefined,
  target: readonly string[] | undefined,
): Direction | null {
  const from = normalise(source);
  const to = normalise(target);
  if (from.size === 0 || to.size === 0) return null;
  const needed = [...from].find((l) => !to.has(l));
  if (needed === undefined) return null;
  const fromL = canonicalLanguage(needed);
  const toL = canonicalLanguage([...to][0]);
  return fromL && toL ? { from: fromL, to: toL } : null;
}

/** Does a set of covered directions include the one a leg requires? */
export function coversDirection(
  covered: readonly Direction[],
  required: Direction,
): boolean {
  return covered.some((d) => d.from === required.from && d.to === required.to);
}

/** How a direction reads for a person — "English to Japanese". */
export function describeDirection(direction: Direction): string {
  return `${direction.from} to ${direction.to}`;
}

/** What the player wants coached. `./focusEnum.ts` derives the DB type from it. */
import type { FileSet } from "./submissionFile";

export const FOCUS_OPTIONS = [
  "Hitting",
  "Pitching",
  "Fielding",
  "Catching",
  "Other",
] as const;

export type Focus = (typeof FOCUS_OPTIONS)[number];

/**
 * The submission lifecycle — **the ladder**. Sixteen rungs, in order.
 *
 * Every meaningful transition has a status, and every status is stamped in
 * `submission_events`. The canonical account of what each one means, who moves
 * it, and which email fires is
 * [`_SubmissionDocumentation.md` §2](../_SubmissionDocumentation.md).
 *
 * **It is a path with branches, not a progress bar.** Eight rungs are only
 * touched when a submission needs translating; a coach who reads English takes
 * `assigned → sent_to_coach` and `awaiting_approval → complete` directly.
 * Anything rendering this as a linear track will be wrong for most submissions.
 *
 * The vocabulary is **intake / response** — what the customer sent, what the
 * coach wrote (`_NomenclatureLaw.md` §3). Statuses are **participles** (what has
 * happened); the matching file kinds are **nouns** (what a file is), so
 * `intake_translated` the status never reads as `intake_translation` the kind.
 *
 * | rung | reached when |
 * | --- | --- |
 * | `draft` | step 1 — player details captured |
 * | `awaiting_payment` | step 2 — the email is proven; uploads may begin |
 * | `new` | step 4 — **the payment cleared.** The boundary |
 * | `assigned` | step 5 — a coach is chosen, and translation need becomes derivable |
 * | `intake_translator_assigned` | step 5b — a translator is chosen, not yet sent |
 * | `sent_to_intake_translator` | step 6 — emailed to the translator, not yet picked up |
 * | `intake_translating` | step 7 — **the translator actually has the files** |
 * | `intake_translated` | step 7 — the translated set is back and stored |
 * | `sent_to_coach` | step 8 — emailed with the chosen language set, not yet picked up |
 * | `in_review` | step 9 — **the coach actually has the files** |
 * | `awaiting_approval` | step 10 — a response exists; the customer can't see it |
 * | `feedback_translator_assigned` | step 11a — a translator is chosen, not yet sent |
 * | `sent_to_feedback_translator` | step 11b — emailed to the translator, not yet picked up |
 * | `feedback_translating` | step 12 — **the translator actually has the files** |
 * | `feedback_translated` | step 12 — the translated version is back and stored |
 * | `complete` | step 13 — released to the customer |
 * | `collected` | step 14 — **the customer downloaded it.** The retention clock starts |
 * | `resolved` | step 15 — the admin closed it; the thank-you has gone |
 * | `purge_imminent` | step 16 — deletion is a week out; the customer has been warned |
 * | `purged` | step 17 — the bytes are gone; the record is permanent |
 */
export const SUBMISSION_STATUSES = [
  "draft",
  "awaiting_payment",
  "new",
  "assigned",
  "intake_translator_assigned",
  "sent_to_intake_translator",
  "intake_translating",
  "intake_translated",
  "sent_to_coach",
  "in_review",
  "awaiting_approval",
  "feedback_translator_assigned",
  "sent_to_feedback_translator",
  "feedback_translating",
  "feedback_translated",
  "complete",
  "collected",
  "resolved",
  "purge_imminent",
  "purged",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * The rungs only a submission needing translation ever touches.
 *
 * Eight of the twenty. A coach who shares a language with the customer takes
 * `assigned → sent_to_coach` and `awaiting_approval → complete` straight
 * through, which is why the ladder is a path with branches and not a progress
 * bar.
 *
 * Declared once because three places ask it — the rail greys them out, the
 * simulator counts them, and the queue folds them into their neighbouring tab.
 * The count in particular used to be a literal `16`, which is the kind of
 * number that stays valid TypeScript forever after it stops being true.
 */
export const TRANSLATION_RUNGS: readonly SubmissionStatus[] = [
  "intake_translator_assigned",
  "sent_to_intake_translator",
  "intake_translating",
  "intake_translated",
  "feedback_translator_assigned",
  "sent_to_feedback_translator",
  "feedback_translating",
  "feedback_translated",
];

/** Statuses the customer-facing flow itself writes. */
export type AppWrittenStatus = Extract<
  SubmissionStatus,
  "draft" | "awaiting_payment" | "new"
>;

/** Statuses that mean money has changed hands. */
/**
 * Has money changed hands by this point?
 *
 * **A Record, not a list, deliberately** — adding a status to
 * `SUBMISSION_STATUSES` without answering this question is now a compile error.
 *
 * It was a list, and that cost us: `awaiting_approval` was added to the
 * lifecycle without being added here, which silently meant a *paid* submission
 * sitting on the admin's desk read as unpaid. Six call sites believe `isPaid`, and
 * two of them act destructively on a `false` — `discardUnpaidSubmission` would
 * have deleted it outright, and `markSubmissionPaid` would have treated a
 * redelivered Stripe webhook as a fresh payment, walking the status backwards
 * over the coach's work and sending a second receipt. Nothing failed loudly;
 * the list just quietly stopped being complete.
 */
const PAID_AT_STATUS: Record<SubmissionStatus, boolean> = {
  draft: false,
  awaiting_payment: false,
  // Everything from `new` onward has been paid for. The ladder only branches
  // after step 4, so every rung added since is trivially true — but the Record
  // makes answering mandatory rather than assumed.
  new: true,
  assigned: true,
  intake_translator_assigned: true,
  sent_to_intake_translator: true,
  intake_translating: true,
  intake_translated: true,
  sent_to_coach: true,
  in_review: true,
  awaiting_approval: true,
  feedback_translator_assigned: true,
  sent_to_feedback_translator: true,
  feedback_translating: true,
  feedback_translated: true,
  complete: true,
  collected: true,
  resolved: true,
  purge_imminent: true,
  purged: true,
};

export const PAID_STATUSES: readonly SubmissionStatus[] =
  SUBMISSION_STATUSES.filter((status) => PAID_AT_STATUS[status]);

export function isPaid(submission: Pick<Submission, "status">): boolean {
  return PAID_AT_STATUS[submission.status];
}

/**
 * Does a coach's response exist yet?
 *
 * True from `awaiting_approval` — the coach has delivered — even though the
 * customer can't see it until the admin releases it. That gap is the whole point of
 * the approval gate, so "a response exists" and "the customer may have it" are
 * two different questions with two different predicates.
 */
const HAS_RESPONSE_AT_STATUS: Record<SubmissionStatus, boolean> = {
  draft: false,
  awaiting_payment: false,
  new: false,
  assigned: false,
  intake_translator_assigned: false,
  sent_to_intake_translator: false,
  intake_translating: false,
  intake_translated: false,
  sent_to_coach: false,
  in_review: false,
  awaiting_approval: true,
  feedback_translator_assigned: true,
  sent_to_feedback_translator: true,
  feedback_translating: true,
  feedback_translated: true,
  complete: true,
  collected: true,
  resolved: true,
  purge_imminent: true,
  purged: true,
};

/** Which side of the pipeline a rung's translation decision belongs to. */
export type TranslationLegSide = "intake" | "feedback" | null;

export function hasResponse(submission: Pick<Submission, "status">): boolean {
  return HAS_RESPONSE_AT_STATUS[submission.status];
}

/**
 * Is a translation decision still live on this submission?
 *
 * Added 2026-08-31 (Ben) to stop a stale amber warning. The admin queue was
 * flagging "Translate the client files first" on a **collected** submission,
 * because the flag was derived from `needsTranslation` alone — a comparison of
 * two language sets, which is true from the moment a coach is assigned and
 * stays true forever. Nothing in it could ever become false, so the warning
 * could only ever be added, never withdrawn.
 *
 * The languages answer *whether* translating is called for. This answers
 * *whether that is still anyone's problem*, which is a question about the
 * ladder and therefore a predicate rather than a comparison (CLAUDE.md §8).
 *
 * True on the two rungs where the choice is open — `assigned` for the intake
 * leg, `awaiting_approval` for the response — and through the rungs where a
 * leg is out and not yet back. False the moment each leg lands: at
 * `intake_translated` the intake decision is settled and the response one has
 * not arisen, so a hint about either would be describing the past or the
 * future rather than the work.
 */
const TRANSLATION_LEG_AT_STATUS: Record<SubmissionStatus, TranslationLegSide> = {
  draft: null,
  awaiting_payment: null,
  // No coach yet, so there is nothing to compare a language against.
  new: null,
  assigned: "intake",
  intake_translator_assigned: "intake",
  sent_to_intake_translator: "intake",
  intake_translating: "intake",
  // The intake leg is home. The response leg's turn has not come.
  intake_translated: null,
  sent_to_coach: null,
  in_review: null,
  awaiting_approval: "feedback",
  feedback_translator_assigned: "feedback",
  sent_to_feedback_translator: "feedback",
  feedback_translating: "feedback",
  feedback_translated: null,
  complete: null,
  collected: null,
  resolved: null,
  purge_imminent: null,
  purged: null,
};

/**
 * **Which** translation leg is open, not merely whether one is.
 *
 * It answered a boolean until 2026-09-03, and the caller then had to pick a
 * direction for itself — which it did once, for the intake leg, and reused at
 * both rungs. So a submission sitting at `awaiting_approval` was warned
 * "translate the client files first" on the strength of the *intake*
 * comparison, describing a leg it had already passed (Ben, QA b2j).
 *
 * The two legs point opposite ways and disagree constantly: a bilingual party
 * gates exactly one of them. Handing back the side removes the caller's
 * opportunity to guess.
 */
export function openTranslationLeg(
  submission: Pick<Submission, "status">,
): TranslationLegSide {
  return TRANSLATION_LEG_AT_STATUS[submission.status];
}

/**
 * May the customer see the response?
 *
 * True from `complete` onward — step 13 is the moment it reaches them, and
 * nothing later takes that back. **This is what `status === "complete"` used to
 * mean**, and the reason it can no longer be written that way: a customer who
 * downloads moves the submission to `collected`, and a literal comparison would
 * have silently revoked their own access the instant they used it.
 *
 * Released is about *permission*, not availability. A `purged` submission is
 * still released; its files are simply gone, which `/api/files/[id]` answers
 * with 410 rather than 404 — "you may have this, but it no longer exists" is a
 * different sentence from "this was never yours".
 */
const RELEASED_AT_STATUS: Record<SubmissionStatus, boolean> = {
  draft: false,
  awaiting_payment: false,
  new: false,
  assigned: false,
  intake_translator_assigned: false,
  sent_to_intake_translator: false,
  intake_translating: false,
  intake_translated: false,
  sent_to_coach: false,
  in_review: false,
  awaiting_approval: false,
  feedback_translator_assigned: false,
  sent_to_feedback_translator: false,
  feedback_translating: false,
  feedback_translated: false,
  complete: true,
  collected: true,
  resolved: true,
  purge_imminent: true,
  purged: true,
};

/**
 * When this submission's files are deleted — the date the sweep is counting to.
 *
 * **The later of the two clocks**, which is the rule the sweep already applies:
 * a submission is purged once it is both `retainCollectedDays` past collection
 * *and* `retainDeliveredDays` past delivery. Taking the later of the two is the
 * same statement read forwards, and reading it forwards is what lets a page say
 * "14 days" instead of "waiting on the retention clock" (Ben, 2026-09-03).
 *
 * Null when neither clock has started — nothing has been delivered, so there is
 * no date to name and a countdown would be inventing one.
 *
 * Pure, so both the operator's panel and the customer's own page can say the
 * same number rather than each doing this arithmetic slightly differently.
 */
export function deletionDueAt(
  submission: Pick<Submission, "collectedAt" | "completedAt">,
  retainCollectedDays: number,
  retainDeliveredDays: number,
): string | null {
  const day = 86_400_000;
  const dates: number[] = [];
  if (submission.collectedAt) {
    dates.push(new Date(submission.collectedAt).getTime() + retainCollectedDays * day);
  }
  if (submission.completedAt) {
    dates.push(new Date(submission.completedAt).getTime() + retainDeliveredDays * day);
  }
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates)).toISOString();
}

/**
 * Whole days from now until that date. Negative means the sweep is overdue,
 * which is worth showing rather than clamping — a backlog is a fact about the
 * cron, and hiding it behind "0 days" is how a stopped sweep stays unnoticed.
 */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function isReleased(submission: Pick<Submission, "status">): boolean {
  return RELEASED_AT_STATUS[submission.status];
}

/**
 * Is this on a coach's desk — theirs to act on?
 *
 * `assigned` is included because the admin may assign before emailing, and the coach
 * seeing it early is harmless. It stops at `awaiting_approval`: once they've
 * delivered, the work is the admin's.
 */
const WITH_COACH_AT_STATUS: Record<SubmissionStatus, boolean> = {
  draft: false,
  awaiting_payment: false,
  new: false,
  assigned: true,
  // Translation happens between assignment and hand-off; the coach has nothing
  // to do yet, but the row is legitimately theirs.
  intake_translator_assigned: true,
  sent_to_intake_translator: true,
  intake_translating: true,
  intake_translated: true,
  sent_to_coach: true,
  in_review: true,
  awaiting_approval: false,
  feedback_translator_assigned: false,
  sent_to_feedback_translator: false,
  feedback_translating: false,
  feedback_translated: false,
  complete: false,
  collected: false,
  resolved: false,
  purge_imminent: false,
  purged: false,
};

export function isWithCoach(submission: Pick<Submission, "status">): boolean {
  return WITH_COACH_AT_STATUS[submission.status];
}

/**
 * Whose court is the ball in?
 *
 * Not the same question as "who is assigned" — a submission can belong to a
 * coach for days while everyone is actually waiting on the admin to approve it, or on
 * a customer to download. The queue's job is to say *who is holding this up*, and
 * the assigned coach is only sometimes the answer.
 *
 * `translator` is a role rather than a person: translation happens off-platform,
 * so nobody in the database is doing it. Naming the role anyway is the point —
 * "waiting on the translator" is actionable in a way "assigned to Yuki" isn't
 * when Yuki hasn't been sent anything yet.
 *
 * `system` means a clock, not a person. Nobody should chase it.
 *
 * A `Record`, so a new rung can't be added without deciding who is waiting.
 */
export type Court = "customer" | "admin" | "coach" | "translator" | "system";

const COURT_AT_STATUS: Record<SubmissionStatus, Court> = {
  // Filling in the form, reading the code, uploading, paying.
  draft: "customer",
  awaiting_payment: "customer",
  // Paid and unassigned — the queue is waiting on the admin to pick someone.
  new: "admin",
  // Assigned, but not yet handed over: still the admin's move, whether that means
  // sending it on or sending it out to be translated.
  assigned: "admin",
  // Emailed. The rung exists to make "told" and "started" visible on the
  // translator side too — the same gap `sent_to_coach` marks for the coach.
  intake_translator_assigned: "translator",
  sent_to_intake_translator: "translator",
  intake_translating: "translator",
  // The translation is back; the hand-off is the admin's again.
  intake_translated: "admin",
  // Emailed. Now genuinely the coach's, and the rung exists to make the
  // difference between "told" and "started" visible.
  sent_to_coach: "coach",
  in_review: "coach",
  // Delivered — nothing reaches the customer until the admin releases it.
  awaiting_approval: "admin",
  feedback_translator_assigned: "translator",
  sent_to_feedback_translator: "translator",
  feedback_translating: "translator",
  feedback_translated: "admin",
  // Released. The clock doesn't start until they collect, so it's their move.
  complete: "customer",
  // Collected — the only thing left is the admin closing it.
  collected: "admin",
  // Closed. Everything after this is a scheduled sweep, not a person.
  resolved: "system",
  purge_imminent: "system",
  purged: "system",
};

export function whoseCourt(submission: Pick<Submission, "status">): Court {
  return COURT_AT_STATUS[submission.status];
}

/**
 * A submission, as the app sees it. `id` is the row's uuid — the app's handle
 * on it and the key every other domain links by. Optional fields are genuinely
 * optional (null in the DB → undefined here).
 */
export interface Submission {
  id: string;

  // Who
  customerEmail: string;
  playerName: string;
  playerAge?: number;
  focus?: Focus;

  // What they told us, and what we tell ourselves
  customerNotes?: string;
  /** What the customer reads. Empty means not declared, not English. */
  languages?: string[];
  internalNotes?: string;

  // Where it is
  status: SubmissionStatus;
  submittedAt?: string;
  completedAt?: string;
  // Set when an operator archives a completed submission — hides it from the
  // active queue ("All") and files it under the Archived view.
  archivedAt?: string;

  // Email verification — the gate on uploading, since payment comes later
  emailVerifiedAt?: string;

  // Payment (Stripe holds the money; we keep the id + amount in cents)
  stripePaymentId?: string;
  stripeAmount?: number;
  paidAt?: string;

  // The coach's response — a storage locator, served via /api/feedback/[id].
  // The customer's own uploads are rows in `submissionFiles`, not a field here.
  feedbackUrl?: string;
  /** What the coach was sent at step 8, and the customer at step 13. */
  coachFileSet?: FileSet;
  customerFileSet?: FileSet;

  // When the retention sweep deleted the customer's uploaded bytes
  filesPurgedAt?: string;

  /*
    Coaching. **Who it's assigned to is deliberately not here** — it's a row in
    `submission_assignment`, reached through `assigneeFor()` or, for a whole
    page at once, the `assignees` on `ProgressFacts`. A submission can owe three
    files to three people; a field here could only ever name one of them.
  */
  feedbackEmailedAt?: string;
  /**
   * Last write of any kind — **what the abandonment sweep measures from.**
   *
   * Surfaced because an operator looking at an unpaid row wants to know how long
   * it has been quiet, and because "gone quiet" is the actual retention rule for
   * anything before payment. It is not the same as `submittedAt`: verifying an
   * email or having a card declined both move it, which is how a customer still
   * working avoids being reaped.
   */
  updatedAt?: string;
  /** First collection — the retention clock's anchor. */
  collectedAt?: string;
  deletionWarnedAt?: string;
}

/** Everything required to open a submission at step 1. */
export interface NewSubmission {
  customerEmail: string;
  playerName: string;
  playerAge?: number;
  focus?: Focus;
  customerNotes?: string;
  languages?: string[];
  status?: SubmissionStatus;
  stripePaymentId?: string;
  stripeAmount?: number;
}

/** Fields the app may update on an existing submission. */
export type SubmissionPatch = Partial<Omit<Submission, "id" | "submittedAt">>;

/**
 * What both language questions offer: one of the two, or both.
 *
 * **Shared by the customer's form and the coach's**, because it feeds one rule
 * that reads both sides — two vocabularies would let the halves drift into
 * spellings that can never intersect.
 *
 * It replaced free entry on each side. A text box can be left empty, and empty
 * is the one input `needsTranslation` can't answer: it returns `null`, and the
 * queue reports a missing declaration instead of routing the submission. Three
 * options with one always selected makes that state unreachable from a form.
 *
 * The cost is that a third language needs a code change rather than typing it
 * into a box. Worth it while `LANGUAGES` is two.
 */
export const LANGUAGE_CHOICES = ["English", "Japanese", "both"] as const;

export type LanguageChoice = (typeof LANGUAGE_CHOICES)[number];

export function languagesForChoice(choice: LanguageChoice): string[] {
  return choice === "both" ? [...LANGUAGES] : [choice];
}

/**
 * Read a posted choice, falling back to the caller's default.
 *
 * The fallback is what makes "nothing" unreachable from the server's side too:
 * a missing or tampered field lands on a real answer rather than writing the
 * empty array the radios exist to prevent. The default differs by side —
 * English for a customer, Japanese for a coach — so it's a parameter, not a
 * constant here.
 */
export function readLanguageChoice(
  value: unknown,
  fallback: LanguageChoice,
): LanguageChoice {
  const given = String(value ?? "");
  return (LANGUAGE_CHOICES as readonly string[]).includes(given)
    ? (given as LanguageChoice)
    : fallback;
}

/**
 * Which radio to preselect for an existing record.
 *
 * Anything the three options can't express — a blank column, or a language we
 * no longer offer — shows as the fallback, and **saving the form would write
 * that over what's there**. Acceptable only because `LANGUAGES` is these two
 * and every existing row was backfilled to one of them.
 */
export function choiceForLanguages(
  languages: readonly string[] | undefined,
  fallback: LanguageChoice,
): LanguageChoice {
  const set = new Set((languages ?? []).map((l) => l.trim().toLowerCase()));
  const en = set.has("english");
  const ja = set.has("japanese");
  if (en && ja) return "both";
  if (en) return "English";
  if (ja) return "Japanese";
  return fallback;
}

/**
 * How each rung reads to a person.
 *
 * Beside the ladder rather than inside a component, because **two surfaces show
 * it**: the queue's pill and the trail underneath it. When they came from
 * different places the same rung read two ways on one screen — the pill saying
 * one thing and the breadcrumb below it saying `awaiting_payment`.
 *
 * Exhaustive over the enum, so a new rung is a compile error here too.
 *
 * One word each, so twenty of them read as one process rather than twenty
 * sentences. The rung says *where*; the line under it says what's owed.
 */
/*
  One word per rung, and it must be true of the rung it names.

  5 and 12 read "Sent" until 2026-08-31 (Ben), which they are not: a translator
  has been *chosen* there and nothing has gone out. The email is 6 and 13. So
  the rail read "Sent · Sent" across a pair where only the second had sent
  anything, and there was no way to tell from it whether a translator had
  actually been emailed.

  That is the same failure that let ⑩ go missing for weeks — a name asserting a
  send nobody had written. It is worth being strict about here for the same
  reason: these labels are what an admin reads instead of the trail.

  Participles throughout, never imperatives (`_NomenclatureLaw.md` §2). "Send"
  would say the right thing about 5 and be the only instruction in a list of
  states; "Chosen" says it in the list's own grammar. Sharing a word across the
  two legs is deliberate and unchanged — position carries the difference on the
  rail, and `numberedRungLabel` restores it everywhere else.
*/
export const RUNG_LABEL: Record<SubmissionStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Upload",
  new: "New",
  assigned: "Assigned",
  intake_translator_assigned: "Chosen",
  sent_to_intake_translator: "Sent",
  intake_translating: "Translating",
  intake_translated: "Translated",
  sent_to_coach: "Sent",
  in_review: "Reviewing",
  awaiting_approval: "Submitted",
  feedback_translator_assigned: "Chosen",
  sent_to_feedback_translator: "Sent",
  feedback_translating: "Translating",
  feedback_translated: "Translated",
  complete: "Delivered",
  collected: "Collected",
  resolved: "Resolved",
  purge_imminent: "Deleting",
  purged: "Purged",
};

/**
 * The label with its position, for a flat list.
 *
 * **Four rungs share two names** — a submission translates twice, once each
 * way, and "Translating" is the honest word both times. On the rail that reads
 * fine because position carries the difference; in a dropdown it is two
 * identical options. The number restores what the rail shows spatially.
 */
export function numberedRungLabel(status: SubmissionStatus): string {
  return `${SUBMISSION_STATUSES.indexOf(status) + 1} · ${RUNG_LABEL[status]}`;
}
