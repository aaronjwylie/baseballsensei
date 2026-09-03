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
 * `clamp()` for the same reason: it interpolates across the whole range instead
 * of snapping at a width that has nothing to do with the page.
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
    <section className="py-[clamp(3.5rem,2.5rem+3vw,5rem)]">
      <div className="mx-auto w-full max-w-xl px-5">{children}</div>
    </section>
  );
}

/**
 * The page title on those pages — fluid rather than stepped at 640px, so it
 * grows with the window instead of jumping once and then holding.
 */
export const pageTitleClass =
  "text-[clamp(1.875rem,1.5rem+1.6vw,2.25rem)] font-bold tracking-tight text-ink";
