import type { Metadata } from "next";
import Image from "next/image";
import { ButtonLink, Container, SectionHeading } from "@/shared/ui";
import { site } from "@/shared/config/site";
import { ContactForm, sendContactAction } from "@/domains/contact";

export const metadata: Metadata = {
  alternates: { canonical: "/contact" },
  title: "Contact",
  description: `Get in touch with ${site.name} about a submission or a question before you buy.`,
};

/**
 * Two bands, from Audrey's Figma: the form on a dark ground, then the nudge for
 * anyone who came here ready to buy rather than ready to ask.
 *
 * **This replaces a deliberate mailto stub.** That page's own comment said a
 * form "needs a route, validation, spam handling, and somewhere for the message
 * to land, and none of that is worth building before anyone has written in".
 * All four now exist — a server action, a shared Zod schema, a honeypot, and
 * `site.email` — so the reason has expired rather than been overruled.
 *
 * The design's second band exists because a contact form is the wrong tool for
 * "I want coaching": it puts a person in a queue for a reply when they were
 * ready to start. Sending them to `/start` instead is the whole point of it.
 */
export default function ContactPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink">
        <Image
          src="/images/contact-ground.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/80" />

        <Container className="relative pb-24 pt-[140px] lg:pb-28 lg:pt-[170px]">
          <SectionHeading
            as="h1"
            tone="onDark"
            align="center"
            title={{ lead: "Have a", highlight: "question?" }}
          />

          <div className="mt-12">
            <ContactForm onSubmit={sendContactAction} />
          </div>
        </Container>
      </section>

      <section className="relative isolate overflow-hidden bg-ink py-16 lg:py-20">
        <Image
          src="/images/footer-band.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/70" />

        <Container className="relative flex flex-col items-center gap-5 text-center">
          <SectionHeading
            tone="onDark"
            align="center"
            title={{ lead: "Ready for", highlight: "coaching?" }}
          />
          <p className="max-w-[520px] text-[15px] leading-[1.5] text-paper">
            If you&rsquo;re ready to get feedback on your game, you can skip the
            contact form and send your materials directly to a coach.
          </p>
          <ButtonLink href="/start" variant="primary">
            Get coach feedback <span aria-hidden>→</span>
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}
