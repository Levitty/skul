// The record as a constellation. The learner in the middle, every record
// that knows her around her, and one payment travelling through the graph
// to the four places it is true. Pure SVG; the motion needs no script.

const N: Record<string, [number, number, string, string]> = {
  learner: [260, 210, "The learner", "one file"],
  guardian: [110, 90, "Guardian", "WhatsApp"],
  klass: [410, 90, "Class", "and teacher"],
  timetable: [500, 160, "Timetable", "schemes · exams"],
  invoice: [440, 240, "Invoice", "per term"],
  payment: [400, 340, "Payment", "M-Pesa"],
  books: [260, 380, "The books", "posted"],
  report: [120, 340, "Report card", "marks"],
  bus: [40, 240, "Bus route", "stop · fare"],
  clinic: [30, 150, "Clinic", "inhaler"],
  director: [500, 320, "Director", "Monday"],
}

const E: [string, string][] = [
  ["learner", "guardian"],
  ["learner", "klass"],
  ["klass", "timetable"],
  ["learner", "invoice"],
  ["invoice", "payment"],
  ["payment", "books"],
  ["learner", "report"],
  ["learner", "bus"],
  ["learner", "clinic"],
  ["books", "director"],
  ["timetable", "report"],
]

const path = (keys: string[]) => keys.map((k, i) => `${i ? "L" : "M"}${N[k][0]} ${N[k][1]}`).join(" ")

export function Graph() {
  return (
    <svg className="graph" viewBox="0 0 540 420" role="img" aria-label="The learner at the centre of the record, joined to her guardian, class, timetable, invoice, payment, the books, report card, bus route and clinic. A payment travels from M-Pesa to the invoice, the learner, the guardian, the books and the director.">
      <defs>
        <path id="g-p1" d={path(["payment", "invoice", "learner", "guardian"])} />
        <path id="g-p2" d={path(["payment", "books", "director"])} />
        <path id="g-p3" d={path(["klass", "timetable", "report", "learner"])} />
      </defs>
      <g className="g-edges">
        {E.map(([a, b]) => (
          <line key={a + b} x1={N[a][0]} y1={N[a][1]} x2={N[b][0]} y2={N[b][1]} />
        ))}
      </g>
      <g className="g-nodes">
        {Object.entries(N).map(([k, [x, y, name, sub]]) => (
          <g key={k} className={`g-node ${k === "learner" ? "is-learner" : ""}`} transform={`translate(${x} ${y})`}>
            <circle r={k === "learner" ? 7 : 4} />
            <text y={k === "learner" ? -14 : -10} textAnchor="middle" className="g-name">
              {name}
            </text>
            <text y={k === "learner" ? 24 : 19} textAnchor="middle" className="g-sub">
              {sub}
            </text>
          </g>
        ))}
      </g>
      <g className="g-pulses">
        <circle r="3.5">
          <animateMotion dur="5.2s" repeatCount="indefinite" begin="0s" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
            <mpath href="#g-p1" />
          </animateMotion>
        </circle>
        <circle r="3.5">
          <animateMotion dur="5.2s" repeatCount="indefinite" begin="0s">
            <mpath href="#g-p2" />
          </animateMotion>
        </circle>
        <circle r="3" className="g-dim">
          <animateMotion dur="7s" repeatCount="indefinite" begin="2.5s">
            <mpath href="#g-p3" />
          </animateMotion>
        </circle>
      </g>
    </svg>
  )
}
