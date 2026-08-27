import { ticker } from "../model/copy";

/**
 * The claim strip between the hero and the method — a thin near-black bar of
 * short proofs.
 *
 * **It scrolls rather than sitting still.** The design draws one static row
 * spanning 1079px, which needs seven items to fill and so repeats one of them;
 * at 375px the same six claims cannot fit at all. A marquee holds both cases
 * with one rule, and the design's accidental repeat becomes the deliberate loop.
 *
 * **The loop is two identical halves and the track travels exactly -50%**, so
 * the second half arrives as the first leaves and the seam never shows. The
 * spacing lives on each item (`pr-10`) rather than a container `gap`, so the gap
 * *after* the last item exists too — without it the -50% point lands mid-gap and
 * the loop stutters.
 *
 * **Each half must be wider than the screen, or a gap opens (QA 1.1.3).** Six
 * claims are ~930px; on a super-wide monitor two copies don't fill the viewport,
 * so the strip runs out and empties before it loops. Each half therefore repeats
 * the six `REPEAT` times — ~5.8k px, past any real display — and the duration
 * scales with `REPEAT` so a longer track scrolls at the same speed, not faster.
 *
 * The duplicate half is `aria-hidden` — a screen reader should hear six claims,
 * not seventy-two. Motion is off under `prefers-reduced-motion` (see
 * `globals.css`), leaving a static row of claims — the design's own composition.
 */
const REPEAT = 6;
const SECONDS_PER_COPY = 32;

export function Ticker() {
  return (
    <div className="overflow-hidden bg-ink py-3">
      <div
        className="animate-ticker flex w-max"
        style={{ animationDuration: `${REPEAT * SECONDS_PER_COPY}s` }}
      >
        {[false, true].map((isDuplicate) => (
          <ul
            key={String(isDuplicate)}
            aria-hidden={isDuplicate || undefined}
            className="flex shrink-0"
          >
            {Array.from({ length: REPEAT }).flatMap((_, copy) =>
              ticker.map((claim) => (
                <li
                  key={`${copy}-${claim}`}
                  className="pr-10 text-[13px] font-semibold uppercase tracking-[0.04em] text-paper"
                >
                  {claim}
                </li>
              )),
            )}
          </ul>
        ))}
      </div>
    </div>
  );
}
