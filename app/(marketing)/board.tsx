"use client"

import { useEffect, useRef } from "react"

// A slate surface: near-black with the faint, uneven chalk dust of a board
// that has been wiped a thousand times. Drawn once, never animated.
export function Board() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = (canvas.width = 640)
    const h = (canvas.height = 360)

    ctx.fillStyle = "#0c0d0c"
    ctx.fillRect(0, 0, w, h)

    // Long, low-contrast wipe strokes.
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * h
      const len = 200 + Math.random() * 500
      const x = Math.random() * w - 120
      const grad = ctx.createLinearGradient(x, y, x + len, y)
      grad.addColorStop(0, "rgba(255,255,255,0)")
      grad.addColorStop(0.5, `rgba(255,255,255,${0.012 + Math.random() * 0.02})`)
      grad.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = grad
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((Math.random() - 0.5) * 0.12)
      ctx.fillRect(0, 0, len, 18 + Math.random() * 60)
      ctx.restore()
    }

    // Fine dust.
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 10
      d[i] += n
      d[i + 1] += n
      d[i + 2] += n
    }
    ctx.putImageData(img, 0, 0)
  }, [])

  return <canvas ref={ref} className="board" aria-hidden="true" />
}
