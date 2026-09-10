import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageColumn, pageTitleClass } from "@/shared/ui/PageColumn";

/**
 * QA 8.9.5 / 8.9.6 / 8.9.18 — how every page a person reads behaves under a
 * drag: the three customer pages and both portals, which share this shell.
 *
 * **The rule is that nothing moves continuously.** A `vw` term gives a
 * different value at every pixel of window width, and for type that is visible:
 * the browser re-rasterises glyphs at each fractional size and em-based
 * tracking shifts with it, so the heading shivers and the line box drags the
 * page below it up and down. Two fixed sizes with one step at `sm` cannot do
 * that.
 *
 * This replaced two earlier attempts, both of which were arithmetic about how
 * *far* the fluid range should run. The range was never the problem.
 */
const shell = () => {
  const html = renderToStaticMarkup(<PageColumn>x</PageColumn>);
  return html.match(/<section class="([^"]*)"/)![1];
};

describe("nothing scales with the viewport", () => {
  it("the shell has no vw term, and no clamp", () => {
    expect(shell()).not.toMatch(/vw|clamp\(/);
  });

  it("the title has no vw term, and no clamp", () => {
    expect(pageTitleClass).not.toMatch(/vw|clamp\(/);
  });

  /*
    The column itself is the third thing that could move. It is capped with a
    constant gutter, so it grows to the cap and holds — never narrows, and never
    interpolates.
  */
  it("the column grows to its cap and holds", () => {
    const widths = [320, 375, 500, 639, 640, 800, 808, 1024, 1440, 2560].map(
      (w) => Math.min(768, w - 2 * 20),
    );
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]!);
    }
    expect(widths.at(-1)).toBe(768);
  });
});

describe("two states, and only two", () => {
  it("steps the padding once, at sm", () => {
    const s = shell();
    expect(s).toContain("py-10");
    expect(s).toContain("sm:py-14");
  });

  it("steps the type once, at the same place", () => {
    expect(pageTitleClass).toContain("text-3xl");
    expect(pageTitleClass).toContain("sm:text-4xl");
  });

  /*
    The endpoints are the ones the clamp used to interpolate between — 40/56px
    of padding and 30/36px of type — so this is the same page at both ends of
    the range, without the journey between them.
  */
  it("keeps the sizes the fluid version reached", () => {
    // Tailwind: py-10 = 2.5rem = 40px, py-14 = 3.5rem = 56px,
    //           text-3xl = 1.875rem = 30px, text-4xl = 2.25rem = 36px.
    expect(shell()).toMatch(/py-10\b/);
    expect(shell()).toMatch(/sm:py-14\b/);
    expect(pageTitleClass).toMatch(/text-3xl\b/);
    expect(pageTitleClass).toMatch(/sm:text-4xl\b/);
  });
});
