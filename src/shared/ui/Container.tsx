import type { ReactNode } from "react";

/**
 * Centered page container with consistent horizontal padding.
 *
 * The measurements come from the approved wireframe: content runs edge to edge
 * at 60px gutters on a 1440 canvas, which is wider than the 1152 this used to
 * cap at. The two-column sections need that width to hold their image column
 * without squeezing the copy beside it.
 *
 * ── Why a narrower page is built differently ────────────────────────────────
 *
 * A caller that supplies its own `max-w-` gets the padding on a **wrapper**,
 * with the cap on the inner box. Two faults came from having one box do both
 * (Ben, 2026-09-10):
 *
 * **The padding ate the column.** Inside a single capped box the gutters are
 * subtracted from the cap, so widening the window made the text *narrower* —
 * a `max-w-xl` page went 536 → 512 → 456 across the two breakpoints, in the
 * wrong direction. `PageColumn` was written to escape exactly this and escaped
 * it for three customer pages; login, account, `/start` and `/qa` were still
 * doing it. Padding outside the cap means the column grows until it caps and
 * then holds, which is the same rule the vertical rhythm follows.
 *
 * **And a cap could lose silently.** `max-w-[1400px]` and the caller's
 * `max-w-3xl` are both single classes in `@layer utilities`, so which one wins
 * is decided by the order Tailwind happens to emit them in — nothing in this
 * file, nothing you could find by reading the call site. It emits `2xl` and
 * `3xl` *before* the arbitrary value and `sm`, `md`, `xl` *after*, so the coach
 * and translator portals were rendering at 1280px while the login page was
 * correctly at 384. Not overriding a class we did not write is the fix; racing
 * it was never going to be reliable.
 *
 * **The gutters stop stepping, too.** Padding outside the cap fixed
 * `cap - gutters` and left `viewport - gutters`: at 639px a `max-w-3xl` page
 * had 599px of content and at 640px it had 576, because the gutter stepped
 * 20 → 32 underneath it. Constant padding removes the step entirely, which is
 * what `PageColumn` concluded before this did — *a narrow card wants constant
 * padding and one cap*. Past the cap the gutter is `(viewport - cap) / 2`
 * anyway; the class only bites while the column is still viewport-bound, and
 * there 20px is what you want.
 *
 * An uncapped caller is untouched — same single box, same stepping padding
 * inside the cap — because the landing page's geometry is approved design and
 * 40px of it is not ours to move.
 */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const capped = /(?:^|\s)max-w-/.test(className);

  if (!capped) {
    return (
      <div
        className={`mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-[60px] ${className}`}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="w-full px-5">
      <div className={`mx-auto w-full ${className}`}>{children}</div>
    </div>
  );
}
