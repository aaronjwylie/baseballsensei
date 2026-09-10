import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Container } from "@/shared/ui/Container";

/**
 * QA 8.9.18 — the site container, and the two faults that came of one box
 * doing both jobs.
 *
 * The rule this holds down is the same one the vertical rhythm follows: a
 * column grows until it caps and then holds. It must never narrow as the window
 * widens, and a cap the caller asked for must never lose a race to the default.
 */
const render = (className?: string) =>
  renderToStaticMarkup(<Container className={className}>x</Container>);

/** The capped branch has one gutter at every width; the uncapped one steps. */
const CAPPED_GUTTER = 20;
const steppedGutter = (w: number) => (w < 640 ? 20 : w < 1024 ? 32 : 60);

describe("uncapped — the landing page's geometry, deliberately untouched", () => {
  it("keeps one box with the padding inside the cap", () => {
    const html = render("relative flex");
    expect(html).toContain("max-w-[1400px]");
    // One div, not a wrapper pair.
    expect(html.match(/<div/g)).toHaveLength(1);
    expect(html).toContain("px-5");
  });
});

describe("capped — the portals and the narrow pages", () => {
  it("does not emit the default cap, so the caller's cannot lose a race", () => {
    const html = render("max-w-3xl");
    expect(html).not.toContain("max-w-[1400px]");
    expect(html).toContain("max-w-3xl");
  });

  it("puts the padding outside the cap", () => {
    const html = render("max-w-3xl");
    const outer = html.slice(0, html.indexOf("max-w-3xl"));
    // The gutter is on the wrapper, constant, and the capped box carries none.
    expect(outer).toContain("px-5");
    expect(outer).not.toContain("sm:px-8");
    expect(html.match(/<div/g)).toHaveLength(2);
  });

  /*
    The arithmetic that follows from that, and the whole point: with padding
    outside, content is min(cap, viewport - gutters) — monotonic, and flat once
    capped. Inside the cap it was `cap - gutters`, which *fell* at every
    breakpoint.
  */
  it("never narrows as the window widens", () => {
    for (const cap of [384, 448, 576, 672, 768]) {
      const widths = [375, 500, 639, 640, 800, 1023, 1024, 1200, 1440].map((w) =>
        Math.min(cap, w - 2 * CAPPED_GUTTER),
      );
      for (let i = 1; i < widths.length; i += 1) {
        expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]!);
      }
      // And it settles, rather than growing forever.
      expect(widths.at(-1)).toBe(cap);
    }
  });

  it("the old shape did narrow — which is why this test exists", () => {
    // cap - gutters, the arrangement before 2026-09-10.
    const old = [639, 640, 1023, 1024].map((w) => 576 - 2 * steppedGutter(w));
    expect(old).toEqual([536, 512, 512, 456]);
    expect(old[1]).toBeLessThan(old[0]!);
  });
});
