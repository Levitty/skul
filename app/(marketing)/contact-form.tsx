"use client"

// The enquiry form. On the exported site it posts to contact.php, which
// emails the enquiry. If sending fails for any reason, the same answers
// become a WhatsApp message so nothing a director typed is lost.

import { useEffect, useRef } from "react"
import { CONTACT } from "./contact"
import { mountForm } from "./form-logic.js"
import { WaGlyph } from "./cta"

export function ContactForm() {
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => mountForm(ref.current), [])
  return (
    <form className="enq" ref={ref} action="/contact.php" method="post" data-wa={CONTACT.whatsapp} noValidate>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="enq-hp" aria-hidden="true" />
      <input type="hidden" name="source" value="" />
      <div className="enq-grid">
        <label>
          <span>Your name</span>
          <input id="enq-name" name="name" type="text" autoComplete="name" required />
        </label>
        <label>
          <span>Your role</span>
          <select id="enq-role" name="role" defaultValue="Director">
            <option>Director</option>
            <option>Head teacher</option>
            <option>Bursar</option>
            <option>Board member</option>
            <option>Other</option>
          </select>
        </label>
        <label>
          <span>School</span>
          <input id="enq-school" name="school" type="text" autoComplete="organization" required />
        </label>
        <label>
          <span>Learners, roughly</span>
          <input id="enq-learners" name="learners" type="text" inputMode="numeric" placeholder="420" />
        </label>
        <label>
          <span>WhatsApp or phone</span>
          <input id="enq-phone" name="phone" type="tel" autoComplete="tel" placeholder="07..." required />
        </label>
        <label>
          <span>Email, if you prefer it</span>
          <input id="enq-email" name="email" type="email" autoComplete="email" />
        </label>
        <label className="enq-wide">
          <span>What would you like?</span>
          <select id="enq-want" name="want" defaultValue="Come and show us the record">
            <option>Come and show us the record</option>
            <option>A demo on a call</option>
            <option>Talk about fees and M-Pesa</option>
            <option>Talk about HR and payroll</option>
            <option>A question first</option>
          </select>
        </label>
        <label className="enq-wide">
          <span>Anything we should know</span>
          <textarea id="enq-msg" name="message" rows={3} placeholder="Branches, the system you use today, when suits you." />
        </label>
      </div>
      <div className="enq-act">
        <button type="submit" className="btn-send">
          <span className="idle">Send</span>
          <span className="busy">Sending…</span>
        </button>
        <span className="enq-note">We reply the same day, on WhatsApp unless you ask for email.</span>
      </div>
      <p className="enq-err" role="alert">
        That did not send. <a className="btn-wa sm" href="#" target="_blank" rel="noopener"><WaGlyph /><span>Send it on WhatsApp instead</span></a>
      </p>
      <div className="enq-done" aria-live="polite">
        <b>Thank you. We have your enquiry.</b>
        <span>We will reply today, on WhatsApp unless you asked for email. If you would rather not wait, the green button below is us.</span>
      </div>
    </form>
  )
}
