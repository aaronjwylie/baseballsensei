import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TranslatorLeg } from "@/domains/translation";

/**
 * QA 7.7 — the card names its direction, above the player's name.
 *
 * The upload widget is a client component with a router hook, so it is stubbed:
 * what is under test is what the card *says*, not what the uploader does.
 */
vi.mock("@/domains/translation", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  TranslationUpload: () => null,
}));

const { TranslationCard } = await import("@/app/translator/TranslationCard");
const { LEGS } = await import("@/domains/translation/model/translationLeg");

const leg = (produces: string): TranslatorLeg =>
  ({
    submission: {
      id: "s1",
      playerName: "Noy Noy",
      playerAge: 11,
      focus: "Hitting",
      customerNotes: "Back elbow drops.",
    },
    leg: LEGS.find((l) => l.produces === produces)!,
    source: [],
    produced: [],
    open: true,
  }) as unknown as TranslatorLeg;

/*
  Decoded, because the titles carry an apostrophe and the markup escapes it.
  Asserting against `&#x27;` would be testing the HTML serializer rather than
  the copy.
*/
const render = (produces: string) =>
  renderToStaticMarkup(
    <TranslationCard work={leg(produces)} uploadMode="proxy" maxFileSizeMb={10} />,
  )
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

describe("TranslationCard", () => {
  it("7.7 puts the direction above the player's name", () => {
    const html = render("intake_translation");
    const title = LEGS.find((l) => l.produces === "intake_translation")!.title;
    expect(html).toContain(title);
    expect(html).toContain("Noy Noy");
    expect(html.indexOf(title)).toBeLessThan(html.indexOf("Noy Noy"));
  });

  /*
    The reason the order matters: hold both legs of one submission and the
    player's name identifies neither. This is the open-desk twin of the bug that
    made the finished list read as a duplicate.
  */
  it("7.7 tells the two legs of one submission apart", () => {
    const intake = render("intake_translation");
    const feedback = render("feedback_translation");
    expect(intake).not.toBe(feedback);
    for (const [a, b] of [
      ["intake_translation", "feedback_translation"],
      ["feedback_translation", "intake_translation"],
    ]) {
      const mine = LEGS.find((l) => l.produces === a)!.title;
      const theirs = LEGS.find((l) => l.produces === b)!.title;
      expect(render(a)).toContain(mine);
      expect(render(a)).not.toContain(theirs);
    }
  });

  it("carries the customer's own notes, as context for the words", () => {
    expect(render("intake_translation")).toContain("Back elbow drops.");
  });
});
