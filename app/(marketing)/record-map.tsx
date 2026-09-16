"use client"

// One child's record: the learner in the centre, and around her the records
// that know her, each on a chalk line with the relationship written on it.
// The lines draw themselves on scroll (see sketches.tsx); the labels arrive
// as each line lands. On a phone the same content unrolls as a list.

import { useCallback, useState } from "react"
import { SketchRecord } from "./sketches"

// Angles must match RECORD_NODES in the sketch generator.
const NODES = [
  { key: "class", a: -57.3, rel: "belongs to", name: "Grade 6 East", detail: "44 learners · Ms Adhiambo" },
  { key: "teacher", a: -24.5, rel: "taught by", name: "Ms Adhiambo", detail: "Class teacher · 26 periods a week" },
  { key: "maths", a: 8.2, rel: "scored", name: "Mathematics 84", detail: "Term 2 exam · Mr Kamau" },
  { key: "report", a: 40.9, rel: "reported in", name: "Report card, Term 2", detail: "Mean 80 · sent on WhatsApp" },
  { key: "library", a: 73.6, rel: "borrowed", name: "Weep Not, Child", detail: "Library · due Friday" },
  { key: "attendance", a: 106.4, rel: "present", name: "Tuesday, 6 of 6 periods", detail: "Register taken by phone" },
  { key: "clinic", a: 139.1, rel: "visited", name: "Clinic, 3 Sep", detail: "Headache · rested one period" },
  { key: "bus", a: 171.8, rel: "rides", name: "Route 3, Kawangware", detail: "Bus KDA 412T · stop 7" },
  { key: "payment", a: 204.5, rel: "settled by", name: "M-Pesa SGH4K2L9PQ", detail: "KES 42,500 · 14 Sep, 07:42" },
  { key: "invoice", a: 237.3, rel: "invoiced", name: "Term 2, KES 42,500", detail: "INV-2026-T2-0416 · balance 0" },
  { key: "guardian", a: 270, rel: "seen by", name: "Mama Amani", detail: "Guardian · on WhatsApp" },
]

function pos(a: number) {
  const r = (a * Math.PI) / 180
  return { x: 600 + Math.cos(r) * 470, y: 320 + Math.sin(r) * 236 }
}

export function RecordMap() {
  const [drawn, setDrawn] = useState(false)
  const onDraw = useCallback(() => setDrawn(true), [])
  return (
    <div className={`record ${drawn ? "is-drawn" : ""}`}>
      <div className="record-lines" aria-hidden="true">
        <SketchRecord onDraw={onDraw} />
      </div>
      <div className="record-child" style={{ left: "50%", top: "50%" }}>
        <span className="record-name">Amani Wanjiru</span>
        <span className="record-detail">Grade 6 East · STU-0416</span>
      </div>
      <ol className="record-nodes">
        {NODES.map((n, i) => {
          const p = pos(n.a)
          const mid = { x: 600 + (p.x - 600) * 0.56, y: 320 + (p.y - 320) * 0.56 }
          const vars = {
            "--x": `${(p.x / 1200) * 100}%`,
            "--y": `${(p.y / 640) * 100}%`,
            "--mx": `${(mid.x / 1200) * 100}%`,
            "--my": `${(mid.y / 640) * 100}%`,
            "--i": i,
          } as React.CSSProperties
          return (
            <li key={n.key} className="record-node" style={vars}>
              <span className="record-rel">{n.rel}</span>
              <span className="record-box">
                <span className="record-name">{n.name}</span>
                <span className="record-detail">{n.detail}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
