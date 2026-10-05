import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";

/**
 * The share routes are deliberately absent: they are capability URLs holding a
 * visitor's own docket, so listing them would invite indexing of private records.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const routes = ["", "/plates", "/terms", "/agent", "/export"];
  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
