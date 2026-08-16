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
 * The list is rendered twice and the track travels exactly -50%, so the second
 * copy is arriving as the first leaves and the seam never shows. The duplicate
 * is `aria-hidden` — a screen reader should hear six claims, not twelve.
 *
 * Motion is off under `prefers-reduced-motion` (see `globals.css`), which
 * leaves a static row of claims — the design's own composition, and no loss.
 */
export function Ticker() {
  return (
    <div className="overflow-hidden bg-ink py-3">
      <div className="animate-ticker flex w-max gap-x-10 whitespace-nowrap">
        {[false, true].map((isDuplicate) => (
          <ul
            key={String(isDuplicate)}
            aria-hidden={isDuplicate || undefined}
            className="flex shrink-0 gap-x-10"
          >
            {ticker.map((claim) => (
              <li
                key={claim}
                className="text-[13px] font-semibold uppercase tracking-[0.04em] text-paper"
              >
                {claim}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
