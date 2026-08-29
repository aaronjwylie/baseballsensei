/**
 * Structured data that describes the brand and the service, for search engines.
 *
 * These read only `shared` config (the site facts and the base URL), so they
 * stay in `shared`. The FAQ schema lives in the landing domain instead, because
 * it's built from that domain's copy.
 *
 * The `@id`s are stable anchors (`#organization`, `#website`) so the separate
 * blocks can reference one another into a single connected graph rather than
 * three unrelated entities.
 */
import { env } from "@/shared/config/env";
import { site } from "@/shared/config/site";

export function organizationSchema() {
  const base = env.siteUrl;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: site.name,
    url: base,
    logo: `${base}/images/logo.svg`,
    image: `${base}/images/hero-home.webp`,
    description: site.subhead,
    email: site.email,
    knowsLanguage: ["en", "ja"],
    contactPoint: {
      "@type": "ContactPoint",
      email: site.email,
      contactType: "customer support",
      availableLanguage: ["English", "Japanese"],
    },
  };
}

export function websiteSchema() {
  const base = env.siteUrl;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: site.name,
    url: base,
    inLanguage: "en",
    publisher: { "@id": `${base}/#organization` },
  };
}

export function serviceSchema() {
  const base = env.siteUrl;
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${site.name} coaching review`,
    serviceType: "Online baseball coaching feedback",
    description: site.subhead,
    provider: { "@id": `${base}/#organization` },
    areaServed: "Worldwide",
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: `${base}/start`,
    },
    offers: {
      "@type": "Offer",
      // The live figure is the operator's `settings.priceCents`; this uses the
      // documented default so the schema needn't make the page dynamic.
      price: (site.price.amountCents / 100).toFixed(2),
      priceCurrency: site.price.currency.toUpperCase(),
      url: `${base}/start`,
      availability: "https://schema.org/InStock",
    },
  };
}
