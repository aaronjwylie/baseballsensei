"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Decides whether a page wears the public marketing chrome.
 *
 * The operator portal (`/admin`, `/coach`, `/translator`, `/account`, `/login`)
 * is an internal tool — the "Pricing / FAQ / Submit a video" header belongs to
 * the customer site, not to the admin managing coaches. Those routes render bare
 * (their own `PortalBar` is the only chrome); everything else gets the marketing
 * header and footer. `/translator` was missing here, so it wore the marketing
 * header *above* its portal bar — the asymmetry with coach in QA 4.6.
 *
 * A client gate rather than route groups so the marketing/customer pages stay
 * put — moving them would collide with the flow work in progress. Stays
 * domain-less: it knows route prefixes, nothing about a Submission.
 */
const PORTAL = /^\/(admin|coach|translator|portal|account|login|forgot-password|reset-password)(\/|$)/;

/**
 * Three pages open on a full-bleed photograph and the design floats the header
 * over it: the landing page, the contact page and the feedback flow. Everywhere
 * else starts on paper and needs the header to carry its own ground — the
 * wordmark is white, so a transparent header on a light page is an invisible
 * one.
 */
const OVERLAY_HEADER = /^\/(contact|start)?$/;

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
