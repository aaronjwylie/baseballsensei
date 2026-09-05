import Image from "next/image";
import { ButtonLink, Container } from "@/shared/ui";
import { AnchorScrollButton } from "@/shared/layout/AnchorScrollButton";
import { hero } from "../model/copy";

/**
 * The opening band: a full-bleed photograph running to the top of the screen
 * (the header floats over it, so there is no bar above the image), the promise
 * over it, two calls to action.
 *
 * **Batter left, copy right.** The photo is framed so the batter sits on the
 * left (`object-position` pushes the crop right, cutting the scoreboard side),
 * and the copy rides a dark right edge. That edge is a **smooth** ramp —
 * `from-transparent … to-ink` with a mid stop — not a hard band, so there is no
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
        src="/images/hero-home-2-crop.webp"
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

/**
 * The hand-drawn accent beside "Japan's" — the lime flourish from the design
 * file (`public/images/squiggle.svg`), inlined so it scales with the heading,
 * inherits `currentColor`, and needs no extra request. `fill-current` paints it
 * the lime of the word it sits beside.
 */
function HeroSquiggle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 101 69"
      fill="currentColor"
      aria-hidden
      className={`fill-current ${className ?? ""}`}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M67.1356 62.1712C75.3712 63.5821 83.8755 64.4218 91.3636 68.4064C91.8102 68.6422 92.3639 68.4754 92.6033 68.0293C92.839 67.5827 92.6722 67.029 92.2261 66.7897C84.5628 62.7126 75.8717 61.8086 67.4447 60.3659C66.9468 60.2781 66.4717 60.6156 66.3876 61.114C66.2998 61.6119 66.6378 62.0834 67.1356 62.1712Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M68.1526 50.0635C71.0763 48.0708 74.1483 46.7072 77.6759 46.3254C78.1798 46.2712 78.5422 45.8191 78.49 45.3169C78.4341 44.8143 77.9804 44.4506 77.4801 44.5053C73.6441 44.92 70.3019 46.385 67.1234 48.5502C66.7042 48.8344 66.5948 49.4043 66.8814 49.8223C67.1645 50.2395 67.737 50.3482 68.1526 50.0635Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M64.7789 23.1336C66.5537 19.2577 69.3442 16.4313 73.2448 14.6666C73.7047 14.4583 73.9101 13.9154 73.7001 13.4549C73.4936 12.995 72.9499 12.7902 72.4901 12.9985C68.173 14.9527 65.0793 18.0797 63.1141 22.371C62.9024 22.83 63.1076 23.3746 63.5654 23.5845C64.0267 23.7954 64.5708 23.5931 64.7789 23.1336Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M24.877 11.6708C24.0528 12.3949 23.2916 13.1938 22.6163 14.0642C22.3152 14.4516 21.7633 15.2878 21.5852 16.0482C21.3924 16.8579 21.57 17.5909 22.2339 18.0605C23.116 18.6836 23.8843 18.7448 24.5142 18.5384C25.1206 18.3405 25.6435 17.8535 26.0309 17.1545C26.7709 15.8184 27.008 13.6454 26.9098 12.3711C27.7733 11.7072 28.6987 11.1259 29.6706 10.631C36.9101 6.94562 46.2787 10.0694 52.6625 18.1026C54.8966 20.9151 55.394 26.2067 55.2345 31.8139C54.9871 40.5446 53.0057 50.046 52.5143 52.8427C52.3945 53.5335 52.3994 53.9547 52.4235 54.0423C52.5346 54.4716 52.8199 54.6208 53.0242 54.6914C53.3206 54.7904 53.5718 54.768 53.7824 54.6952C54.0672 54.5949 54.3206 54.3818 54.4774 54.0188C54.5624 53.818 54.6195 53.5296 54.6576 53.2187C54.6819 53.0028 54.6728 52.7616 54.7389 52.614C55.1661 51.6692 55.6479 50.756 56.1234 49.835C57.7138 46.7374 59.6002 43.8928 61.6455 41.0751C68.1434 32.1219 74.5551 22.5954 83.961 16.4272C84.3828 16.1504 84.5031 15.5825 84.2245 15.1597C83.9496 14.7375 83.3821 14.6195 82.9567 14.8961C73.3627 21.1858 66.7911 30.8692 60.1635 39.9996C58.4242 42.3965 56.7966 44.8135 55.3617 47.3808C56.172 42.5859 57.1083 35.9216 57.0916 29.901C57.0771 24.5466 56.2668 19.6977 54.0953 16.9636C47.1022 8.16334 36.7679 4.96167 28.8402 8.99959C27.9921 9.43193 27.1724 9.92393 26.3959 10.4741C23.6332 3.13862 15.9881 -0.759924 8.4035 1.44291C7.91653 1.5836 7.63842 2.09208 7.77829 2.57708C7.92177 3.06262 8.42857 3.34197 8.91555 3.20128C15.7502 1.21642 22.6324 4.89095 24.877 11.6708ZM25.0693 14.0192C24.7151 14.3907 24.3803 14.7806 24.0616 15.1877C23.8926 15.4064 23.5935 15.8308 23.4299 16.265C23.3927 16.3669 23.365 16.5308 23.3539 16.6069C23.5858 16.7668 23.7727 16.8549 23.9439 16.7982C24.1576 16.7288 24.2931 16.5118 24.4289 16.2671C24.7706 15.6532 24.9766 14.8033 25.0693 14.0192Z"
      />
    </svg>
  );
}
