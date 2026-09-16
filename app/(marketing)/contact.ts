// Where enquiries go. Change these two values and every "Talk to us" link on
// the marketing pages follows. The WhatsApp number is international format
// with no plus sign or spaces.
export const CONTACT = {
  whatsapp: "254700000000", // PLACEHOLDER: replace with the Tutagora WhatsApp number
  email: "hello@tutagora.com", // PLACEHOLDER: replace with the enquiries address
}

export const waLink = (text: string) => `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`

export const mailLink = (subject: string, body = "") =>
  `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`

export const ENQUIRY = "Hello Tutagora. I would like to talk about using Tutagora at my school."
