"use client";

import type { ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/shared/ui";
import { AnchorScrollLink } from "./AnchorScrollLink";

/**
 * A button-styled link to a **same-page anchor**.
 *
 * `ButtonLink` is a plain styled `next/link`, so it carries the same anchor bug
 * the nav links had: the hero's "How it works" button stops scrolling once the
 * URL already holds a hash (and repeated clicks corrupt it into `/#a#b`). This
 * wears ButtonLink's exact look (`buttonClasses`) but routes the click through
 * `AnchorScrollLink`, which scrolls by hand and rewrites the URL to one clean
 * hash. Use `ButtonLink` for real routes; use this for `#section` targets.
 */
export function AnchorScrollButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AnchorScrollLink href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </AnchorScrollLink>
  );
}
