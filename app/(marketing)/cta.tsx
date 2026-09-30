"use client"

// Ways to reach us, everywhere on the page. One green WhatsApp button that
// reads the same wherever it sits, a band that closes a section with an
// invitation, and a button that follows the reader once the hero is gone.

import { useEffect, useRef } from "react"
import { CONTACT, waLink, mailLink, ENQUIRY } from "./contact"
import { mountFloat } from "./cta-logic.js"

export const WaGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3.3 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.2l-.9 1.1c-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.5-.9-.8-1.5-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.5-.4-.5-.6-.5h-.5Z" />
  </svg>
)

export function WaButton({ text = ENQUIRY, children = "Talk to us on WhatsApp", small = false }: { text?: string; children?: React.ReactNode; small?: boolean }) {
  return (
    <a className={`btn-wa${small ? " sm" : ""}`} href={waLink(text)} target="_blank" rel="noopener">
      <WaGlyph />
      <span>{children}</span>
    </a>
  )
}

// Closes a section with an invitation. `light` for the white sections.
export function Band({ title, sub, text = ENQUIRY, light = false, button = "Talk to us on WhatsApp" }: { title: string; sub?: string; text?: string; light?: boolean; button?: string }) {
  return (
    <div className={`cta-band${light ? " light" : ""}`}>
      <div className="wrap">
        <div className="cta-text">
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        <div className="cta-act">
          <WaButton text={text}>{button}</WaButton>
          <a className="quiet" href={mailLink("Enquiry about Tutagora", text)}>
            or email {CONTACT.email}
          </a>
        </div>
      </div>
    </div>
  )
}

// A button that follows the reader once the top of the page has gone.
export function FloatWa({ text = ENQUIRY }: { text?: string }) {
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => mountFloat(ref.current), [])
  return (
    <a className="wa-float" href={waLink(text)} target="_blank" rel="noopener" ref={ref} aria-label="Talk to us on WhatsApp">
      <WaGlyph />
      <span>WhatsApp us</span>
    </a>
  )
}
