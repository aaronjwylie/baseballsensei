"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Decides whether a page wears the public marketing chrome.
 *
 * The operator portal (`/admin`, `/coach`, `/account`, `/login`) is an internal
 * tool — the "Pricing / FAQ / Submit a video" header belongs to the customer
 * site, not to the admin managing coaches. Those routes render bare; everything else
 * gets the header and footer.
 *
 * A client gate rather than route groups so the marketing/customer pages stay
 * put — moving them would collide with the flow work in progress. Stays
 * domain-less: it knows route prefixes, nothing about a Submission.
 */
const PORTAL = /^\/(admin|coach|account|login|forgot-password|reset-password)(\/|$)/;

/**
 * The landing page opens on a full-bleed photograph and the design floats the
 * header over it; every other page starts on paper and needs the header to
 * carry its own ground.
 */
const OVERLAY_HEADER = /^\/$/;

export function SiteChrome({
  header,
  overlayHeader,
  footer,
  children,
}: {
  header: ReactNode;
  overlayHeader: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (PORTAL.test(pathname)) return <>{children}</>;
  return (
    <>
      {OVERLAY_HEADER.test(pathname) ? overlayHeader : header}
      {children}
      {footer}
    </>
  );
}
