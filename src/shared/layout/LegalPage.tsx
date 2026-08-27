import type { ReactNode } from "react";
import { Container, SectionHeading, type SplitHeading } from "@/shared/ui";

/**
 * The shell the legal pages (terms, privacy) wear so they read as part of the
 * brand rather than as a default document.
 *
 * A dark `bg-ink` title band — continuous with the ink header above it — carries
 * the page name as a `SectionHeading` (Oswald, the highlight half in lime), then
 * the copy sits on paper below. `LegalSection` gives every sub-heading the same
 * Oswald label so the two pages can't drift apart.
 *
 * `intro` is the honest "this is a placeholder" line each page opens with, set
 * off with a lime rule so it reads as a notice rather than as body copy.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: SplitHeading;
  intro: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="bg-ink">
        <Container className="py-14 lg:py-20">
          <SectionHeading as="h1" tone="onDark" title={title} />
        </Container>
      </section>

      <section className="py-16 lg:py-24">
        <Container className="max-w-2xl">
          <p className="rounded-2xl border-l-4 border-highlight bg-paper-alt px-7 py-6 text-[15px] leading-relaxed text-ink-soft">
            {intro}
          </p>

          <div className="mt-12 space-y-10 text-[15px] leading-relaxed text-ink-soft">
            {children}
          </div>
        </Container>
      </section>
    </>
  );
}

/** One titled block of a legal page — the sub-heading in the brand's display face. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-[18px] font-medium uppercase tracking-[0.01em] text-ink">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
