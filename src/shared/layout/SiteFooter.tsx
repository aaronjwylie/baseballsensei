import Link from "next/link";
import { Container } from "@/shared/ui";
import { site } from "@/shared/config/site";
import { Logo } from "@/shared/layout/Logo";
import { navLinks } from "@/shared/layout/navLinks";

/**
 * Two bands: the wordmark and section links centred on brand blue, then a
 * near-black strip carrying the legal line.
 *
 * "Check status" is ours, not the design's. A customer who has already paid has
 * no account to log into — by design — so this link and the email lookup behind
 * it are their only route back to a submission. Leaving it out to match the
 * mockup would strand them, which is a worse outcome than one extra link.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="bg-accent text-paper">
        <Container className="flex flex-col items-center gap-6 py-12 text-center">
          <Link href="/" aria-label="Home">
            <Logo />
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[12px] font-medium transition-opacity hover:opacity-70"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/status"
              className="text-[12px] font-medium transition-opacity hover:opacity-70"
            >
              Check status
            </Link>
          </nav>
        </Container>
      </div>

      <div className="bg-ink text-paper">
        <Container className="flex flex-col gap-2 py-5 text-[13px] sm:flex-row sm:items-center sm:gap-12">
          <p>
            © {year} {site.name}
            {" · "}Vancouver &amp; Tokyo
          </p>
          <Link href="/terms" className="transition-opacity hover:opacity-70">
            terms and conditions
          </Link>
        </Container>
      </div>
    </footer>
  );
}
