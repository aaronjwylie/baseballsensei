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
