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
 * ── Why the ceilings are where they are ─────────────────────────────────────
 *
 * **Vertical rhythm stops where the column stops.** The column caps at
 * `max-w-3xl` plus `px-5` either side — 808px of viewport — so both clamps are
 * solved to reach their ceiling at 800px and hold. Past that, widening changes
 * nothing a reader can see, and spacing that keeps moving anyway slides the
 * page up and down with no visible cause.
 *
 * That has been wrong twice, in opposite directions: gutters subtracted *from*
 * the cap made the column narrow as the window widened, and a clamp with too
 * long a runway made the whole page drift. Both are asserted now
 * (`tests/unit/pageColumn.test.tsx`, `tests/unit/container.test.tsx`) —
 * arithmetic rather than eye, because an eyeballed value drifts back the first
 * time someone thinks the page looks tight.
 */
export function PageColumn({ children }: { children: ReactNode }) {
  return (
    <section className="py-[clamp(2.5rem,1.618rem+3.76vw,3.5rem)]">
      <Container className="max-w-3xl">{children}</Container>
    </section>
  );
}

/**
 * The page title on those pages — fluid rather than stepped, and stopping at
 * the same 800px the column and the padding do, so nothing on the page is still
 * responding to width once the measure has settled.
 */
export const pageTitleClass =
  "text-[clamp(1.875rem,1.544rem+1.41vw,2.25rem)] font-bold tracking-tight text-ink";
