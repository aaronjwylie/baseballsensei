import { faqs } from "./copy";

/**
 * FAQ structured data (schema.org `FAQPage`).
 *
 * Built from the *same* `faqs` the page renders, so the rich result Google shows
 * can never say something the page doesn't. When a page and its structured data
 * disagree, Google penalises the page — sharing the source is the guard.
 */
export function faqPageSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
