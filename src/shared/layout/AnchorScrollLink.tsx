"use client";

import Link from "next/link";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

/**
 * A nav link that scrolls same-page anchors itself, because the router won't do
 * it reliably.
 *
 * Next's client router mishandles these `/#section` links two ways, both of
 * which strand the reader on the page they're already looking at:
 *
 * 1. Navigating to the hash you're **already on** is a no-op — so a second tap
 *    on the same link, after scrolling back up, does nothing.
 * 2. Repeated same-page hash clicks **accumulate** into a malformed URL like
 *    `/#how-it-works#pricing`. The fragment is then `how-it-works#pricing`,
 *    which matches no element, so the click scrolls nowhere at all.
 *
 * So we take the click for same-page anchors: stop the router's navigation,
 * scroll to the element ourselves, and rewrite the URL to the one clean hash
 * (which also repairs an already-corrupted one). A real route like `/contact`,
 * or an anchor pointing at a page we're not currently on, falls through to
 * normal `Link` navigation untouched.
 */
export function AnchorScrollLink({
  href,
  className,
  onNavigate,
  children,
}: {
  href: string;
  className?: string;
  /** Fired before the scroll — e.g. the mobile menu closing itself. */
  onNavigate?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        onNavigate?.();
        scrollSamePageAnchor(e, href);
      }}
    >
      {children}
    </Link>
  );
}

function scrollSamePageAnchor(
  e: ReactMouseEvent<HTMLAnchorElement>,
  href: string,
): void {
  const hashAt = href.indexOf("#");
  if (hashAt === -1) return; // a real route, not an anchor
  const path = href.slice(0, hashAt);
  if (path && path !== window.location.pathname) return; // anchor on another page
  const target = document.getElementById(href.slice(hashAt + 1));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: "smooth" });
  // One clean hash, replacing whatever (possibly malformed) hash is there now.
  history.replaceState(null, "", href);
}
