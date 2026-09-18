"use client"

// Holds a block still while the section after it slides up and covers it,
// like a blind being drawn. The block pins with its bottom edge at the bottom
// of the screen, so nothing of it is lost however tall it is, and it is
// released as soon as the covering section has passed. While covered it
// settles back a little, which reads as depth.

import { useEffect, useRef, type ReactNode } from "react"

export function Pin({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const inner = el.firstElementChild as HTMLElement | null
    const cover = el.nextElementSibling as HTMLElement | null
    const size = () => el.style.setProperty("--pin-h", `${el.offsetHeight}px`)
    const ro = "ResizeObserver" in window ? new ResizeObserver(size) : null
    ro?.observe(el)
    size()
    let raf = 0
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const onScroll = () => {
      if (still || !inner || !cover) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = cover.getBoundingClientRect()
        const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / window.innerHeight))
        inner.style.transform = p > 0 ? `translateY(${p * 48}px) scale(${1 - p * 0.03})` : ""
        inner.style.opacity = p > 0 ? String(1 - p * 0.45) : ""
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [])
  return (
    <div className="pin" ref={ref}>
      <div className="pin-inner">{children}</div>
    </div>
  )
}
