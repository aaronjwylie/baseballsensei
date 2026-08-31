/**
 * Shared button styling, so `Button` and `ButtonLink` can't drift apart.
 * They render different elements for different reasons — a link navigates, a
 * button acts — but they are the same control to the eye. Principle #8.
 */
/*
  `active:translate-y-px` is here as well as in `globals.css` because
  `ButtonLink` renders an `<a>`, and the global rule is scoped to `button`. Two
  declarations, two elements — not a duplicate. The alternative was a global
  rule on every anchor, which would have made ordinary prose links press.
*/
/**
 * Square, not rounded. Audrey's `button-submit-arrow-blue`, `button-stroke-blue`
 * and `button-stroke-lime` sets all draw a 2px border at zero radius, and they
 * are the only buttons she designed — the 4px-radius input in the file is a
 * stock Untitled-UI component (Inter, #475467 hints) dropped in for layout, not
 * part of her system, so it does not get a vote on the brand's control shape.
 *
 * The label is Oswald 600 at 14px, uppercase, tracked 2% — taken from the
 * component sets, where every variant shares that one spec.
 */
const BASE =
  "inline-flex items-center justify-center gap-2 border-2 font-display text-[14px] font-semibold uppercase leading-[21px] tracking-[0.02em] transition-colors active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0";

const SIZES = {
  md: "px-6 py-2",
  lg: "px-8 py-3",
} as const;

/**
 * Four shapes, one language.
 *
 * **The hover is a colour swap, not a shade shift.** Every one of Audrey's
 * button variants flips to a lime fill with blue text on hover — that exchange
 * *is* the interaction, and darkening the blue instead would read as a
 * different design system.
 *
 * - `primary` — the blue fill. The page's call to action, and the app's too.
 * - `outline` — blue border on paper, for the secondary actions in the portal.
 * - `onLime` — blue border for use where lime is already the ground.
 * - `onDark` — lime border and lime text, for the hero and the blue bands,
 *   where a blue-bordered button would disappear into the background.
 */
const VARIANTS = {
  primary:
    "border-accent bg-accent text-paper hover:border-highlight hover:bg-highlight hover:text-accent focus-visible:ring-accent",
  outline:
    "border-accent bg-transparent text-accent hover:border-highlight hover:bg-highlight hover:text-accent focus-visible:ring-accent",
  onLime:
    "border-accent bg-highlight text-accent hover:border-accent hover:bg-accent hover:text-paper focus-visible:ring-accent",
  onDark:
    "border-highlight bg-transparent text-highlight hover:bg-highlight hover:text-accent focus-visible:ring-highlight",
  /* Destructive. Red outline that fills red on hover — the one action shaped to
     look like it costs something, for deletes and the like. */
  danger:
    "border-red-600 bg-transparent text-red-600 hover:border-red-700 hover:bg-red-600 hover:text-white focus-visible:ring-red-600",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  className = "",
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}
