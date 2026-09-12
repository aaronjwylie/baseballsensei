/* eslint-disable @next/next/no-img-element */
import { site } from "@/shared/config/site";

/**
 * The wordmark — a two-line lockup: "BASEBALL" in white over "SENSEI" in lime,
 * with speed lines and the flag mark. Exported from Audrey's Figma and served as
 * a single SVG (`logo-baseball-sensei.svg`, 189x62).
 *
 * **Plain `<img>`, deliberately.** `next/image` refuses SVG unless the project
 * opts in with `dangerouslyAllowSVG`, which loosens the rule for every image on
 * the site to buy nothing here: a fixed 189x62 lockup with no responsive variants
 * to generate and no layout shift to prevent, since both dimensions are declared.
 *
 * **The lockup is light-on-dark only.** "BASEBALL" is set in white, so it
 * vanishes on paper — every place it appears (the hero's transparent header,
 * the blue footer, the dark interior header) is a dark ground. A light-ground
 * variant does not exist in the Figma yet; if one is needed, it is a new export
 * rather than a CSS filter.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/images/logo-baseball-sensei.svg"
      alt={site.name}
      width={189}
      height={62}
      className={`h-10 w-auto lg:h-11 ${className}`}
    />
  );
}
