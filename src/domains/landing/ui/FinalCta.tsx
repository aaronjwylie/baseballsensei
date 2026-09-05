import Image from "next/image";
import { ButtonLink, Container, SectionHeading } from "@/shared/ui";
import { finalCta } from "../model/copy";

/**
 * The ask — a short dark band, one heading, one button.
 *
 * Deliberately the thinnest section on the page. Everything above it has
 * already made the argument; this exists so that a visitor who scrolled the
 * whole way does not have to scroll back up to act.
 */
export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden bg-ink py-16 lg:py-20">
      <Image
        src="/images/footer-band.webp"
        alt=""
        fill
        sizes="100vw"
        className="object-cover object-[center_77%]"
      />
      <div className="absolute inset-0 bg-ink/65" />

      <Container className="relative flex flex-col items-center gap-7 text-center">
        <SectionHeading tone="onDark" align="center" title={finalCta.title} />
        <ButtonLink href="/start" variant="primary">
          {finalCta.cta} <span aria-hidden>→</span>
        </ButtonLink>
      </Container>
    </section>
  );
}
