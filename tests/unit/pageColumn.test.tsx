import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageColumn, pageTitleClass } from "@/shared/ui/PageColumn";

/**
 * QA 8.9.5 / 8.9.6 / 8.9.18 — how every page a person reads behaves under a
 * drag: the three customer pages and both portals, which share one shell.
 *
 * The rule these hold down: **vertical rhythm stops scaling where the column
 * stops growing.** The column caps at `max-w-xl` (576px) plus `px-5` either
 * side, so 616px of viewport is the last width that changes anything a reader
 * can see. A clamp that keeps climbing past it slides the whole page up and
 * down while nothing else moves, which reads as a fault because there is no
 * visible cause for it.
 *
 * Solved rather than eyeballed, so it is worth asserting: an eyeballed value
 * drifts back the next time someone thinks the page looks tight.
 */
const COLUMN_CAPS_AT = 808;  // max-w-3xl (768) + px-5 either side

/** `clamp(<min>rem, <a>rem + <b>vw, <max>rem)` → px at a given viewport. */
function evaluate(clamp: string, viewport: number): number {
  const m = clamp.match(
    /clamp\(([\d.]+)rem,([\d.]+)rem\+([\d.]+)vw,([\d.]+)rem\)/,
  );
  if (!m) throw new Error(`not a clamp this test understands: ${clamp}`);
  const [min, a, b, max] = m.slice(1).map(Number) as [number, number, number, number];
  return Math.max(min * 16, Math.min(max * 16, a * 16 + (b / 100) * viewport));
}

const clampIn = (source: string) => {
  const m = source.match(/clamp\([^)]*\)/);
  if (!m) throw new Error("no clamp found");
  return m[0].replace(/\s/g, "");
};

const paddingClamp = clampIn(
  renderToStaticMarkup(<PageColumn>x</PageColumn>),
);
const titleClamp = clampIn(pageTitleClass);

describe.each([
  ["vertical padding", paddingClamp],
  ["page title", titleClamp],
])("%s", (_label, clamp) => {
  it("still grows below the cap", () => {
    expect(evaluate(clamp, 375)).toBeLessThan(evaluate(clamp, 500));
    expect(evaluate(clamp, 500)).toBeLessThan(evaluate(clamp, 700));
    expect(evaluate(clamp, 700)).toBeLessThanOrEqual(evaluate(clamp, COLUMN_CAPS_AT));
  });

  /*
    The whole point. Past the cap the column is fixed, so a drag from 900 to
    1440 must move nothing at all.
  */
  it("is flat once the column has capped", () => {
    // At the cap it is already at its ceiling — asserted against the clamp's
    // own max rather than against its value there, so "flat" cannot be true by
    // a rounding accident.
    const max = Number(clamp.match(/,([\d.]+)rem\)$/)![1]) * 16;
    expect(evaluate(clamp, COLUMN_CAPS_AT)).toBe(max);
    // Derived from the cap, not listed: a hard-coded sample silently stops
    // testing the rule the moment the cap moves, which is exactly what happened
    // when the column went from 576 to 768.
    for (const wider of [COLUMN_CAPS_AT + 1, 1000, 1200, 1440, 2560]) {
      expect(evaluate(clamp, wider)).toBe(max);
    }
  });

  it("has no step in it — continuous, so nothing snaps at a breakpoint", () => {
    let previous = evaluate(clamp, 320);
    for (let w = 321; w <= COLUMN_CAPS_AT; w += 1) {
      const next = evaluate(clamp, w);
      expect(next - previous).toBeLessThan(1);
      previous = next;
    }
  });
});
