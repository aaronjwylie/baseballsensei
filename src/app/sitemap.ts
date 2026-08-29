import type { MetadataRoute } from "next";
import { env } from "@/shared/config/env";

/**
 * The indexable public pages. The stateful funnel steps, status/feedback
 * lookups, and the portal are deliberately absent — they're either private or
 * not content a search result should land on.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.siteUrl;
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/start`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
