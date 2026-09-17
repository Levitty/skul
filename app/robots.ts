import type { MetadataRoute } from "next"
import { SITE } from "./(marketing)/seo"

// The marketing pages are for search engines. The app itself is not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/class"],
        disallow: ["/dashboard", "/api", "/parent-portal", "/student-portal", "/magic", "/apply", "/login", "/signup"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
