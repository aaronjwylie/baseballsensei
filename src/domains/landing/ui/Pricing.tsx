import Image from "next/image";
import Link from "next/link";
import { ButtonLink, Container } from "@/shared/ui";
import { formatPrice } from "@/shared/config/site";
import { getSettings } from "@/domains/settings";
import { pricing } from "../model/copy";

/**
 * What it costs — a price block over a full-bleed photograph.
 *
 * **The number is read, not written.** The design draws "80$" and it is
 * currently right, but the price is a `settings` row the admin edits at
 * `/admin/settings` ([ADR 012](docs/decisions/012-retention-and-operator-settings.md)).
 * Transcribing it would mean the landing page keeps quoting the old figure the
 * moment he changes it — a page that lies about price is worse than a page that
 * costs a query.
 *
 * Rendered `$80` rather than the design's `80$`: `formatPrice` is the app's one
 * money formatter and it follows en-CA, which the receipt email and the payment
 * step already use. Two spellings of the same amount on one purchase is a
 * support ticket.
 *
 * This is what makes `/` an ISR page rather than a fully static one — see the
 * `revalidate` in `app/page.tsx`.
 */
export async function Pricing() {
  const settings = await getSettings();

  return (
    <section
      id="pricing"
      className="relative isolate scroll-mt-8 overflow-hidden bg-ink py-20 lg:py-28"
    >
      <Image
        src="/images/concept-band.webp"
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-ink/70" />

      <Container className="relative">
        <div className="ml-auto max-w-[380px] text-center lg:text-left">
          <p className="font-display text-[64px] font-normal leading-none tracking-[-0.02em] text-highlight lg:text-[88px]">
            {formatPrice(settings.priceCents)}
          </p>
          <p className="mt-2 text-[15px] text-paper">{pricing.unit}</p>

          <ul className="mt-8 flex flex-col gap-3 text-left">
            {pricing.included.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 text-highlight">
                  ✓
                </span>
                <span className="text-[15px] text-paper">{item}</span>
              </li>
            ))}
          </ul>

          <ButtonLink href="/start" variant="primary" className="mt-8">
            {pricing.cta} <span aria-hidden>→</span>
          </ButtonLink>

          <p className="mt-5 text-[13px] text-paper">
            {pricing.contactPrompt}{" "}
            <Link
              href="/contact"
              className="text-highlight underline underline-offset-4 hover:opacity-80"
            >
              {pricing.contactLink}
            </Link>
          </p>
        </div>
      </Container>
    </section>
  );
}
