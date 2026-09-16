// The Tutagora mark: a hot-air balloon wearing a graduation cap.
// Vector recreation of the supplied logo. Replace the paths with the
// official artwork when it is added to public/brand/.

export const BRAND = {
  navy: "#1b3a5c",
  orange: "#f4a21d",
  orangeLight: "#f9c56e",
}

// `reverse` is the dark-ground version: navy becomes white, the face becomes
// the ground, the orange stays. Use it on black. The default is for white.
export function Mark({
  size = 28,
  title = "Tutagora",
  reverse = false,
}: {
  size?: number
  title?: string
  reverse?: boolean
}) {
  const ink = reverse ? "#f2f2f0" : BRAND.navy
  const face = reverse ? "#0b0b0b" : "#ffffff"
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={title}
    >
      {/* motion arc */}
      <path
        d="M96 30 A44 44 0 0 1 96 84"
        fill="none"
        stroke={BRAND.orangeLight}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* envelope */}
      <circle cx="58" cy="56" r="38" fill={BRAND.orange} />
      {/* face ring */}
      <circle cx="54" cy="58" r="29" fill={face} stroke={ink} strokeWidth="8" />
      {/* smile */}
      <path d="M45 60 Q54 69 63 60" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
      {/* mortarboard */}
      <path d="M54 8 L84 20 L54 32 L24 20 Z" fill={ink} />
      <rect x="44" y="24" width="20" height="10" rx="4" fill={ink} />
      <path d="M84 20 L86 34" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <circle cx="86" cy="36" r="2.5" fill={ink} />
      {/* neck and basket */}
      <path d="M44 88 L50 100 M64 88 L58 100" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      <rect x="45" y="100" width="18" height="12" rx="2.5" fill={ink} />
      <path d="M45 105 H63" stroke={face} strokeWidth="1.8" />
    </svg>
  )
}
