"use client"

// Welcome to class. The chalkboard fills the screen and stays put for the
// whole lesson. Short cards scroll over it on the left, each one in a slot
// taller than the screen. When a card reaches the middle of the screen the
// board takes a step: a new period is rubbed out and rewritten, a new card
// within the same period adds a line. Steps run on a timer, about a second,
// and reverse when you scroll back. Ordinary scrolling throughout.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { Board } from "./board"
import { Mark } from "./logo"

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const PERIODS = [
  { id: "period-1", time: "8:00", n: 1, name: "The record" },
  { id: "period-2", time: "8:40", n: 2, name: "The learner" },
  { id: "period-3", time: "9:20", n: 3, name: "The lesson" },
  { id: "period-4", time: "10:00", n: 4, name: "The teacher" },
  { id: "period-5", time: "10:40", n: 5, name: "The school" },
  { id: "period-6", time: "11:20", n: 6, name: "Tomorrow" },
  { id: "homework", time: "12:00", n: 0, name: "Homework" },
]

const kes = (n: number) => "KES " + Math.round(n).toLocaleString("en-KE")
const num = (n: number) => Math.round(n).toLocaleString("en-KE")

function parse(v: string, fallback: number) {
  const n = Number(String(v).replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

type Step = { period: string; step: number }

// A card in a slot taller than the screen. Declared at module level so the
// elements are stable and the observer keeps watching them across renders.
function Slot({
  period,
  step,
  children,
  id,
}: {
  period: string
  step: number
  children: ReactNode
  id?: string
}) {
  return (
    <div className="slot" data-period={period} data-step={step} id={id}>
      <div className="note">{children}</div>
    </div>
  )
}

// ---------- the board ----------

function Chalkboard({
  at,
  lines,
}: {
  at: Step
  lines: (period: string) => ReactNode[]
}) {
  const [shown, setShown] = useState(at.period)
  const [phase, setPhase] = useState<"on" | "wipe">("on")
  useEffect(() => {
    if (at.period === shown) return
    setPhase("wipe")
    const t = window.setTimeout(() => {
      setShown(at.period)
      setPhase("on")
    }, 620)
    return () => window.clearTimeout(t)
  }, [at.period, shown])
  const all = lines(shown)
  const visible = shown === at.period ? at.step : all.length
  return (
    <div className={`chalkboard ${phase}`} aria-live="polite">
      <Board />
      <div className="duster" aria-hidden="true" />
      <div className="chalk" key={shown}>
        {all.map((l, i) => (
          <p key={i} className={`${i === 0 ? "chalk-h" : ""} ${i <= visible ? "in" : "out"}`}>
            {l}
          </p>
        ))}
      </div>
    </div>
  )
}

// ---------- the class ----------

export function ClassRoom() {
  const [school, setSchool] = useState("")
  const [learnersIn, setLearnersIn] = useState("420")
  const [feeIn, setFeeIn] = useState("42500")
  const [unpaidIn, setUnpaidIn] = useState("30")
  const [costsIn, setCostsIn] = useState("")
  const [at, setAt] = useState<Step>({ period: "door", step: 9 })
  const [progress, setProgress] = useState(0)

  const m = useMemo(() => {
    const learners = parse(learnersIn, 420)
    const fee = parse(feeIn, 42500)
    const unpaid = Math.min(95, parse(unpaidIn, 30))
    const invoiced = learners * fee
    const collected = invoiced * (1 - unpaid / 100)
    const outstanding = invoiced - collected
    const families = Math.round(learners * 0.72)
    const unpaidFamilies = Math.round(families * (unpaid / 100))
    // A term's fees spread over four months, and a school that keeps a fifth.
    const defaultCosts = Math.round((invoiced / 4) * 0.8)
    const costs = costsIn ? parse(costsIn, defaultCosts) : defaultCosts
    const runway = costs > 0 ? collected / costs : 0
    const feePerMonth = fee / 4
    const costPerLearner = learners > 0 ? costs / learners : 0
    const margin = feePerMonth - costPerLearner
    const teachers = Math.max(3, Math.ceil(learners / 30))
    return {
      learners, fee, unpaid, invoiced, collected, outstanding, families, unpaidFamilies,
      costs, defaultCosts, runway, feePerMonth, costPerLearner, margin, teachers,
      periodsWeek: teachers * 26, marksDay: learners * 6, marksTerm: learners * 6 * 65, subjects: 9,
    }
  }, [learnersIn, feeIn, unpaidIn, costsIn])

  const name = school.trim() || "your school"
  const NAME = (school.trim() || "YOUR SCHOOL").toUpperCase()

  // What the teacher writes, period by period. Line 0 is the heading; each
  // later line arrives with the matching card. Statements, not sums: the
  // visitor's numbers make the picture theirs, they do not show working.
  const S = school.trim() || "Your school"
  const lines = (id: string): ReactNode[] => {
    switch (id) {
      case "period-1":
        return [
          "Period 1 · The record",
          <>{S}. <em>{num(m.learners)}</em> learners. About <em>{num(m.teachers)}</em> teachers. One record.</>,
          <>Every learner knows her class, her teacher, her invoice, her bus.</>,
          <>Nothing is copied. Nothing disagrees.</>,
        ]
      case "period-2":
        return [
          "Period 2 · The learner",
          <>Every learner, known completely.</>,
          <>From the first enquiry to the last report card.</>,
          <><em>{num(m.families)}</em> families, reached on the WhatsApp they already use.</>,
        ]
      case "period-3":
        return [
          "Period 3 · The lesson",
          <>What is taught becomes what is known.</>,
          <>Scheme of work → lesson → mark → report card. Entered once.</>,
          <><em>{num(m.learners)}</em> report cards, true the moment the last mark is in.</>,
        ]
      case "period-4":
        return [
          "Period 4 · The teacher",
          <>The people who make the school.</>,
          <>Who teaches what, and the weight they carry.</>,
          <>Strain seen before it is felt.</>,
        ]
      case "period-5":
        return [
          "Period 5 · The school",
          <>The school, thinking about itself.</>,
          <>Runway. Margin by grade. Risk. Drift.</>,
          <>At today&rsquo;s collection rate, <em>{m.runway.toFixed(1)}</em> months of costs are covered. Known in week two, not at year end.</>,
        ]
      case "period-6":
        return [
          "Period 6 · Tomorrow",
          <>A school that knows itself.</>,
          <>Every decision, made on the record.</>,
          <>The head teacher, no longer the integration layer.</>,
        ]
      case "homework":
        return [
          "Homework",
          <>Bring {S} into one record.</>,
          <>Set-up takes an afternoon.</>,
        ]
      default:
        return [
          "Before the bell",
          <>Welcome to class{school.trim() ? `, ${school.trim()}` : ""}.</>,
          <>This lesson is about your school.</>,
        ]
    }
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const lessonRef = useRef<HTMLDivElement>(null)

  // A card takes the board when its slot crosses the middle of the screen.
  useEffect(() => {
    const root = rootRef.current
    if (!root || !("IntersectionObserver" in window)) return
    const slots = Array.from(root.querySelectorAll<HTMLElement>("[data-period]"))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          setAt({ period: el.dataset.period || "door", step: Number(el.dataset.step ?? 9) })
        }
      },
      { rootMargin: "-48% 0px -51% 0px", threshold: 0 }
    )
    slots.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [])

  // The thin bar under the timetable fills as the lesson scrolls by.
  useEffect(() => {
    const el = lessonRef.current
    if (!el) return
    const onScroll = () => {
      const r = el.getBoundingClientRect()
      const total = r.height - window.innerHeight
      const done = Math.min(1, Math.max(0, -r.top / Math.max(1, total)))
      setProgress(done)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  return (
    <div className="class" ref={rootRef}>
      <header className="nav wrap static">
        <Link href="/" className="brand" aria-label="Tutagora home">
          <Mark size={30} title="" reverse />
          <span className="wordmark">Tutagora</span>
        </Link>
        <nav aria-label="Primary">
          <ul>
            <li>
              <Link className="quiet" href="/">
                Front page
              </Link>
            </li>
            <li>
              <Link className="quiet" href="/login">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <div className="timetable" aria-label="Timetable">
        <ol className="wrap">
          {PERIODS.map((p) => (
            <li key={p.id} className={at.period === p.id ? "on" : ""}>
              <a href={`#${p.id}`}>
                <span className="num t">{p.time}</span>
                <span className="pn">{p.n ? `Period ${p.n}` : "After"}</span>
                <span className="nm">{p.name}</span>
              </a>
            </li>
          ))}
        </ol>
        <div className="progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      </div>

      <main>
        {/* ---------- the door ---------- */}
        <section className="door wrap" data-period="door" data-step="9" id="door">
          <div className="label">Before the bell</div>
          <h1>Welcome to class{school.trim() ? `, ${school.trim()}` : ""}.</h1>
          <p className="lede">
            Six periods on the system that runs a school as one record. Tell us about yours,
            and the lesson will be about it.
          </p>
          <form className="door-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              <span className="label">School</span>
              <input id="school" type="text" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="St Mary's Academy" autoComplete="organization" />
            </label>
            <label>
              <span className="label">Learners</span>
              <input id="learners" type="text" inputMode="numeric" value={learnersIn} onChange={(e) => setLearnersIn(e.target.value)} />
            </label>
            <label>
              <span className="label">Fee per learner, per term (KES)</span>
              <input id="fee" type="text" inputMode="numeric" value={feeIn} onChange={(e) => setFeeIn(e.target.value)} />
            </label>
            <label>
              <span className="label">Still unpaid at week six (%)</span>
              <input id="unpaid" type="text" inputMode="numeric" value={unpaidIn} onChange={(e) => setUnpaidIn(e.target.value)} />
            </label>
            <label>
              <span className="label">Monthly costs (KES), if you know them</span>
              <input id="costs" type="text" inputMode="numeric" value={costsIn} onChange={(e) => setCostsIn(e.target.value)} placeholder={num(m.defaultCosts)} />
            </label>
          </form>
          <a className="arrow" href="#period-1">
            Take your seat <Arrow />
          </a>
        </section>

        {/* ---------- the lesson: one board, cards over it ---------- */}
        <div className="lesson" ref={lessonRef}>
          <div className="lesson-board">
            <Chalkboard at={at} lines={lines} />
          </div>

          <div className="lesson-steps">
            {/* Period 1 · The record */}
            <Slot period="period-1" step={1} id="period-1">
              <div className="label num">8:00 · Period 1 · The record</div>
              <h2>A school is made of records.</h2>
              <p>
                A learner. A class. A teacher. An invoice. A mark. A bus route. Today they live
                in registers, receipt books, spreadsheets and memory, and they never quite agree.
                Tutagora holds them as one record, in which each knows the others.
              </p>
            </Slot>
            <Slot period="period-1" step={2}>
              <h3>Why one record</h3>
              <p>
                The questions that run a school cross every line. Which grade pays for itself.
                Which teacher is quietly overloaded. Which family has not paid and still has a
                child on the bus. No single ledger can answer them. One record can.
              </p>
              <ul className="index">
                <li>Learners, staff, learning, money and time in one model</li>
                <li>More than a hundred related tables per school</li>
                <li>Every row locked to its school</li>
                <li>One truth, read by every system</li>
              </ul>
            </Slot>
            <Slot period="period-1" step={3}>
              <h3>One learner, in the record</h3>
              <div className="staff" aria-label="One learner's record, example">
                <div className="hd"><span className="label">Amani Wanjiru</span><span className="label num">Grade 6 East · STU-0416</span></div>
                <dl>
                  <div><dt>Belongs to</dt><dd>Grade 6 East</dd></div>
                  <div><dt>Taught by</dt><dd>Ms Adhiambo</dd></div>
                  <div><dt>Invoiced</dt><dd>Term 2, KES 42,500</dd></div>
                  <div><dt>Settled by</dt><dd>M-Pesa, 14 Sep</dd></div>
                  <div><dt>Rides</dt><dd>Route 3, stop 7</dd></div>
                  <div><dt>Seen by</dt><dd>Mama Amani, on WhatsApp</dd></div>
                </dl>
              </div>
            </Slot>

            {/* Period 2 · The learner */}
            <Slot period="period-2" step={1} id="period-2">
              <div className="label num">8:40 · Period 2 · The learner · Tutagora SMIS</div>
              <h2>Every learner, known completely.</h2>
              <p>
                An enquiry becomes an application, an application a learner, a learner an
                alumnus. Along the way: fees, transport, the clinic, the library, discipline,
                achievement. All of it on one record, so nothing is asked twice and nothing is
                lost.
              </p>
            </Slot>
            <Slot period="period-2" step={2}>
              <h3>Fees, settled where the money already is</h3>
              <p>
                Invoices go out once per term. Each parent receives an M-Pesa prompt for the
                exact amount, and the payment is matched to its invoice as it lands. The bursar
                opens a ledger that is already balanced and sees exactly who remains.
              </p>
              <ul className="index">
                <li>Fee structures per grade, term and optional item</li>
                <li>Invoices for a class or the whole school in one action</li>
                <li>M-Pesa STK push, Paystack for cards</li>
                <li>Every payment matched to its invoice</li>
                <li>Receipts, statements, credit notes, bursaries</li>
                <li>Attendance by period, transport, clinic, library, discipline</li>
              </ul>
            </Slot>
            <Slot period="period-2" step={3}>
              <h3>Parents, reached without an app</h3>
              <p>
                A link in WhatsApp, theirs alone, that expires on its own. Fees, attendance and
                results for each child. No password to reset. No app to abandon.
              </p>
              <div className="phone" aria-label="M-Pesa payment prompt with your fee">
                <div className="screen">
                  <div className="status num"><span>07:42</span><span>Safaricom</span></div>
                  <div className="stk-bg">
                    <div className="stk">
                      <div className="t">M-PESA</div>
                      <div className="num">
                        Pay Ksh{Math.round(m.fee).toLocaleString("en-KE")}.00 to TUTAGORA*{NAME} for account STU-0416?
                      </div>
                      <div className="pin" aria-label="PIN entry">••••</div>
                      <div className="btns"><span className="quiet">Cancel</span><span>Send</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </Slot>

            {/* Period 3 · The lesson */}
            <Slot period="period-3" step={1} id="period-3">
              <div className="label num">9:20 · Period 3 · The lesson · Tutagora Learning</div>
              <h2>What is taught becomes what is known.</h2>
              <p>
                The term begins with a scheme of work, approved by the head of department.
                Lessons hang off it. Homework, quizzes and exams are set against it and come back
                marked. From the plan to the report card, one unbroken line.
              </p>
            </Slot>
            <Slot period="period-3" step={2}>
              <h3>Entered once</h3>
              <p>
                A mark goes into the gradebook once. The report card, the class ranking and the
                progress view are already true. Attendance, taken by phone period by period,
                lands on the same card without anyone adding it up.
              </p>
              <ul className="index">
                <li>Schemes of work, week by week, with approval</li>
                <li>Lesson plans and study materials</li>
                <li>Homework, assignments, quizzes with automatic marking</li>
                <li>Exam sessions and grade scales</li>
                <li>Report cards printed in bulk or sent to a phone</li>
                <li>Progress per learner, per class, per subject</li>
              </ul>
            </Slot>
            <Slot period="period-3" step={3}>
              <h3>The gradebook</h3>
              <div className="register" aria-label="Gradebook, example">
                <div className="hd">
                  <span className="label">Grade 6 East · Term 2</span>
                  <span className="label num">9 subjects</span>
                </div>
                <table>
                  <thead>
                    <tr><th>Learner</th><th className="r">Mat</th><th className="r">Eng</th><th className="r">Kis</th><th className="r">Sci</th><th className="r">Mean</th></tr>
                  </thead>
                  <tbody className="num">
                    {[
                      ["Amani Wanjiru", [84, 77, 81, 69]],
                      ["Brian Otieno", [62, 70, 74, 58]],
                      ["Faith Chebet", [91, 85, 79, 88]],
                      ["Kevin Mwangi", [48, 55, 61, 44]],
                    ].map(([n, marks]) => {
                      const ms = marks as number[]
                      const mean = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)
                      return (
                        <tr key={String(n)}>
                          <td>{String(n)}</td>
                          {ms.map((x, i) => (<td key={i} className="r">{x}</td>))}
                          <td className="r"><strong>{mean}</strong></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Slot>

            {/* Period 4 · The teacher */}
            <Slot period="period-4" step={1} id="period-4">
              <div className="label num">10:00 · Period 4 · The teacher · Tutagora HR</div>
              <h2>The people who make the school.</h2>
              <p>
                A school is only as good as the people standing in front of the class. Tutagora
                knows who teaches what, how many periods that is, whether the scheme is in and
                approved, and when marks were last entered.
              </p>
            </Slot>
            <Slot period="period-4" step={2}>
              <h3>Strain, seen before it is felt</h3>
              <p>
                Marks entered later each week. Leave requests creeping up. Logins falling away.
                A burnout risk score per teacher, so the head teacher has the conversation
                before the resignation letter.
              </p>
              <ul className="index">
                <li>Staff records, roles and permissions</li>
                <li>Class and subject assignments, load from the timetable</li>
                <li>Scheme of work approvals per department</li>
                <li>Marks-entry timeliness per teacher</li>
                <li>Performance by class results, against the same exams</li>
                <li>Burnout risk score</li>
                <li>Branches, with staff across them</li>
              </ul>
            </Slot>
            <Slot period="period-4" step={3}>
              <h3>One teacher&rsquo;s week</h3>
              <div className="staff" aria-label="A teacher's record, example">
                <div className="hd"><span className="label">Ms Adhiambo · English</span><span className="label num">Grade 6 East · 26 periods</span></div>
                <dl>
                  <div><dt>Schemes of work</dt><dd>3 of 3 approved</dd></div>
                  <div><dt>Marks last entered</dt><dd>2 days ago</dd></div>
                  <div><dt>Class mean, Term 2</dt><dd>74 · 2nd of 6 streams</dd></div>
                  <div><dt>Leave this term</dt><dd>1 day</dd></div>
                  <div><dt>Burnout risk</dt><dd>Low · 18 / 100</dd></div>
                </dl>
              </div>
            </Slot>

            {/* Period 5 · The school */}
            <Slot period="period-5" step={1} id="period-5">
              <div className="label num">10:40 · Period 5 · The school · Tutagora Advisor</div>
              <h2>The school, thinking about itself.</h2>
              <p>
                Because every record knows every other, the Advisor answers what a dashboard
                cannot. How many months of cash the school has. Which grade pays for itself.
                Which teacher is at risk. What does not add up.
              </p>
            </Slot>
            <Slot period="period-5" step={2}>
              <h3>Proper books, then read</h3>
              <p>
                A general ledger with a chart of accounts, budgets, expenses with approvals,
                suppliers and bank reconciliation. From those: runway from real collections,
                profitability by grade, and an auditor that never sleeps.
              </p>
              <ul className="index">
                <li>General ledger, journals, budgets, other income</li>
                <li>Expenses with approvals, suppliers, accounts payable</li>
                <li>Bank accounts and reconciliation</li>
                <li>Cash runway and profitability per grade</li>
                <li>Anomalies flagged: fuel, stock, attendance against the fee roll</li>
                <li>Questions answered in plain language, on WhatsApp</li>
              </ul>
            </Slot>
            <Slot period="period-5" step={3}>
              <h3>Monday, 07:00</h3>
              <p>The week&rsquo;s numbers, before the first bell. Written from the record.</p>
              <div className="phone" aria-label="WhatsApp briefing with your numbers">
                <div className="screen">
                  <div className="status num"><span>07:00</span><span>Monday</span></div>
                  <div className="wa">
                    <div className="hdr"><span className="av">T</span><span>Tutagora</span></div>
                    <div className="bubble">
                      <p>Good morning. {S} this week.</p>
                      <p className="num">Fees: {Math.round(100 - m.unpaid)}% of the term collected. {kes(m.outstanding)} outstanding across about {num(m.unpaidFamilies)} families.</p>
                      <p className="num">Runway at this rate: {m.runway.toFixed(1)} months. Grade 7 below cost for a second term.</p>
                      <p className="num">Attendance 94%. 3 applications waiting more than 48 hours. 1 teacher at rising risk.</p>
                      <time dateTime="07:00">07:00</time>
                    </div>
                  </div>
                </div>
              </div>
            </Slot>

            {/* Period 6 · Tomorrow */}
            <Slot period="period-6" step={1} id="period-6">
              <div className="label num">11:20 · Period 6 · Tomorrow</div>
              <h2>A school that knows itself.</h2>
              <p>
                Every decision made on the record. The head teacher no longer the integration
                layer between a fees system, a gradebook and a messaging app. Parents who trust
                the number on their phone. Teachers whose work is seen.
              </p>
            </Slot>
            <Slot period="period-6" step={3}>
              <h3>Where this goes</h3>
              <p>
                It begins in the classroom, where the main event happens: a teacher and a
                learner. The record exists to serve them. What comes next is a learning guide
                that knows what each child has mastered and what they have not, so no one is
                left behind and no one is held back.
              </p>
            </Slot>

            {/* Homework */}
            <Slot period="homework" step={2} id="homework">
              <div className="label num">12:00 · After class</div>
              <h2>Homework: bring {S === "Your school" ? "your school" : S} into one record.</h2>
              <p>
                Set-up takes an afternoon: classes, the fee structure, and a bulk import of
                learners from the spreadsheet you already have. From then on, the record does
                the work.
              </p>
              <div className="actions">
                <Link href="/signup" className="arrow">
                  Begin <Arrow />
                </Link>
                <Link className="quiet" href="/">Back to the front page</Link>
              </div>
            </Slot>
          </div>
        </div>
      </main>

      <footer>
        <div className="wrap">
          <span className="brand">
            <Mark size={26} title="" reverse />
            <span className="wordmark">Tutagora</span>
          </span>
          <ul>
            <li><Link className="quiet" href="/">Front page</Link></li>
            <li><Link className="quiet" href="/login">Sign in</Link></li>
          </ul>
          <span className="num">© 2026 Tutagora · Kenya</span>
        </div>
      </footer>
    </div>
  )
}
