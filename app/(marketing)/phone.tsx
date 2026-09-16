// A phone, drawn in CSS, showing a WhatsApp conversation. Used on the class
// page wherever the school talks to someone on their own phone. Everything
// here is example content; nothing is fetched.

import type { ReactNode } from "react"

const Signal = () => (
  <svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true">
    <rect x="0" y="8" width="3" height="4" rx="0.6" fill="currentColor" />
    <rect x="5" y="5.5" width="3" height="6.5" rx="0.6" fill="currentColor" />
    <rect x="10" y="3" width="3" height="9" rx="0.6" fill="currentColor" />
    <rect x="15" y="0" width="3" height="12" rx="0.6" fill="currentColor" />
  </svg>
)

const Wifi = () => (
  <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M1 4.2a10 10 0 0 1 14 0" />
    <path d="M3.6 6.9a6.3 6.3 0 0 1 8.8 0" />
    <path d="M6.2 9.5a2.6 2.6 0 0 1 3.6 0" />
  </svg>
)

const Battery = () => (
  <svg viewBox="0 0 27 12" width="27" height="12" aria-hidden="true">
    <rect x="0.75" y="0.75" width="22" height="10.5" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
    <rect x="2.5" y="2.5" width="18.5" height="7" rx="1.6" fill="currentColor" />
    <path d="M24.5 4v4a2 2 0 0 0 0-4z" fill="currentColor" fillOpacity="0.45" />
  </svg>
)

const Back = () => (
  <svg viewBox="0 0 12 20" width="12" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2L2 10l8 8" />
  </svg>
)

const Video = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="13" height="12" rx="2.5" />
    <path d="M16 10l5-3v10l-5-3z" />
  </svg>
)

const Call = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
)

const Ticks = () => (
  <svg className="ticks" viewBox="0 0 20 12" width="18" height="11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 6.5l3.5 3.5L11 3" />
    <path d="M8 6.5l3.5 3.5L18 3" />
  </svg>
)

const Reply = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h9a7 7 0 0 1 7 7v4" />
  </svg>
)

const Plus = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const Camera = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)

const Mic = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)

const Sticker = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9z" />
    <path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
  </svg>
)

export function Phone({
  time,
  day,
  name,
  sub = "online",
  label,
  children,
}: {
  time: string
  day: string
  name: string
  sub?: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="ph" role="img" aria-label={label}>
      <div className="ph-screen">
        <div className="ph-island" aria-hidden="true" />
        <div className="ph-status num" aria-hidden="true">
          <span>{time}</span>
          <span className="ph-icons">
            <Signal />
            <Wifi />
            <Battery />
          </span>
        </div>
        <div className="wa-top" aria-hidden="true">
          <span className="wa-back">
            <Back />
            <span className="num">3</span>
          </span>
          <span className="wa-av">{name.slice(0, 1).toUpperCase()}</span>
          <span className="wa-who">
            <strong>{name}</strong>
            <span>{sub}</span>
          </span>
          <span className="wa-acts">
            <Video />
            <Call />
          </span>
        </div>
        <div className="wa-chat">
          <span className="wa-pill num">{day}</span>
          <span className="wa-pill wa-lock">Messages and calls are end-to-end encrypted.</span>
          {children}
        </div>
        <div className="wa-input" aria-hidden="true">
          <Plus />
          <span className="wa-field">
            <span>Message</span>
            <Sticker />
          </span>
          <Camera />
          <Mic />
        </div>
        <div className="ph-home" aria-hidden="true" />
      </div>
    </div>
  )
}

export const In = ({ at, children }: { at: string; children: ReactNode }) => (
  <div className="bub in">
    <div className="bub-body">{children}</div>
    <span className="bub-meta num">
      <time>{at}</time>
    </span>
  </div>
)

export const Out = ({ at, children }: { at: string; children: ReactNode }) => (
  <div className="bub out">
    <div className="bub-body">{children}</div>
    <span className="bub-meta num">
      <time>{at}</time>
      <Ticks />
    </span>
  </div>
)

export const Replies = ({ items }: { items: string[] }) => (
  <div className="wa-replies">
    {items.map((t) => (
      <span key={t}>
        <Reply />
        {t}
      </span>
    ))}
  </div>
)
