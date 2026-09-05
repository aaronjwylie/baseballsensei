import Image from "next/image";
import { Container, SectionHeading } from "@/shared/ui";
import { method } from "../model/copy";

/**
 * The method — three cards on the first of the two blue bands.
 *
 * **The step numbers are generated, not stored.** The design draws "1" on all
 * three badges, which is a copy-paste artefact rather than a statement about
 * ordering; deriving them from the array index means they cannot disagree with
 * the order the steps are actually read in, and a fourth step numbers itself.
 *
 * The badge straddles the top edge of the card, so the card cannot clip its own
 * overflow — hence the ring drawn in blue rather than the white the Figma uses.
 * White is the card's colour, not the band's, and the badge hangs over the band.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-8 bg-accent py-20 lg:py-28">
      <Container>
        <SectionHeading tone="onDark" align="center" title={method.title} />

        <ol className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {method.steps.map((step, index) => (
            <li key={step.title} className="relative rounded-2xl bg-paper pb-8">
              <span
                aria-hidden
                className="absolute -top-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-highlight text-[15px] font-bold text-accent ring-4 ring-accent"
              >
                {index + 1}
              </span>

              {/* The white card padding frames the photo — a white outline with
                  slightly rounded corners, matching the design. */}
              <div className="px-2 pt-2">
                <div className="relative aspect-[306/291] w-full overflow-hidden rounded-xl">
                  <Image
                    src={step.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              </div>

              <div className="px-6 pt-5 text-center">
                <h3 className="font-display text-[22px] font-medium uppercase leading-[1.1] tracking-[-0.01em] text-accent lg:text-[26px]">
                  {step.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.4] text-ink-soft">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
