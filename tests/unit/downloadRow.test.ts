import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackDownloadRow } from "@/domains/feedback/ui/FeedbackDownloadRow";

/**
 * QA 8.8 / 8.9 / 8.9.4 — the customer's Download control.
 *
 * `target="_blank"` opened a tab and shut it again on every download, because
 * the route answers `Content-Disposition: attachment` and there was never
 * anything to show in it. Dropping the target alone was not enough: the control
 * was a `ButtonLink`, which wraps `next/link`, and `next/link` intercepts an
 * internal href for client-side navigation — it had been skipping this one
 * *only* because `target` was set. So the fix is a plain `<a>`, and both halves
 * of it need holding down.
 */
const row = (over: Partial<Parameters<typeof FeedbackDownloadRow>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(FeedbackDownloadRow, {
      fileId: "f1",
      filename: "review.mp4",
      sizeBytes: 2048,
      ...over,
    }),
  );

describe("the Download control", () => {
  it("8.8/8.9.4 opens no tab", () => {
    expect(row()).not.toContain("_blank");
  });

  /*
    8.9 — the anchor must stay plain. A `next/link` would intercept the href and
    route it client-side, which is the failure the removed `target` was hiding.
  */
  it("8.9 is a plain anchor with a download attribute", () => {
    const html = row();
    expect(html).toContain('href="/api/feedback/f1"');
    expect(html).toContain('download="review.mp4"');
    // next/link stamps its own attributes; a plain <a> carries none.
    expect(html).not.toContain("data-prefetch");
  });

  it("carries the name and the size", () => {
    const html = row();
    expect(html).toContain("review.mp4");
    expect(html).toContain("2.0 KB");
  });
});

/**
 * QA 8.9.1 / 8.9.2 — two files, one row shape.
 *
 * This is a layout check and a test cannot see layout. What it *can* see is the
 * mechanism, and the mechanism is the whole finding: the list was `flex-wrap`,
 * so a long filename pushed its own Download button onto a second line and two
 * files in one list looked like two different designs.
 *
 * So the assertions are the four things that keep the row one line — nothing
 * wraps, the name is the only thing allowed to give way, and the two items to
 * its right refuse to shrink. Seeing it is still worth doing; this stops it
 * silently coming undone between times.
 */
describe("8.9.1 — one row shape, whatever the name", () => {
  const SHORT = "clip.mp4";
  const LONG =
    "a-really-very-long-filename-that-would-once-have-pushed-the-button-onto-its-own-line.mp4";

  it("gives a short and a long name the identical row", () => {
    const short = row({ filename: SHORT });
    const long = row({ filename: LONG });
    // Identical but for the name itself, which appears twice: as text and in
    // the `download` attribute.
    expect(long.split(LONG).join("«name»")).toBe(short.split(SHORT).join("«name»"));
  });

  it("never wraps", () => {
    expect(row({ filename: LONG })).not.toContain("flex-wrap");
  });

  /*
    8.9.2 — the name is the only thing that gives way. `truncate` needs
    `min-w-0` to do anything inside a flex child, so both are the assertion.
  */
  it("truncates the name and nothing else", () => {
    const html = row({ filename: LONG });
    expect(html).toMatch(/min-w-0[^"]*truncate|truncate[^"]*min-w-0/);
  });

  it("holds the size and the button at full width", () => {
    const html = row({ filename: LONG, sizeBytes: 2048 });
    // Two shrink-0 items to the right of the name: the size and the button.
    expect(html.match(/shrink-0/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
