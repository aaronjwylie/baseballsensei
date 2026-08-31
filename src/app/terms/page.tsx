import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/shared/layout/LegalPage";
import { site, formatPrice } from "@/shared/config/site";
import { getSettings } from "@/domains/settings";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  title: "Terms and conditions",
  description: `The terms covering a ${site.name} video review.`,
  robots: { index: false },
};

/**
 * The wireframe's footer links here, so the link resolves rather than 404s.
 *
 * ⚠️ **This is a placeholder, not legal copy.** It states plainly what the
 * product does and what a customer is buying, and says so — a page that *looked*
 * like finished terms while being written by nobody qualified would be worse
 * than an obvious stub. `noindex` until it's real.
 *
 * TODO(2026-07-30, Ben): replace with terms and a privacy policy reviewed by
 * someone qualified, before the site takes live payments. A site taking money
 * and storing video of minors needs both.
 */
export default async function TermsPage() {
  const settings = await getSettings();
  return (
    <LegalPage
      title={{ lead: "Terms and", highlight: "conditions" }}
      intro="These terms are still being drafted. What follows describes how the service works today; it is not a substitute for the reviewed terms that will replace this page before launch."
    >
      <LegalSection title="What you're buying">
        <p>
          One review, by one coach, of the files you attach to a single
          submission (video, images, or documents) for{" "}
          {formatPrice(settings.priceCents)} {site.price.unit}. There is no
          subscription and no recurring charge. Payment is taken once, at
          checkout, by Stripe.
        </p>
      </LegalSection>

      <LegalSection title="What you receive">
        <p>
          A personal response from your coach, delivered within {site.turnaround}{" "}
          of your files reaching us. We email you the moment it&rsquo;s ready, and
          it stays available at the link in that email.
        </p>
      </LegalSection>

      <LegalSection title="Your files">
        <p>
          We store the files you upload so the coach assigned to your submission
          can review them. They are not published, and they are not shared
          outside the coaching team. If the player is a minor, the files should
          be submitted by a parent or guardian. Your uploads are deleted after
          your review is delivered; the coach&rsquo;s response stays available at
          the link we email you.
        </p>
      </LegalSection>

      <LegalSection title="Getting in touch">
        <p>
          Questions about a submission or a charge:{" "}
          <a href={`mailto:${site.email}`} className="text-accent underline">
            {site.email}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
