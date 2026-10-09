import type { Metadata } from "next"
import Link from "next/link"
import { Mark } from "../logo"
import { CONTACT, mailLink, ENQUIRY } from "../contact"
import { WaButton } from "../cta"
import { ContactForm } from "../contact-form"

// The enquiry page on its own: the landing for an advert. Nothing to read
// first, nothing to scroll past. The form, and the two other ways to reach us.

export const CONTACT_TITLE = "Talk to Tutagora · School management software for Kenyan schools"
export const CONTACT_DESC = "Tell us about your school and we will come and show you the record, in person or on a call. Fees on M-Pesa, parents on WhatsApp, HR and payroll, on one record."

export const metadata: Metadata = {
  title: { absolute: CONTACT_TITLE },
  description: CONTACT_DESC,
  alternates: { canonical: "/contact" },
  openGraph: { title: CONTACT_TITLE, description: CONTACT_DESC, url: "/contact" },
}

export default function ContactPage() {
  return (
    <div className="contact-page">
      <header className="nav wrap static">
        <Link href="/" className="brand" aria-label="Tutagora home">
          <Mark size={30} title="" reverse />
          <span className="wordmark">Tutagora</span>
        </Link>
        <nav aria-label="Primary">
          <ul>
            <li><Link className="quiet" href="/">Front page</Link></li>
            <li><Link className="quiet" href="/class">The class</Link></li>
          </ul>
        </nav>
      </header>
      <main>
        <section className="close cta-end" id="contact">
          <div className="wrap">
            <div className="close-text">
              <div className="label">Talk to us</div>
              <h2>Bring your school into one record.</h2>
              <p className="close-sub">
                Fees on M-Pesa, parents on WhatsApp, HR and payroll, report cards and the books,
                on one record for the whole school. Tell us about yours and we will come and show
                you, in person or on a call. We reply the same day.
              </p>
              <div className="actions">
                <WaButton>Talk to us on WhatsApp</WaButton>
                <a className="quiet" href={mailLink("Enquiry about Tutagora", ENQUIRY)}>
                  Email {CONTACT.email}
                </a>
              </div>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>
      <footer>
        <div className="wrap">
          <span className="brand">
            <Mark size={26} title="" reverse />
            <span className="wordmark">Tutagora</span>
          </span>
          <ul>
            <li><Link className="quiet" href="/">Front page</Link></li>
            <li><Link className="quiet" href="/class">The class</Link></li>
          </ul>
          <span className="num">© 2026 Tutagora · Kenya</span>
        </div>
      </footer>
    </div>
  )
}
