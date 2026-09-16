import type { Metadata } from "next"
import localFont from "next/font/local"
import "./marketing.css"

const serif = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-serif",
  display: "swap",
})

const sans = localFont({
  src: [
    { path: "./fonts/InstrumentSans-Variable.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/InstrumentSans-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Tutagora — School management software for schools in Kenya",
  description:
    "Admissions, fees, attendance, exams and report cards in one record that adds up. Parents reached on WhatsApp, payments by M-Pesa, reconciled automatically.",
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`mk ${serif.variable} ${sans.variable}`}>{children}</div>
}
