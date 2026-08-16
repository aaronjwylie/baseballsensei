/* eslint-disable @next/next/no-img-element */
import { site } from "@/shared/config/site";

/**
 * The wordmark — "BASEBALL" in white, "SENSEI" in lime, and the flag mark whose
 * sun is a baseball. Exported from Audrey's Figma and served as a single file.
 *
 * **Plain `<img>`, deliberately.** `next/image` refuses SVG unless the project
 * opts in with `dangerouslyAllowSVG`, which loosens the rule for every image on
 * the site to buy nothing here: this asset is a fixed 206x24 with no responsive
 * variants to generate and no layout shift to prevent, since both dimensions
 * are declared.
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
      src="/images/logo.svg"
      alt={site.name}
      width={206}
      height={24}
      className={`h-[22px] w-auto lg:h-6 ${className}`}
    />
  );
}
