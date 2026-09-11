import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Submission, SubmissionStatus } from "@/domains/submission";

/**
 * QA 6.18 — the coach's card has three states, not two.
 *
 * A submission is **theirs** from `assigned` and **workable** from
 * `sent_to_coach`, and the card used to collapse those: an assigned-but-unsent
 * submission rendered the customer's originals and a live hand-back form, on
 * work the server would then refuse. Most often it was unsent because it was
 * still being translated — so the files on offer were exactly the ones the
 * translation existed to replace (Ben, 2026-09-11).
 *
 * The upload widget is a client component with a router hook, so it is stubbed:
 * what is under test is what the card *says* and *offers*, not what the
 * uploader does.
 */
vi.mock("@/domains/feedback", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  FeedbackUpload: () => null,
}));

const { ReviewCard } = await import("@/app/coach/ReviewCard");
const { isWithCoach, isHandedToCoach, hasResponse } = await import(
  "@/domains/submission"
);

const EMPTY = {
  intake: [],
  intake_translation: [],
  feedback: [],
  feedback_translation: [],
};

const submission = (status: SubmissionStatus) =>
  ({
    id: "s1",
    status,
    playerName: "Noy Noy",
    playerAge: 11,
    focus: "Hitting",
    customerNotes: "Back elbow drops.",
    submittedAt: "2026-09-01T00:00:00.000Z",
  }) as unknown as Submission;

/** The state the page derives, reproduced here so the two cannot disagree. */
const stateOf = (s: Submission) =>
  isWithCoach(s) && isHandedToCoach(s)
    ? "review"
    : hasResponse(s)
      ? "done"
      : "waiting";

const render = (status: SubmissionStatus) => {
  const s = submission(status);
  return renderToStaticMarkup(
    <ReviewCard
      submission={s}
      state={stateOf(s)}
      files={[]}
      uploadMode="proxy"
      maxFileSizeMb={10}
      feedbackFiles={[]}
      folders={EMPTY}
    />,
  )
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
};

describe("6.18 — assigned but not yet sent", () => {
  it("offers no files and no hand-back form", () => {
    const html = render("assigned");
    expect(html).not.toContain("to review");
    expect(html).not.toContain("Files deleted");
    expect(html).toContain("Assigned to you");
  });

  it("says the admin still has it", () => {
    expect(render("assigned")).toContain("hasn’t sent this one over yet");
  });

  /*
    The common cause, and the one that reads completely differently to a coach:
    nobody is late, it is out being translated. `whoseCourt` is what tells the
    two apart, so a new rung cannot fall into the wrong sentence.
  */
  it("says so when it is out being translated", () => {
    for (const status of [
      "intake_translator_assigned",
      "sent_to_intake_translator",
      "intake_translating",
    ] as const) {
      expect(render(status)).toContain("being translated first");
    }
  });

  it("still names the player, so the coach knows what is coming", () => {
    const html = render("intake_translating");
    expect(html).toContain("Noy Noy");
    expect(html).toContain("Back elbow drops.");
  });

  it("is not dressed as work — the badge is quiet, not the accent", () => {
    const html = render("assigned");
    expect(html).not.toContain("To review");
    expect(html).not.toContain("text-accent");
  });
});

describe("6.18 — once the admin sends it", () => {
  it("becomes work at sent_to_coach", () => {
    const html = render("sent_to_coach");
    expect(html).toContain("To review");
    expect(html).toContain("files to review");
    expect(html).not.toContain("Assigned to you");
  });

  it("stays work while in review", () => {
    expect(render("in_review")).toContain("files to review");
  });

  /*
    And the hand-back is still a receipt afterwards — the state the coach's own
    history is made of.
  */
  it("becomes a receipt once handed back", () => {
    const html = render("awaiting_approval");
    expect(html).toContain("Handed back");
    expect(html).toContain("Awaiting review");
    expect(html).not.toContain("files to review");
  });

  it("says delivered once the customer can see it", () => {
    expect(render("complete")).toContain("Delivered ✓");
  });
});
