import Image from "next/image";
import { ButtonLink, Container, SectionHeading } from "@/shared/ui";
import { AnchorScrollButton } from "@/shared/layout/AnchorScrollButton";
import { hero } from "../model/copy";

/**
 * The opening band: a full-bleed photograph, the promise over it, two calls to
 * action.
 *
 * **The copy sits on the right, the batter on the left.** The photograph frames
 * the batter on its right, so the image is mirrored (`-scale-x-100`) to move him
 * to the left, opposite the copy, rather than leaving him trapped under the text
 * panel. The mirror is invisible except for a reversed jersey number, which a
 * motion-blurred action frame carries without notice.
 *
 * **The desktop band is tall enough to hold the batter head to feet.** He is a
 * full-body figure, so a short cover crop lopped off his helmet and shoes. A
 * `lg:min-h` gives the band the height that keeps the whole swing in frame, and
 * the copy is centred in it (`justify-center`); the vertical crop bias sits high
 * (`object-[70%_35%]`) so the helmet is the last thing to go if a very wide
 * viewport still has to trim. Below `lg` the band is content-height, copy over
 * the darkened photo as before.
 *
 * **The gradient is what makes the type legible**, not a mood. White text laid
 * straight onto the photograph fails contrast in patches that move as the image
 * is cropped at different widths. The right-to-left black ramp guarantees the
 * copy column a dark ground at every breakpoint, and stops around the midpoint
 * rather than veiling the whole picture, leaving the batter clear on the left.
 *
 * `priority` because this is the largest contentful paint on the site — without
 * it Next defers the fetch and the hero lands after the fold has already been
 * painted empty.
 *
 * The header is its own gradient bar above this section now (see `SiteChrome`),
 * not a bar floating over it, so this section starts below the header and the top
 * padding is ordinary breathing room rather than clearance for an overlay.
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
        className="object-cover object-[70%_35%] -scale-x-100"
      />
      <div className="absolute inset-0 bg-gradient-to-l from-ink via-ink/80 to-transparent lg:to-40%" />

      <Container className="relative pb-20 pt-20 lg:flex lg:min-h-[720px] lg:flex-col lg:justify-center lg:pb-28 lg:pt-28 2xl:min-h-[880px]">
        <div className="ml-auto max-w-[520px]">
          <p className="flex items-center gap-2 font-display text-[11px] font-medium uppercase tracking-[0.08em] text-highlight">
            <span
              aria-hidden
              className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-highlight"
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
            <AnchorScrollButton href="#how-it-works" variant="onDark">
              {hero.secondaryCta}
            </AnchorScrollButton>
          </div>
        </div>
      </Container>
    </section>
  );
}
