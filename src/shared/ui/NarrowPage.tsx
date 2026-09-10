import type { ReactNode } from "react";

/**
 * The shell every customer-facing page wears: one narrow column, centred.
 *
 * ── Why not the site `Container` ────────────────────────────────────────────
 *
 * `Container` steps its padding at 640px and 1024px, which is right for a
 * 1400px layout. Against a `max-w-xl` cap those steps have nowhere to go but
 * inward: the box stops growing at 576px while the padding keeps stepping, so
 * dragging the window **wider** made the text column **narrower** — 536 to 512
 * to 456, twice, visibly, in the wrong direction (Ben, 2026-08-31).
 *
 * A narrow card wants constant padding and one cap. The vertical rhythm is
 * `clamp()` for the same reason: it interpolates instead of snapping at a width
 * that has nothing to do with the page.
 *
 * ── Why the clamps stop at 616px ────────────────────────────────────────────
 *
 * **Vertical rhythm stops scaling where the column stops growing.** The column
 * caps at `max-w-xl` (576px) plus `px-5` either side — 616px of viewport. Past
 * that, widening the window changes nothing a reader can see: same measure,
 * same line breaks, same everything.
 *
 * The first version kept climbing to 1333px anyway, so dragging a wide window
 * slid the whole page down by about 21px and back up again with nothing else
 * moving — which is exactly the kind of motion that reads as a fault, because
 * there is no visible cause for it (Ben, 2026-09-10).
 *
 * So both ceilings are solved to land at 610px — a touch inside the cap, so
 * "flat from here on" holds with room to spare rather than by a rounding
 * accident. Chosen by arithmetic rather than by eye, and asserted, because an
 * eyeballed value drifts back the next time the page looks tight. Below
 * it the page really is getting roomier and the spacing follows; above it, width
 * has nothing left to say. Still continuous, still no snap.
 *
 * ── Why a component ─────────────────────────────────────────────────────────
 *
 * Three pages wear it — the ⑥ feedback link, the status lookup, and the signed
 * status link — and all three had written it out for themselves, so the first
 * fix landed on one and left the other two stepping. The same way the download
 * row went before it became `FeedbackDownloadRow`.
 */
export function NarrowPage({ children }: { children: ReactNode }) {
  return (
    <section className="py-[clamp(2.5rem,0.904rem+6.81vw,3.5rem)]">
      <div className="mx-auto w-full max-w-xl px-5">{children}</div>
    </section>
  );
}

/**
 * The page title on those pages — fluid rather than stepped at 640px, so it
 * grows with the window instead of jumping once and then holding.
 *
 * Same ceiling as the padding, for the same reason: a heading that keeps
 * growing after the column has stopped is a second source of the drift above,
 * and a smaller one is harder to attribute than a larger one.
 */
export const pageTitleClass =
  "text-[clamp(1.875rem,1.277rem+2.55vw,2.25rem)] font-bold tracking-tight text-ink";
