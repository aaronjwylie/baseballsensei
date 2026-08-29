import { LandingPage, faqPageSchema } from "@/domains/landing";
import { JsonLd, serviceSchema } from "@/shared/seo";

/**
 * Revalidated rather than fully static, because the pricing section reads the
 * price from the `settings` row the admin edits at `/admin/settings`. Five
 * minutes is the window in which a price change is still invisible here — long
 * enough that the page is served from cache to essentially every visitor, short
 * enough that nobody is quoted a stale figure for meaningfully long.
 */
export const revalidate = 300;

export default function Home() {
  return (
    <>
      <LandingPage />
      {/* The FAQ block feeds Google's FAQ rich result; the service + its price
          describe what's on offer. */}
      <JsonLd data={faqPageSchema()} />
      <JsonLd data={serviceSchema()} />
    </>
  );
}
