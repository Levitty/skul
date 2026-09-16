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
  { id: "period-1", time: "8:00", n: 1, name: "One record" },
  { id: "period-2", time: "8:40", n: 2, name: "The learner" },
  { id: "period-3", time: "9:20", n: 3, name: "The academic line" },
  { id: "period-4", time: "10:00", n: 4, name: "The staff" },
  { id: "period-5", time: "10:40", n: 5, name: "Management" },
  { id: "period-6", time: "11:20", n: 6, name: "2027" },
  { id: "homework", time: "12:00", n: 0, name: "Homework" },
]

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
  const [at, setAt] = useState<Step>({ period: "door", step: 9 })
  const [progress, setProgress] = useState(0)

  // Only what is on the gate: the school's name and its size. Everything on
  // the board follows from those two. No fees, no arrears, no costs.
  const m = useMemo(() => {
    const learners = parse(learnersIn, 420)
    return {
      learners,
      families: Math.round(learners * 0.72),
      teachers: Math.max(3, Math.ceil(learners / 30)),
    }
  }, [learnersIn])

  const S = school.trim() || "Your school"
  const NAME = (school.trim() || "YOUR SCHOOL").toUpperCase()

  // What the teacher writes, period by period. Line 0 is the heading; each
  // later line arrives with the matching card. Plain promises with a noun in
  // them, for a director deciding whether to buy.
  const lines = (id: string): ReactNode[] => {
    switch (id) {
      case "period-1":
        return [
          "Period 1 · One record",
          <>{S}, <em>{num(m.learners)}</em> learners, as one record.</>,
          <>Learners, staff, fees, lessons and marks, connected.</>,
          <>Ask any question of the school and get one answer.</>,
        ]
      case "period-2":
        return [
          "Period 2 · The learner",
          <>One file per learner, from enquiry to alumnus.</>,
          <>Fees invoiced once a term. Paid by M-Pesa. Matched automatically.</>,
          <>About <em>{num(m.families)}</em> families kept informed on WhatsApp, without an app.</>,
        ]
      case "period-3":
        return [
          "Period 3 · The academic line",
          <>Schemes of work, lessons, exams and report cards, in one line.</>,
          <>Marks entered once. Report cards ready the same day.</>,
          <>Progress per learner, per subject, per term.</>,
        ]
      case "period-4":
        return [
          "Period 4 · The staff",
          <>Every teacher&rsquo;s load, schemes and marking, on one screen.</>,
          <>Performance measured against the same exams.</>,
          <>Overload flagged early, before a good teacher is lost.</>,
        ]
      case "period-5":
        return [
          "Period 5 · Management",
          <>Cash runway, margin by grade, anomalies. Computed, not estimated.</>,
          <>A briefing every Monday at 07:00, on your phone.</>,
          <>Ask it a question in plain language. It answers from the record.</>,
        ]
      case "period-6":
        return [
          "Period 6 · The school in 2027",
          <>{S}, run on one record, not on memory.</>,
          <>Decisions made in week two, not at year end.</>,
          <>A complete view for management. Work that is seen. Numbers parents trust.</>,
        ]
      case "homework":
        return [
          "Homework",
          <>Bring {S} onto one record.</>,
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
            Six periods on how Tutagora runs a school as one record. Two things so the lesson
            is about your school, nothing that belongs in your accounts.
          </p>
          <form className="door-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              <span className="label">School</span>
              <input id="school" type="text" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="St Mary's Academy" autoComplete="organization" />
            </label>
            <label>
              <span className="label">Learners, roughly</span>
              <input id="learners" type="text" inputMode="numeric" value={learnersIn} onChange={(e) => setLearnersIn(e.target.value)} />
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
            {/* Period 1 · One record */}
            <Slot period="period-1" step={1} id="period-1">
              <div className="label num">8:00 · Period 1 · One record</div>
              <h2>A school is made of records.</h2>
              <p>
                Learners, classes, teachers, invoices, marks, bus routes. Today they sit in
                registers, receipt books, spreadsheets and people&rsquo;s heads, and they never
                quite agree. Tutagora keeps them as one record, so every part of the school knows
                the rest.
              </p>
            </Slot>
            <Slot period="period-1" step={2}>
              <h3>Why that matters to a director</h3>
              <p>
                The questions that decide a school cross departments. Which grade covers its
                costs. Which teacher is overloaded. Which family is in arrears and still has a
                child on the bus. Separate systems cannot answer them. One record can, in one
                place.
              </p>
              <ul className="index">
                <li>Learners, staff, academics, finance and operations in one model</li>
                <li>Over a hundred related tables per school</li>
                <li>Every row locked to its school</li>
                <li>One source of truth for every report</li>
              </ul>
            </Slot>
            <Slot period="period-1" step={3}>
              <h3>One learner, as the record holds her</h3>
              <div className="staff" aria-label="One learner's record, example">
                <div className="hd"><span className="label">Amani Wanjiru</span><span className="label num">Grade 6 East · STU-0416</span></div>
                <dl>
                  <div><dt>Class</dt><dd>Grade 6 East</dd></div>
                  <div><dt>Class teacher</dt><dd>Ms Adhiambo</dd></div>
                  <div><dt>Term 2 invoice</dt><dd>KES 42,500 · settled</dd></div>
                  <div><dt>Payment</dt><dd>M-Pesa, 14 Sep</dd></div>
                  <div><dt>Transport</dt><dd>Route 3, stop 7</dd></div>
                  <div><dt>Guardian</dt><dd>Mama Amani, on WhatsApp</dd></div>
                </dl>
              </div>
            </Slot>

            {/* Period 2 · The learner */}
            <Slot period="period-2" step={1} id="period-2">
              <div className="label num">8:40 · Period 2 · The learner · Tutagora SMIS</div>
              <h2>One file per learner, from enquiry to alumnus.</h2>
              <p>
                Admissions, enrolment, attendance, transport, the clinic, the library, discipline
                and achievement, kept on a single file for each learner. Nothing is asked twice.
                Nothing is lost between departments.
              </p>
            </Slot>
            <Slot period="period-2" step={2}>
              <h3>Fees collected, not chased</h3>
              <p>
                The fee structure is set once per grade and term. Invoices go to every learner in
                one action. Each parent receives an M-Pesa prompt for the exact amount, and the
                payment is matched to its invoice as it lands. The bursar opens a balanced ledger
                and a short list of who remains.
              </p>
              <ul className="index">
                <li>Fee structures per grade, term and optional item</li>
                <li>Bulk invoicing for a class or the whole school</li>
                <li>M-Pesa STK push, Paystack for cards</li>
                <li>Automatic matching of every payment</li>
                <li>Receipts, statements, credit notes, bursaries</li>
                <li>Arrears list with one-tap reminders</li>
              </ul>
            </Slot>
            <Slot period="period-2" step={3}>
              <h3>Parents informed without an app</h3>
              <p>
                A private link on WhatsApp shows each parent their child&rsquo;s fees, attendance
                and results. No password to reset, nothing to install, nothing to abandon.
              </p>
              <div className="phone" aria-label="M-Pesa payment prompt, example">
                <div className="screen">
                  <div className="status num"><span>07:42</span><span>Safaricom</span></div>
                  <div className="stk-bg">
                    <div className="stk">
                      <div className="t">M-PESA</div>
                      <div className="num">Pay Ksh42,500.00 to TUTAGORA*{NAME} for account STU-0416?</div>
                      <div className="pin" aria-label="PIN entry">••••</div>
                      <div className="btns"><span className="quiet">Cancel</span><span>Send</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </Slot>

            {/* Period 3 · The academic line */}
            <Slot period="period-3" step={1} id="period-3">
              <div className="label num">9:20 · Period 3 · The academic line · Tutagora Learning</div>
              <h2>From the scheme of work to the report card, in one system.</h2>
              <p>
                Schemes of work are written week by week and approved by the head of department.
                Lesson plans, homework, quizzes and exams are built on them. Marks are entered once
                and flow to report cards, rankings and progress views without being retyped.
              </p>
            </Slot>
            <Slot period="period-3" step={2}>
              <h3>What changes for the school</h3>
              <p>
                Report cards are ready the day the last mark is entered, printed in bulk or sent to
                a parent&rsquo;s phone. Attendance, taken by phone each period, appears on the same
                card. A learner who misses a week can find what was taught.
              </p>
              <ul className="index">
                <li>Schemes of work with departmental approval</li>
                <li>Lesson plans and study materials</li>
                <li>Homework, assignments, quizzes with automatic marking</li>
                <li>Exam sessions, grade scales, results</li>
                <li>Report cards in bulk or to a phone</li>
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

            {/* Period 4 · The staff */}
            <Slot period="period-4" step={1} id="period-4">
              <div className="label num">10:00 · Period 4 · The staff · Tutagora HR</div>
              <h2>Every teacher&rsquo;s load and output, on one screen.</h2>
              <p>
                Who teaches which class and subject. How many periods that is, from the timetable.
                Whether the scheme of work is in and approved. When marks were last entered. Seen
                together, per teacher and per department.
              </p>
            </Slot>
            <Slot period="period-4" step={2}>
              <h3>Performance and retention</h3>
              <p>
                Teachers are measured by their classes&rsquo; results against the same exams, so the
                comparison is fair. The early signs of overload are watched too: marks entered
                later each week, leave requests rising, logins falling. The head teacher hears
                about it before the resignation letter.
              </p>
              <ul className="index">
                <li>Staff records, roles and permissions</li>
                <li>Class and subject assignments, load from the timetable</li>
                <li>Scheme of work approvals per department</li>
                <li>Marks-entry timeliness per teacher</li>
                <li>Performance by class results</li>
                <li>Burnout risk score</li>
                <li>Multiple branches, staff across them</li>
              </ul>
            </Slot>
            <Slot period="period-4" step={3}>
              <h3>One teacher, this week</h3>
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

            {/* Period 5 · Management */}
            <Slot period="period-5" step={1} id="period-5">
              <div className="label num">10:40 · Period 5 · Management · Tutagora Advisor</div>
              <h2>Insight a director can act on, not a dashboard to read.</h2>
              <p>
                Because every record is connected, the Advisor computes what separate systems
                cannot: months of cash at the current collection rate, profitability by grade,
                teachers at risk, and transactions that do not add up.
              </p>
            </Slot>
            <Slot period="period-5" step={2}>
              <h3>Proper books underneath</h3>
              <p>
                A general ledger with a chart of accounts, budgets, expenses with approvals,
                suppliers and bank reconciliation. The Advisor reads them daily. Fuel logged
                against a bus that did not run, stock issued without a requisition and a register
                fuller than the fee roll are flagged, not discovered at audit.
              </p>
              <ul className="index">
                <li>General ledger, journals, budgets, other income</li>
                <li>Expenses with approvals, suppliers, accounts payable</li>
                <li>Bank accounts and reconciliation</li>
                <li>Cash runway and profitability per grade</li>
                <li>Anomaly detection across fuel, stock and attendance</li>
                <li>Questions answered in plain language, on WhatsApp</li>
              </ul>
            </Slot>
            <Slot period="period-5" step={3}>
              <h3>Monday, 07:00</h3>
              <p>The week&rsquo;s position, on the director&rsquo;s phone before the first bell.</p>
              <div className="phone" aria-label="WhatsApp briefing, example">
                <div className="screen">
                  <div className="status num"><span>07:00</span><span>Monday</span></div>
                  <div className="wa">
                    <div className="hdr"><span className="av">T</span><span>Tutagora</span></div>
                    <div className="bubble">
                      <p>Good morning. {S} this week.</p>
                      <p className="num">Fees: 71% of Term 2 collected. Outstanding across 38 families, 9 with no payment yet.</p>
                      <p className="num">Runway at this rate: 4.7 months. Grade 7 below cost for a second term.</p>
                      <p className="num">Attendance 94%. 3 applications waiting over 48 hours. 1 teacher at rising risk.</p>
                      <time dateTime="07:00">07:00</time>
                    </div>
                  </div>
                </div>
              </div>
            </Slot>

            {/* Period 6 · The school in 2027 */}
            <Slot period="period-6" step={1} id="period-6">
              <div className="label num">11:20 · Period 6 · The school in 2027</div>
              <h2>A school run on one record, not on memory.</h2>
              <p>
                Decisions made in week two, on figures that agree, instead of at year end on
                figures that do not. Management with a complete view of the school. Teachers whose
                work is seen. Parents who trust the number on their phone.
              </p>
            </Slot>
            <Slot period="period-6" step={3}>
              <h3>And after that</h3>
              <p>
                The record exists to serve the classroom. The next step is a learning guide built
                on it, one that knows what each learner has mastered and what they have not, so
                teaching can meet each child where they are.
              </p>
            </Slot>

            {/* Homework */}
            <Slot period="homework" step={2} id="homework">
              <div className="label num">12:00 · After class</div>
              <h2>Homework: bring {S === "Your school" ? "your school" : S} onto one record.</h2>
              <p>
                Set-up takes an afternoon: classes, the fee structure, and a bulk import of
                learners from the spreadsheet you already have. From then on the record does the
                work.
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
