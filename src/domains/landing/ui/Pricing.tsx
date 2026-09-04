import Image from "next/image";
import Link from "next/link";
import { ButtonLink, Container } from "@/shared/ui";
import { formatPrice } from "@/shared/config/site";
import { getSettings } from "@/domains/settings";
import { pricing } from "../model/copy";

/**
 * What it costs — a price card floating over the concept photograph.
 *
 * **The image is the point, so it is not flattened.** The photo is the coach
 * watching a swing on the screen; an earlier version dropped a flat `bg-ink/70`
 * over the whole thing and cropped it to a thin band, which hid the very
 * composition it exists to show. Now the band is tall enough to hold the coach
 * on the left and the batter on the screen, and the price sits in its own dark
 * card floating on the right rather than as bare text on a dimmed photo.
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
      className="relative isolate scroll-mt-8 overflow-hidden bg-ink"
    >
      <Image
        src="/images/concept-band.webp"
        alt="A coach watching a batter's swing on screen"
        fill
        sizes="100vw"
        className="object-cover object-[center_22%]"
      />
      {/* A whisper of darkening, not the old flat veil: the photo is already
          moody, and the card carries its own ground, so this only steadies the
          edges rather than hiding the coach and the swing. */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-ink/10 to-ink/45" />

      <Container className="relative flex min-h-[520px] items-center py-16 sm:min-h-[600px] lg:min-h-[680px] lg:py-24">
        {/* The floating card. Frosted and ringed so it reads as a panel resting
            over the photograph, not a hole cut out of it. */}
        <div className="ml-auto w-full max-w-[400px] rounded-2xl bg-ink/80 p-8 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur-md lg:p-10 lg:text-left">
          <p className="font-display text-[64px] font-normal leading-none tracking-[-0.02em] text-highlight lg:text-[80px]">
            {formatPrice(settings.priceCents)}
          </p>
          <p className="mt-2 text-[15px] font-medium text-highlight">
            {pricing.unit}
          </p>

          <ul className="mt-8 flex flex-col gap-3 text-left">
            {pricing.included.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span aria-hidden className="text-highlight">
                  ✓
                </span>
                <span className="text-[15px] text-paper">{item}</span>
              </li>
            ))}
          </ul>

          <ButtonLink
            href="/start"
            variant="primary"
            className="mt-8 w-full justify-center"
          >
            {pricing.cta} <span aria-hidden>→</span>
          </ButtonLink>

          <p className="mt-5 text-center text-[13px] text-paper/80">
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
