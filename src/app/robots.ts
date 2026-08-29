import type { MetadataRoute } from "next";
import { env } from "@/shared/config/env";

/**
 * robots.txt. The public marketing pages are open; everything functional or
 * private — the operator portal, the status and feedback lookups, the QA board,
 * and the API — is kept out of the index.
 *
 * Pre-launch the whole site sits behind HTTP Basic Auth, so nothing is crawlable
 * yet regardless; this is what should hold once that gate is lifted.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/coach",
        "/account",
        "/login",
        "/forgot-password",
        "/reset-password",
        "/portal",
        "/translator",
        "/qa",
        "/status",
        "/feedback",
        "/api/",
      ],
    },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
