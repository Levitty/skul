import type { Metadata } from "next"
import localFont from "next/font/local"
import "./marketing.css"

const geist = localFont({
  src: [{ path: "./fonts/Geist-Variable.woff2", weight: "300 700", style: "normal" }],
  variable: "--font-geist",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Tutagora",
  description:
    "School management software for schools in Kenya. Fees on M-Pesa, parents on WhatsApp, one record that adds up.",
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`mk ${geist.variable}`}>{children}</div>
}
