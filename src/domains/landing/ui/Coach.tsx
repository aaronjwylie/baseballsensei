import Image from "next/image";
import { Container, SectionHeading } from "@/shared/ui";
import { coach } from "../model/copy";

/**
 * Who does the reviewing — the photograph and the credentials, side by side.
 *
 * **The eyebrow is blue here and lime in the hero.** The design draws it lime
 * in both, but this band is #f2f2f2: lime on that ground measures about 1.2:1
 * and is effectively invisible, where the hero's lime sits on a darkened
 * photograph and reads cleanly. Same token, different ground, different answer —
 * the alternative was shipping a line of text nobody can see.
 *
 * The stats are a list of claims about a real named person, so they are marked
 * up as a description list rather than styled `div`s: the value answers the
 * label, and that relationship is the content.
 *
 * The design also floats a large decorative kanji watermark behind this band.
 * It is outlined artwork rather than live text in the Figma, and it is left out
 * rather than transcribed — guessing at Japanese characters from a raster
 * render is exactly the kind of detail that is embarrassing to get wrong on a
 * brand selling Japanese coaching.
 */
export function Coach() {
  return (
    <section id="coaches" className="scroll-mt-8 bg-paper-alt py-20 lg:py-28">
      {/* Two equal halves: the photo column and the copy column each own 50%,
          so the copy starts at the midline instead of reaching back across it. */}
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          {/* The photo is capped and left-aligned inside its half rather than
              stretched to fill it — a portrait blown up to 50% of the page would
              tower over the copy. */}
          <div className="max-w-[440px]">
            <div className="relative">
              <div className="relative aspect-[300/282] w-full overflow-hidden">
                <Image
                  src="/images/concept-panel-portrait.webp"
                  alt={`${coach.name}, head coach`}
                  fill
                  sizes="(min-width: 1024px) 440px, 100vw"
                  className="object-cover"
                />
              </div>

              {/* The round headshot straddles the bottom-right corner of the
                  pitcher shot — half over it, half below — so the two
                  photographs read as one stacked portrait. */}
              <div className="absolute -bottom-10 -right-2 h-[140px] w-[140px] overflow-hidden rounded-full ring-4 ring-highlight lg:h-[168px] lg:w-[168px]">
                <Image
                  src="/images/concept-round.webp"
                  alt=""
                  fill
                  sizes="168px"
                  className="object-cover"
                />
              </div>
            </div>

            {/* Centred under the circle, not the pitcher shot: same width and
                same right overhang as the circle, so their centres line up. */}
            <div className="ml-auto -mr-2 mt-10 w-[140px] whitespace-nowrap text-center lg:mt-12 lg:w-[168px]">
              <p className="font-display text-[18px] font-semibold uppercase tracking-[-0.01em] text-ink">
                {coach.name}
              </p>
              <p className="mt-1 text-[15px] text-ink-muted">{coach.role}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="font-display text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
            {coach.eyebrow}
          </p>

          <SectionHeading
            tone="onLight"
            title={coach.title}
            stack
            className="mt-3"
          />

          <p className="mt-5 max-w-[560px] text-[15px] leading-[1.5] text-ink-soft">
            {coach.bio}
          </p>

          <dl className="mt-8 flex flex-col gap-3">
            {coach.stats.map((stat) => (
              <div
                key={stat.value}
                className="rounded-md border-2 border-accent px-5 py-2.5 text-center"
              >
                <dt className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink">
                  {stat.value}
                </dt>
                <dd className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-accent">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}
