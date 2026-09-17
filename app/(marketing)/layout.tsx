import type { Metadata } from "next"
import localFont from "next/font/local"
import "./marketing.css"
import { SITE, HOME_TITLE, HOME_DESC } from "./seo"

const geist = localFont({
  src: [{ path: "./fonts/Geist-Variable.woff2", weight: "300 700", style: "normal" }],
  variable: "--font-geist",
  display: "swap",
})

// Chalk handwriting, used only for what the teacher writes on the board.
const hand = localFont({
  src: [{ path: "./fonts/Caveat-Variable.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-hand",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: HOME_TITLE, template: "%s · Tutagora" },
  description: HOME_DESC,
  applicationName: "Tutagora",
  keywords: [
    "school management system Kenya",
    "school management software Kenya",
    "school fees management software",
    "M-Pesa school fees",
    "school ERP Kenya",
    "parent communication WhatsApp school",
    "school HR and payroll software",
    "report card software Kenya",
    "private school software Nairobi",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Tutagora",
    locale: "en_KE",
    url: SITE,
    title: HOME_TITLE,
    description: HOME_DESC,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Tutagora. Manage your school with confidence." }],
  },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESC, images: ["/og.png"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  icons: { icon: "/icon.svg", apple: "/apple-icon.svg" },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`mk ${geist.variable} ${hand.variable}`}>{children}</div>
}
