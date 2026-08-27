"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/shared/ui";
import { AnchorScrollLink } from "./AnchorScrollLink";
import { navLinks } from "./navLinks";

/**
 * The header's small-screen navigation.
 *
 * The inline links in `SiteHeader` are `hidden hdr:flex`; below that width this
 * takes over — a menu button that drops the same five links, and the CTA the bar
 * sheds at the same point. Above `hdr` it renders nothing (`hdr:hidden`), so the
 * two never show at once.
 *
 * The panel carries a solid ink fill of its own on purpose: the header it hangs
 * from may be floating transparent over the hero photograph, and a menu without
 * a ground would be unreadable against it. It anchors to the header (which is
 * positioned in both variants), spanning the full bar width below the 79px row.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  // Close on Escape — the panel overlays the page, so a key out matters.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="hdr:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="-mr-1 inline-flex h-10 w-10 items-center justify-center rounded-md transition-opacity hover:opacity-70"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="7" x2="21" y2="7" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="17" x2="21" y2="17" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <>
          {/* Tap-away: anything outside the panel closes it. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-[79px] z-40 cursor-default bg-transparent"
          />
          <nav
            id="mobile-nav"
            className="absolute inset-x-0 top-[79px] z-50 border-t border-white/10 bg-ink text-paper shadow-lg"
          >
            <ul className="flex flex-col py-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <AnchorScrollLink
                    href={link.href}
                    onNavigate={() => setOpen(false)}
                    className="block px-6 py-3 text-sm font-medium transition-opacity hover:opacity-70"
                  >
                    {link.label}
                  </AnchorScrollLink>
                </li>
              ))}
            </ul>

            {/* The CTA the bar drops below sm. Hidden from sm up, where the bar
                shows it again, so it never appears in two places at once. */}
            <div className="border-t border-white/10 p-4 hdr:hidden">
              <ButtonLink
                href="/start"
                variant="primary"
                onClick={() => setOpen(false)}
                className="w-full"
              >
                Get coach feedback
              </ButtonLink>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
