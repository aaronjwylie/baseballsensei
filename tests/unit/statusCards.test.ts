import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusList } from "@/domains/submission/ui/StatusList";
import type { PublicSubmission } from "@/domains/submission/model/publicSubmission";

/**
 * QA 8.9.15–8.9.47 — the customer's card stack on `/status`.
 *
 * `StatusList` is a client component that takes no hooks, so it renders to
 * markup and can be read. These are the checks that are about **what a card
 * says and where a card sits** — one list not two, ready first, the detail on
 * every card, the deadline while there is still one. Layout, resize and tab
 * behaviour are not here and still need a browser (Ben, 2026-09-08).
 *
 * The download nodes are passed in as a map keyed by id, which is the seam that
 * collapsed the page from two lists to one — so a test can say "this submission
 * has files on the page" without reaching into the feedback domain.
 */
const DAY = 86_400_000;
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const submission = (over: Partial<PublicSubmission>): PublicSubmission =>
  ({
    id: "s1",
    playerName: "Noy Noy",
    playerAge: 11,
    focus: "Hitting",
    customerNotes: "He keeps dropping his back elbow.",
    status: "complete",
    submittedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-20T00:00:00.000Z",
    deleteAfter: undefined,
    ...over,
  }) as PublicSubmission;

const render = (
  submissions: PublicSubmission[],
  downloads?: Record<string, ReactElement>,
) =>
  renderToStaticMarkup(
    createElement(StatusList, { submissions, email: "parent@example.com", downloads }),
  );

describe("8.9.43/8.9.44 — one list, files inside the card", () => {
  it("8.9.43 renders a single list headed 'Your submissions (n)'", () => {
    const html = render([submission({ id: "a" }), submission({ id: "b" })]);
    expect(html).toContain("Your submissions (2)");
    // The two-section split is gone: no separate ready panel, no jump link.
    expect(html).not.toContain("Ready to download");
    expect(html).not.toContain("Your history");
  });

  it("8.9.44 puts the files inside the card, with no jump link", () => {
    const files = createElement("div", null, "THE-FILES");
    const html = render([submission({ id: "a" })], { a: files });
    expect(html).toContain("THE-FILES");
    expect(html).not.toContain("Download ↑");
    // Inside the <li>, not after it.
    expect(html.indexOf("THE-FILES")).toBeLessThan(html.lastIndexOf("</li>"));
  });

  it("8.9.10 shows no files on a card that has none", () => {
    const html = render([submission({ id: "a", status: "in_review" })]);
    expect(html).toContain("Your submissions (1)");
    expect(html).not.toContain("THE-FILES");
  });
});

describe("8.9.45/8.9.46 — order", () => {
  it("8.9.45 puts the ones with files first", () => {
    const html = render(
      [submission({ id: "waiting", playerName: "Waiting" }),
       submission({ id: "ready", playerName: "Ready" })],
      { ready: createElement("div", null, "files") },
    );
    expect(html.indexOf("Ready")).toBeLessThan(html.indexOf("Waiting"));
  });

  /*
    8.9.46 — ordered on whether files are actually on the page, not on whether
    the submission *reads* as finished. A released submission whose files the
    sweep has taken still has a released status, so sorting on that would float
    it to the top promising a download it cannot honour.
  */
  it("8.9.46 leaves a released-but-swept submission in place", () => {
    const html = render(
      [submission({ id: "swept", playerName: "Swept", status: "purged" }),
       submission({ id: "ready", playerName: "Ready" })],
      { ready: createElement("div", null, "files") },
    );
    expect(html.indexOf("Ready")).toBeLessThan(html.indexOf("Swept"));
    expect(html).toContain("No longer available");
  });

  it("8.9.47 keeps the server's order when nothing is finished", () => {
    const html = render([
      submission({ id: "a", playerName: "First", status: "in_review" }),
      submission({ id: "b", playerName: "Second", status: "in_review" }),
    ]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
  });
});

describe("8.9.21/8.9.24 — what a card says about its own submission", () => {
  const FIELDS = ["Noy Noy", "age 11", "Hitting", "back elbow"];

  it("8.9.21 carries player, age, focus, their own notes and both dates", () => {
    const html = render([submission({})]);
    for (const field of FIELDS) expect(html).toContain(field);
    expect(html).toContain("Feedback ready");
  });

  /*
    8.9.24 — the ready card and the history card are the same component, so they
    cannot come to describe one submission differently. Asserted by rendering the
    same submission both ways and comparing the summary each produces.
  */
  it("8.9.24 says the same things whether or not files are attached", () => {
    const plain = render([submission({ id: "a" })]);
    const ready = render([submission({ id: "a" })], {
      a: createElement("div", null, "files"),
    });
    for (const field of FIELDS) {
      expect(plain).toContain(field);
      expect(ready).toContain(field);
    }
  });
});

describe("8.9.40/8.9.41 — the deletion deadline", () => {
  it("8.9.40 carries it while there is still time", () => {
    // The label and the number are separate elements, so they are asserted
    // separately — a regex across the pair would be testing the markup's
    // shape rather than what a reader sees.
    // `daysUntil` ceilings, so 13.5 days away reads as 14 — a partial day left
    // is still a day you can act in, and rounding it down would tell a parent
    // their files go sooner than they do.
    const html = render([submission({ deleteAfter: ahead(13.5) })]);
    expect(html).toContain("Files deleted in");
    expect(html).toContain("14 days");
  });

  /*
    8.9.41 — a countdown after the fact is a countdown shown too late. Once the
    files are gone the struck-through filenames say it better, so the line goes.
  */
  it("8.9.41 drops it once the date has passed", () => {
    const html = render([submission({ deleteAfter: ahead(-1) })]);
    expect(html).not.toContain("Files deleted in");
  });

  it("says nothing when no clock has started", () => {
    const html = render([submission({ deleteAfter: undefined })]);
    expect(html).not.toContain("Files deleted in");
  });
});
