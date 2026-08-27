import Link from "next/link";
import { ButtonLink, Container } from "@/shared/ui";
import { Logo } from "@/shared/layout/Logo";
import { MobileNav } from "@/shared/layout/MobileNav";
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
 * The inline section links collapse below `md`; there a `MobileNav` menu button
 * takes their place and drops the same five links. The CTA stays visible at
 * every width, because that's the one thing a phone visitor needs to reach.
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

          <nav className="hidden items-center gap-8 md:flex lg:gap-9">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[12px] font-medium transition-opacity hover:opacity-70"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ButtonLink href="/start" variant="primary" className="shrink-0">
            Get coach feedback
          </ButtonLink>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
