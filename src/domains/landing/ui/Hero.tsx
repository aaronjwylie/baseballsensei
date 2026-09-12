import Image from "next/image";
import { ButtonLink, Container } from "@/shared/ui";
import { AnchorScrollButton } from "@/shared/layout/AnchorScrollButton";
import { hero } from "../model/copy";

/**
 * The opening band: a full-bleed photograph running to the top of the screen
 * (the header floats over it, so there is no bar above the image), the promise
 * over it, two calls to action.
 *
 * **Batter left, copy right.** The photograph is supplied already composed with
 * the batter on the left; `object-left` keeps him in frame when a narrow viewport
 * has to crop the sides. The copy rides a dark right edge — a **smooth** ramp,
 * `from-transparent … to-ink` with a mid stop, not a hard band, so there is no
 * visible line where the darkening begins; it only has to guarantee the white
 * type a dark enough ground on the right without veiling the batter on the left.
 *
 * `priority` because this is the largest contentful paint on the site — without
 * it Next defers the fetch and the hero lands after the fold has already been
 * painted empty.
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
        className="object-cover object-left"
      />
      {/* The right-edge fade. A gentle three-stop ramp so the darkening has no
          seam — clear over the batter, ink under the copy. */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent from-15% via-ink/60 via-65% to-ink" />

      <Container className="relative flex min-h-[560px] flex-col justify-center pb-20 pt-28 sm:min-h-[640px] lg:min-h-[760px] lg:pb-28 lg:pt-32 2xl:min-h-[880px]">
        <div className="ml-auto max-w-[520px]">
          <p className="flex items-center gap-2 font-display text-[11px] font-medium uppercase tracking-[0.08em] text-highlight">
            <span
              aria-hidden
              className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-highlight"
            />
            {hero.eyebrow}
          </p>

          <h1 className="mt-4 font-display text-[40px] font-medium uppercase leading-[1.02] tracking-[-0.02em] text-paper lg:text-[52px]">
            {hero.title.lead}{" "}
            <span className="relative inline-block text-highlight">
              {hero.title.accent}
              <HeroSquiggle className="pointer-events-none absolute left-full top-1/2 -ml-8 h-auto w-[72px] -translate-y-[58%] lg:-ml-12 lg:w-[104px]" />
            </span>
            <br />
            {hero.title.tail}
          </h1>

          <p className="mt-5 max-w-[440px] text-[16px] leading-[1.45] text-paper lg:text-[18px]">
            {hero.body}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ButtonLink href="/start" variant="primaryLime">
              {hero.primaryCta} <span aria-hidden className="relative -top-[3px]">→</span>
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

/**
 * The hand-drawn accent beside "Japan's" — the doodle from the design file
 * (`public/images/doodle.svg`), inlined so it scales with the heading and needs
 * no extra request. It is a stroked drawing with the lime baked in
 * (`stroke="#C9F950"`), so it carries its own colour.
 */
function HeroSquiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 84 66" fill="none" aria-hidden className={className}>
      <g clipPath="url(#heroDoodleClip)">
        <path
          d="M1 1.7C8.14 -0.290003 16.16 1.84 18.36 9.43C18.99 11.59 19.99 14.82 19.06 17.01C17.98 19.55 14.27 18.87 14.3 16.04C14.32 13.27 18.63 11.35 20.65 10.19C31.4 4.01 47.25 9.65 49.34 22.48C49.97 26.38 49.58 30.39 49.36 34.31C49 40.69 47.75 47.08 46.55 53.35C48.1 49.59 49.98 45.95 51.8 42.32C58.04 29.82 66.15 17.41 80.7 14.87"
          stroke="#C9F950"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M57.05 18.65C57.05 18.65 59.2501 11.35 66.5501 9.44995"
          stroke="#C9F950"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M61.1001 45.69C61.1001 45.69 64.5201 41.19 72.1601 42.22"
          stroke="#C9F950"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M60.45 56.81C60.45 56.81 72.38 56.04 82.32 64.74"
          stroke="#C9F950"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="heroDoodleClip">
          <rect width="83.32" height="65.74" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
