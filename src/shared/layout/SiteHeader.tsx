import Link from "next/link";
import { ButtonLink, Container } from "@/shared/ui";
import { Logo } from "@/shared/layout/Logo";
import { MobileNav } from "@/shared/layout/MobileNav";
import { AnchorScrollLink } from "@/shared/layout/AnchorScrollLink";
import { navLinks } from "@/shared/layout/navLinks";

/**
 * The site header — wordmark and section links left, the one call to action
 * right, on a 79px bar.
 *
 * **Two grounds, one bar.** On the landing page the design floats it over the
 * hero photograph with no fill of its own; everywhere else there is no
 * photograph to float over, so it takes an ink fill. The wordmark is white in
 * both cases, which is the whole reason the interior variant is dark rather
 * than paper — see `Logo`.
 *
 * **Not sticky.** The page carries its CTA in the hero, the pricing card and
 * the closing band, so pinning the bar would spend a slice of every viewport to
 * repeat something already three times on the page.
 *
 * **One breakpoint, `hdr` (832px), collapses the whole bar.** Above it: wordmark,
 * the five inline links, and the CTA. Below it: wordmark and the `MobileNav`
 * menu button only — the links *and* the CTA fold into its panel. The single
 * point replaced a split (links at `md`, CTA at `sm`) that left a band around
 * 770–800px where the five links and the button no longer fit and overlapped
 * (QA 1.1.15); `hdr` sits above that, so they're gone before they can collide.
 * (The bar carries `relative` in both variants so that menu's panel — which is
 * absolutely positioned — anchors to the header rather than the page.)
 */
export function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  return (
    <header
      className={
        transparent
          ? "absolute inset-x-0 top-0 z-50 text-paper"
          : "relative bg-ink text-paper"
      }
    >
      <Container className="flex h-[79px] items-center justify-between gap-6">
        <div className="flex items-center gap-10 lg:gap-14">
          <Link href="/" aria-label="Home" className="shrink-0">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-8 hdr:flex lg:gap-9">
            {navLinks.map((link) => (
              <AnchorScrollLink
                key={link.href}
                href={link.href}
                className="text-[12px] font-medium transition-opacity hover:opacity-70"
              >
                {link.label}
              </AnchorScrollLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {/* In the bar above `hdr`; below that it folds into the menu panel,
              together with the nav links — one breakpoint, no collision. */}
          <div className="hidden hdr:block">
            <ButtonLink href="/start" variant="primary" className="shrink-0">
              Get coach feedback
            </ButtonLink>
          </div>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
