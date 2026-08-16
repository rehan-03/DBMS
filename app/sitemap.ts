import type { MetadataRoute } from "next";

const BASE_URL = "https://campulse-kkw.vercel.app";

/**
 * Generates the sitemap for CamPulse.
 *
 * Only the publicly accessible (pre-auth) landing page is included.
 * All authenticated routes (/student, /staff, /hod, /admin, /api)
 * are excluded — they are gated by NextAuth and must not be indexed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
