"use client";

import Link from "next/link";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

/**
 * A nav link that scrolls same-page anchors itself, because the router won't do
 * it reliably.
 *
 * Next's client router mishandles these `/#section` links three ways, all of
 * which strand the reader:
 *
 * 1. Navigating to the hash you're **already on** is a no-op — so a second tap
 *    on the same link, after scrolling back up, does nothing.
 * 2. Repeated same-page hash clicks **accumulate** into a malformed URL like
 *    `/#how-it-works#pricing`. The fragment is then `how-it-works#pricing`,
 *    which matches no element, so the click scrolls nowhere at all.
 * 3. Clicking `/#section` from **another page** (e.g. `/terms`) client-navigates
 *    to `/` but **drops the fragment** — the URL loses its hash and the reader
 *    lands at the top of home instead of the section (QA: cross-page anchors).
 *
 * So we take the click for anchors. Same-page: stop the router, scroll to the
 * element ourselves, and rewrite the URL to the one clean hash (which also
 * repairs an already-corrupted one). Cross-page: navigate **natively** to the
 * full `/#section`, because the browser keeps the fragment and scrolls to the
 * server-rendered section on load — the one thing the client router won't do
 * here. A real route like `/contact` falls through to normal `Link` navigation,
 * and a modified click (new tab/window) is always left to the browser.
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
        handleAnchorClick(e, href);
      }}
    >
      {children}
    </Link>
  );
}

function handleAnchorClick(
  e: ReactMouseEvent<HTMLAnchorElement>,
  href: string,
): void {
  const hashAt = href.indexOf("#");
  if (hashAt === -1) return; // a real route, not an anchor

  // Leave modified clicks (open in new tab/window, middle-click) to the browser
  // — intercepting them would break "open section in a new tab".
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  ) {
    return;
  }

  const path = href.slice(0, hashAt);
  if (path && path !== window.location.pathname) {
    // Anchor on another page. The client router drops the fragment on a
    // cross-route navigation, so go natively: the browser keeps the hash and
    // scrolls to the server-rendered section once the page loads.
    e.preventDefault();
    window.location.assign(href);
    return;
  }

  const target = document.getElementById(href.slice(hashAt + 1));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: "smooth" });
  // One clean hash, replacing whatever (possibly malformed) hash is there now.
  history.replaceState(null, "", href);
}
