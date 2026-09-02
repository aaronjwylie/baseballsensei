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
 * The header ground depends on what the page opens on.
 *
 * The landing page opens on the hero photograph and wears its own solid bar
 * above it (`homeHeader`) — a gradient bar, distinct from the hero rather than
 * floating over it. `/contact` and the feedback flow open on a full-bleed photo and
 * float the header over it (`overlayHeader`). Everywhere else starts on paper
 * and needs the header to carry its own ink ground — the wordmark is white, so a
 * transparent header on a light page is an invisible one.
 */
const OVERLAY_HEADER = /^\/(contact|start)$/;

export function SiteChrome({
  header,
  overlayHeader,
  homeHeader,
  footer,
  children,
}: {
  header: ReactNode;
  overlayHeader: ReactNode;
  homeHeader: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (PORTAL.test(pathname)) return <>{children}</>;
  const chosenHeader =
    pathname === "/"
      ? homeHeader
      : OVERLAY_HEADER.test(pathname)
        ? overlayHeader
        : header;
  return (
    <>
      {chosenHeader}
      {children}
      {footer}
    </>
  );
}
