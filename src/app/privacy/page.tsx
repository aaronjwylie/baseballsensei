import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/shared/layout/LegalPage";
import { site } from "@/shared/config/site";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: "Privacy policy",
  description: `How ${site.name} handles the details and files you send us.`,
};

/**
 * The footer and the contact form's consent line link here, so the link
 * resolves rather than 404s.
 *
 * The copy is the client's own (Aaron, 2026-09-16), replacing the placeholder
 * this page carried while it was being drafted. It states plainly what data the
 * product handles and why. Indexable, and listed in `sitemap.ts` next to the
 * terms.
 *
 * TODO(2026-07-30, Ben): have this policy and the terms reviewed by someone
 * qualified, before the site takes live payments. A site taking money and
 * storing video of minors needs both reviewed.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title={{ lead: "Privacy", highlight: "policy" }}>
      <LegalSection title="What we collect">
        <p>
          The details you enter (your name and email, the player&rsquo;s first
          name and age, and anything you type into a submission or the contact
          form) and the files you upload for review. Payments are
          handled by Stripe; we never see or store your full card number.
        </p>
      </LegalSection>

      <LegalSection title="How we use it">
        <p>
          Only to run the coaching service: to deliver the review you paid for,
          to take that one payment, and to reply when you write to us. We
          don&rsquo;t sell your information, and we don&rsquo;t use it for
          advertising.
        </p>
      </LegalSection>

      <LegalSection title="Your files, and minors">
        <p>
          We store the files you upload so the coach assigned to your submission
          can review them. They are not published, and they are not shared
          outside the coaching team. If the player is a minor, the files should
          be submitted by a parent or guardian. Your uploads are deleted after
          your review is delivered.
        </p>
      </LegalSection>

      <LegalSection title="Who else handles it">
        <p>
          A few trusted services process data on our behalf, not for their own
          purposes: Stripe takes the payment, Resend delivers our email, and our
          hosting and file storage run on Vercel. We don&rsquo;t send your
          information anywhere else.
        </p>
      </LegalSection>

      <LegalSection title="Getting in touch">
        <p>
          Questions about your privacy, or want us to delete your data?{" "}
          <a href={`mailto:${site.email}`} className="text-accent underline">
            {site.email}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
