// What search engines and link previews are told about Tutagora. One place,
// used by the app's metadata and by the static build.

import { CONTACT } from "./contact"

export const SITE = "https://tutagora.com"

export const HOME_TITLE = "Tutagora · School management software for Kenyan schools"
export const HOME_DESC =
  "School management system for private schools in Kenya. Fees on M-Pesa, parents on WhatsApp, HR and payroll, report cards and the books, on one record for the whole school."

export const CLASS_TITLE = "The class · How Tutagora runs a school as one record"
export const CLASS_DESC =
  "Nine short periods on how a school runs as one record: the learner at the centre, fees collected on M-Pesa, parents reached on WhatsApp, staff and payroll, and a Monday briefing for the director."

// Questions directors ask before they call. Every answer is true of the
// product today; nothing here is a plan.
export const FAQ: { q: string; a: string }[] = [
  {
    q: "What is Tutagora?",
    a: "A school management system built in Kenya for private primary and secondary schools and school groups. It runs admissions, learner records, fees, the books, timetables, exams and report cards, HR and payroll, transport, the library and the clinic on one record, and talks to parents on WhatsApp.",
  },
  {
    q: "How do parents pay school fees?",
    a: "By M-Pesa, from a Pay button on WhatsApp or the usual paybill, and by card. Every payment matches its invoice on arrival and posts to the school's books, so the bursar's receipts and the director's cash position are the same number.",
  },
  {
    q: "Do parents need to install an app?",
    a: "No. The school's WhatsApp number answers with the balance, a Pay button, the statement and the report card. Reminders and notices go only to the families they concern.",
  },
  {
    q: "Does it cover staff and payroll?",
    a: "Yes. Every employee, teaching and support, has one record: recruitment, contracts and letters, probation, leave, attendance, training, payroll and the clearance when someone leaves. Teaching load comes from the timetable.",
  },
  {
    q: "Can it run a group of schools?",
    a: "Yes. Branches share one model of the group. The director sees collection, cost and staff by branch, and staff move between branches without leaving and rejoining.",
  },
  {
    q: "What does it cost?",
    a: "A flat licence per term, per branch, with no charge per user, so making every teacher and driver part of the record costs nothing extra. Ask us for the figure for your school.",
  },
  {
    q: "How long does set-up take?",
    a: "An afternoon: classes, the fee structure, and a bulk import of learners from the spreadsheet the school already has. Historic balances come in as opening balances.",
  },
  {
    q: "Who can see what?",
    a: "Roles decide it. The bursar sees money, the teacher sees learning, the head sees both as totals. Every record is locked to its school and every change is logged, in line with Kenya's Data Protection Act.",
  },
]

export function jsonLd() {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Tutagora",
    url: SITE,
    logo: `${SITE}/icon.svg`,
    email: CONTACT.email,
    telephone: `+${CONTACT.whatsapp}`,
    areaServed: "KE",
    address: { "@type": "PostalAddress", addressCountry: "KE" },
    contactPoint: [{ "@type": "ContactPoint", contactType: "sales", telephone: `+${CONTACT.whatsapp}`, email: CONTACT.email, availableLanguage: ["en", "sw"] }],
  }
  const app = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Tutagora",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE,
    description: HOME_DESC,
    offers: { "@type": "Offer", priceCurrency: "KES", description: "Flat licence per term, per branch." },
    featureList: [
      "School fees on M-Pesa",
      "Parents on WhatsApp",
      "Admissions and learner records",
      "Timetables, exams and report cards",
      "HR, leave and payroll",
      "Double-entry books",
      "Transport, library and clinic",
      "Weekly briefing for the director",
    ],
  }
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  }
  return [org, app, faq]
}
