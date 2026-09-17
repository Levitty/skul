import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: "https://tutagora.com/", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://tutagora.com/class", lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ]
}
