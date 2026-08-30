"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Container } from "@/shared/ui";
// Import the server action from its "use server" module directly, NOT the
// domain barrel — the barrel also re-exports the DAL and Postgres client, which
// a client component would drag into the browser bundle (CLAUDE.md §12).
import { logout } from "@/domains/account/api/auth";

/**
 * The operator portal's top bar — one full-width band shared by the admin and
 * coach layouts, so the nav can't drift between them or get trapped inside a
 * page's narrow form column (which is exactly what it used to do).
 *
 * `active` is derived from the path rather than passed per page: the section
 * links use a prefix match so `/admin/coaches/:id` still lights up "Coaches",
 * while the two portal homes (`/admin`, `/coach`) match exactly so they don't
 * light up on every child route.
 */
export function PortalBar({
  home,
  links = [],
  canSwitch = false,
}: {
  home: string;
  links?: { href: string; label: string }[];
  /**
   * Whether this operator holds more than one role. When they do, the bar keeps
   * a way back to the chooser — otherwise choosing a portal at `/portal` was a
   * one-way door: a coach-and-translator could see one side's work and had no
   * route to the other without signing out (Ben, QA 4.7). Off by default, so a
   * single-role operator never sees a switch that would only loop them back.
   */
  canSwitch?: boolean;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" || href === "/coach"
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <div className="sticky top-0 z-10 border-b border-white/10 bg-ink">
      <Container className="flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-7">
          {/* The wordmark as the marketing site draws it: Oswald, uppercase,
              "Baseball" white and "Sensei" lime. */}
          <Link
            href={home}
            className="font-display text-lg font-semibold uppercase tracking-[0.03em] text-paper"
          >
            Baseball <span className="text-highlight">Sensei</span>
          </Link>
          {links.length > 0 && (
            <nav className="hidden items-center gap-6 sm:flex">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-display text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                    isActive(link.href)
                      ? "text-highlight"
                      : "text-paper/70 hover:text-paper"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-5">
          {canSwitch && (
            <Link
              href="/portal"
              className="text-sm text-paper/70 transition-colors hover:text-paper"
            >
              Switch role
            </Link>
          )}
          <Link
            href="/account"
            className="text-sm text-paper/70 transition-colors hover:text-paper"
          >
            Account
          </Link>
          <form action={logout}>
            <Button type="submit" variant="onDark">
              Sign out
            </Button>
          </form>
        </div>
      </Container>
    </div>
  );
}
