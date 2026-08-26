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
      <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-24">
        <div>
          <div className="relative">
            <div className="relative aspect-[319/297] w-full overflow-hidden">
              <Image
                src="/images/concept-panel.webp"
                alt={`${coach.name}, head coach`}
                fill
                sizes="(min-width: 1024px) 380px, 100vw"
                className="object-cover"
              />
            </div>

            <div className="absolute -bottom-8 right-6 h-[120px] w-[120px] overflow-hidden rounded-full ring-4 ring-highlight lg:h-[150px] lg:w-[150px]">
              <Image
                src="/images/concept-round.webp"
                alt=""
                fill
                sizes="150px"
                className="object-cover"
              />
            </div>
          </div>

          <div className="mt-12">
            <p className="font-display text-[18px] font-semibold uppercase tracking-[-0.01em] text-ink">
              {coach.name}
            </p>
            <p className="mt-1 text-[15px] text-ink-muted">{coach.role}</p>
          </div>
        </div>

        <div>
          <p className="font-display text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
            {coach.eyebrow}
          </p>

          <SectionHeading tone="onLight" title={coach.title} className="mt-3" />

          <p className="mt-5 max-w-[560px] text-[15px] leading-[1.5] text-ink-soft">
            {coach.bio}
          </p>

          <dl className="mt-8 flex flex-col gap-3">
            {coach.stats.map((stat) => (
              <div
                key={stat.value}
                className="border-2 border-accent px-4 py-2.5 text-center"
              >
                <dt className="text-[12px] font-semibold uppercase tracking-[0.04em] text-accent">
                  {stat.value}
                </dt>
                <dd className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-accent">
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
