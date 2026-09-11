import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TranslatorLeg } from "@/domains/translation";
import type { Submission } from "@/domains/submission";

/**
 * QA 7.6/7.7 — one card per submission, with each leg named inside it.
 *
 * 7.6 used to read "**two cards**, not one". It was rewritten on 2026-09-10:
 * one card per submission, ordered by date, across all three portals (Ben). The
 * substance of the old check survives — a translator holding both legs must
 * still be able to tell them apart, and only the leg matching the current rung
 * is actionable — but it is now asserted *within* the card rather than between
 * two of them.
 *
 * The upload widget is a client component with a router hook, so it is stubbed:
 * what is under test is what the card *says*, not what the uploader does.
 */
vi.mock("@/domains/translation", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  TranslationUpload: () => null,
}));

const { TranslationCard } = await import("@/app/translator/TranslationCard");
const { groupBySubmission } = await import("@/app/translator/page");
const { LEGS } = await import("@/domains/translation/model/translationLeg");

/*
  The rung matters now. A leg that isn't open is either finished or **not yet
  sent**, and the card tells those apart by reading `submission.status` — so a
  mock without one silently renders the waiting state (Ben, QA 6.18).
*/
const submission = (
  status = "sent_to_intake_translator",
  id = "s1",
  submittedAt = "2026-09-01T00:00:00.000Z",
) =>
  ({
    id,
    status,
    playerName: id === "s1" ? "Noy Noy" : "Other Kid",
    playerAge: 11,
    focus: "Hitting",
    customerNotes: "Back elbow drops.",
    submittedAt,
  }) as unknown as Submission;

const leg = (produces: string, open = true, s = submission()): TranslatorLeg =>
  ({
    submission: s,
    leg: LEGS.find((l) => l.produces === produces)!,
    source: [],
    produced: [],
    open,
  }) as unknown as TranslatorLeg;

/** The two legs of one submission, each open or not according to the rung. */
const legsAt = (status: string): TranslatorLeg[] => {
  const s = submission(status);
  return LEGS.map(
    (l) =>
      ({
        submission: s,
        leg: l,
        source: [],
        produced: [],
        open: l.sent === status || l.working === status,
      }) as unknown as TranslatorLeg,
  );
};

const title = (produces: string) =>
  LEGS.find((l) => l.produces === produces)!.title;

/*
  Decoded, because the titles carry an apostrophe and the markup escapes it.
  Asserting against `&#x27;` would be testing the HTML serializer rather than
  the copy.
*/
const render = (legs: TranslatorLeg[]) =>
  renderToStaticMarkup(
    <TranslationCard
      submission={legs[0].submission}
      legs={legs}
      uploadMode="proxy"
      maxFileSizeMb={10}
      handedBackAt={{}}
    />,
  )
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

describe("TranslationCard", () => {
  it("7.7 names the submission once, and each leg under it", () => {
    const html = render([leg("intake_translation")]);
    expect(html).toContain(title("intake_translation"));
    expect(html.match(/Noy Noy/g)).toHaveLength(1);
    expect(html.indexOf("Noy Noy")).toBeLessThan(
      html.indexOf(title("intake_translation")),
    );
  });

  /*
    The reason the titles matter: on one card carrying both legs, the player's
    name identifies neither. This is what the old two-card check was protecting,
    and it has to keep holding now that the two are siblings on one card.
  */
  it("7.6 puts both legs of one submission on one card, told apart", () => {
    const html = render(legsAt("sent_to_feedback_translator"));
    expect(html).toContain(title("intake_translation"));
    expect(html).toContain(title("feedback_translation"));
    // One card, one name — the duplicate entry this replaced said it twice.
    expect(html.match(/Noy Noy/g)).toHaveLength(1);
    // Pipeline order: the customer's files out, then the coach's response back.
    expect(html.indexOf(title("intake_translation"))).toBeLessThan(
      html.indexOf(title("feedback_translation")),
    );
  });

  it("7.6 shows the finished leg as a receipt and the open one as work", () => {
    const html = render(legsAt("sent_to_feedback_translator"));
    expect(html).toContain("Handed back");
    expect(html).toContain("files to translate");
    // The badge speaks for the card: something here still wants action.
    expect(html).toContain("To translate");
  });

  it("marks a card whose every leg is done as handed back", () => {
    const html = render(legsAt("feedback_translated"));
    expect(html).not.toContain("To translate");
    expect(html).toContain("Handed back ✓");
  });

  it("carries the customer's own notes, as context for the words", () => {
    expect(render([leg("intake_translation")])).toContain("Back elbow drops.");
  });
});

describe("6.18 — a leg that was picked but never sent", () => {
  /*
    `open` is false both before the hand-off and after the hand-back, and the
    card read that single flag as "finished". So a translator the admin had
    merely *chosen* saw **Handed back ✓** over a receipt for files they had
    never been given (Ben, 2026-09-11).
  */
  it("is not called handed back", () => {
    const html = render(legsAt("intake_translator_assigned"));
    expect(html).not.toContain("Handed back");
    expect(html).not.toContain("To translate");
    expect(html).toContain("Assigned to you");
  });

  it("offers no upload and no files, and says whose move it is", () => {
    const html = render(legsAt("intake_translator_assigned"));
    expect(html).not.toContain("files to translate");
    expect(html).toContain("hasn’t sent this leg over yet");
  });

  /*
    The feedback leg spends most of its life waiting on somebody else, and the
    two waits read differently: the admin hasn't sent it, or the coach hasn't
    written it yet. `whoseCourt` is what tells them apart.
  */
  it("names the coach when that is who it is waiting on", () => {
    const html = render(legsAt("in_review"));
    expect(html).toContain("The coach is still writing their response");
  });

  it("still shows the finished leg as a receipt beside a waiting one", () => {
    const html = render(legsAt("intake_translated"));
    // Intake is done; feedback has not been sent.
    expect(html).toContain("Handed back");
    expect(html).toContain("hasn’t sent this leg over yet");
    // …but the card as a whole is not finished.
    expect(html).not.toContain("Handed back ✓");
  });
});

describe("groupBySubmission", () => {
  it("7.6 collapses a submission's legs onto one card", () => {
    const cards = groupBySubmission([
      leg("feedback_translation", false),
      leg("intake_translation", false),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].legs).toHaveLength(2);
  });

  it("orders the legs by the pipeline, whatever order they arrived in", () => {
    const cards = groupBySubmission([
      leg("feedback_translation", false),
      leg("intake_translation", false),
    ]);
    expect(cards[0].legs.map((l) => l.leg.produces)).toEqual(
      LEGS.map((l) => l.produces),
    );
  });

  /*
    Card order is the query's, not a sort here — `legsForTranslator` already
    orders `submittedAt` descending, and a second opinion could disagree with
    the first. What this asserts is that grouping *preserves* it, including when
    a submission's two legs are not adjacent in the input.
  */
  it("keeps the query's newest-first order across interleaved legs", () => {
    const newer = submission("sent_to_intake_translator", "s1", "2026-09-05T00:00:00.000Z");
    const older = submission("sent_to_intake_translator", "s2", "2026-08-01T00:00:00.000Z");
    const cards = groupBySubmission([
      leg("intake_translation", false, newer),
      leg("intake_translation", false, older),
      leg("feedback_translation", true, newer),
    ]);
    expect(cards.map((c) => c.submission.id)).toEqual(["s1", "s2"]);
    expect(cards[0].legs).toHaveLength(2);
  });
});
