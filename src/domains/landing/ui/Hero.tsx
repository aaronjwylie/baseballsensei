import Image from "next/image";
import { ButtonLink, Container } from "@/shared/ui";
import { hero } from "../model/copy";
import { SectionHeading } from "./SectionHeading";

/**
 * The opening band: a full-bleed photograph, the promise over it, two calls to
 * action.
 *
 * **The gradient is what makes the type legible**, not a mood. The photograph
 * is bright sky on its right and mid-tone dirt on its left, so white text laid
 * straight onto it fails contrast in patches that move as the image is cropped
 * at different widths. The left-to-right black ramp guarantees the copy column
 * a dark ground at every breakpoint, which is why it stops around the midpoint
 * rather than veiling the whole picture.
 *
 * `priority` because this is the largest contentful paint on the site — without
 * it Next defers the fetch and the hero lands after the fold has already been
 * painted empty.
 *
 * The header floats over this section (see `SiteChrome`), so the top padding
 * has to clear its 79px itself; there is no header box above to push it down.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-ink">
      <Image
        src="/images/hero-home.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[70%_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-transparent lg:to-40%" />

      <Container className="relative pb-20 pt-[140px] lg:pb-28 lg:pt-[190px]">
        <div className="max-w-[520px]">
          <p className="flex items-center gap-2 font-display text-[11px] font-medium uppercase tracking-[0.08em] text-highlight">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-highlight"
            />
            {hero.eyebrow}
          </p>

          <SectionHeading
            as="h1"
            tone="onDark"
            title={hero.title}
            className="mt-4 text-[40px] lg:text-[52px]"
          />

          <p className="mt-5 max-w-[440px] text-[16px] leading-[1.45] text-paper lg:text-[18px]">
            {hero.body}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ButtonLink href="/start" variant="primary">
              {hero.primaryCta} <span aria-hidden>→</span>
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="onDark">
              {hero.secondaryCta}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
