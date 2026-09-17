import type { MetadataRoute } from "next"
import { SITE } from "./(marketing)/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/class`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ]
}
