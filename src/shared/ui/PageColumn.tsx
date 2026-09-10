import type { ReactNode } from "react";
import { Container } from "./Container";

/**
 * The column every page a *person* reads sits in — customer and operator alike.
 *
 * One rule for five pages: `/status`, the signed status link, the ⑥ feedback
 * link, the coach's portal and the translator's. They were on two widths and
 * two mechanisms, which is the state this replaces (Ben, 2026-09-10).
 *
 * ── What it stopped being ───────────────────────────────────────────────────
 *
 * `PageColumn` computed a column *and* the vertical rhythm, at `max-w-xl`. The
 * portals used `Container` with `max-w-3xl`, which computes a column too. So
 * the same job was done twice, at two widths, and the portal layouts added a
 * fixed `py-8` on top — vertical spacing from two places at once.
 *
 * Now: `Container` is the only thing that computes a column, this is the only
 * thing that spaces it, and the layouts space nothing. **768px, the width the
 * portals already had and the one that was preferred on sight.**
 *
 * ── Two sizes, not a continuum ──────────────────────────────────────────────
 *
 * **Nothing here scales with `vw`.** It used to: the padding and the title were
 * both `clamp(… + Nvw …)`, which gives a different value at every pixel of
 * window width — 34.57px of type at 700, 34.62px at 701.
 *
 * That reads as broken even though every value is correct. The browser
 * re-rasterises glyphs at each fractional size and `tracking-tight` is em-based,
 * so the letters shiver and the line box changes height, and the whole page
 * below the heading drifts up and down as you drag (Ben, 2026-09-10). Motion
 * with no cause a reader can see is worse than a step they can.
 *
 * So: one step at `sm`, at the endpoints the clamps already had — 40/56px of
 * padding, 30/36px of type. Below 640 it is one fixed page, above it another,
 * and neither moves. A single deliberate change at a breakpoint is what QA
 * 8.9.6 was warning against, and it was right about the *column* — a column
 * that narrows as the window widens is a fault. It is wrong about type, which
 * is the lesson that took three attempts to find.
 */
export function PageColumn({ children }: { children: ReactNode }) {
  return (
    <section className="py-10 sm:py-14">
      <Container className="max-w-3xl">{children}</Container>
    </section>
  );
}

/**
 * The page title — two sizes, the same two the clamp used to interpolate
 * between, and no interpolation. See above: fluid type shivers.
 */
export const pageTitleClass =
  "text-3xl sm:text-4xl font-bold tracking-tight text-ink";
