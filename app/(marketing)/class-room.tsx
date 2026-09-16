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
  { id: "period-1", time: "8:00", n: 1, name: "Fees" },
  { id: "period-2", time: "8:40", n: 2, name: "The register" },
  { id: "period-3", time: "9:20", n: 3, name: "The lesson" },
  { id: "period-4", time: "10:00", n: 4, name: "Parents" },
  { id: "period-5", time: "10:40", n: 5, name: "The staffroom" },
  { id: "period-6", time: "11:20", n: 6, name: "The office" },
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
  // later line arrives with the matching card.
  const lines = (id: string): ReactNode[] => {
    switch (id) {
      case "period-1":
        return [
          "Period 1 · Fees",
          <><em>{num(m.learners)}</em> learners × <em>{kes(m.fee)}</em> = <em>{kes(m.invoiced)}</em> invoiced this term</>,
          <>By week six: <em>{kes(m.collected)}</em> in, <em>{kes(m.outstanding)}</em> still out. About <em>{num(m.unpaidFamilies)}</em> families to chase.</>,
          <>Or none, if the prompt does it. →</>,
        ]
      case "period-2":
        return [
          "Period 2 · The register",
          <><em>{num(m.learners)}</em> learners × 6 periods = <em>{num(m.marksDay)}</em> marks a day</>,
          <><em>{num(m.marksTerm)}</em> a term. Each one a record, not a tick.</>,
          <>Kevin absent all day → his mother knows by 8:15.</>,
        ]
      case "period-3":
        return [
          "Period 3 · The lesson",
          <>Scheme of work → lesson → homework → quiz → exam → mark → report card</>,
          <><em>{num(m.learners * m.subjects)}</em> marks per exam, entered once.</>,
          <><em>{num(m.learners)}</em> report cards, printed or sent. No re-typing.</>,
        ]
      case "period-4":
        return [
          "Period 4 · Parents",
          <>About <em>{num(m.families)}</em> families. All on WhatsApp already.</>,
          <>No app. No password. A link that expires.</>,
          <>Monday, 07:00: the head teacher&rsquo;s briefing, before the first bell.</>,
        ]
      case "period-5":
        return [
          "Period 5 · The staffroom",
          <>About <em>{num(m.teachers)}</em> teachers, <em>{num(m.periodsWeek)}</em> periods a week between them.</>,
          <>Who teaches what. Schemes in? Marks entered? One screen.</>,
          <>Burnout risk, scored before the letter is written.</>,
        ]
      case "period-6":
        return [
          "Period 6 · The office",
          <>Costs about <em>{kes(m.costs)}</em> a month. Collected so far covers <em>{m.runway.toFixed(1)}</em> months.</>,
          <>Per learner, per month: <em>{kes(m.feePerMonth)}</em> in, <em>{kes(m.costPerLearner)}</em> out.</>,
          m.margin >= 0 ? (
            <>Margin <em>{kes(m.margin)}</em> a head. It works.</>
          ) : (
            <>Margin <em>−{kes(Math.abs(m.margin))}</em> a head. Something has to move.</>
          ),
        ]
      case "homework":
        return [
          "Homework",
          <>Bring the real numbers.</>,
          <>Set-up: one afternoon. Classes, fees, and the spreadsheet you already have.</>,
        ]
      default:
        return [
          "Before the bell",
          <>Welcome to class{school.trim() ? `, ${school.trim()}` : ""}.</>,
          <>Fill in the register and take your seat.</>,
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
            Six periods on how Tutagora runs a school, worked on the board with your numbers,
            not ours. Four things before we begin, and one if you know it.
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
            {/* Period 1 · Fees */}
            <Slot period="period-1" step={1} id="period-1">
              <div className="label num">8:00 · Period 1 · Fees</div>
              <h2>Every shilling, reconciled.</h2>
              <p>
                The fee structure is set once per grade and term. Invoices go out to every
                learner in one action, and each parent gets an M-Pesa prompt on their phone for
                the exact amount. The payment is matched to its invoice the moment it lands.
              </p>
            </Slot>
            <Slot period="period-1" step={2}>
              <h3>What the bursar sees</h3>
              <p>
                Not a bank statement to reconcile against a receipt book. A ledger that is
                already balanced, and a list of exactly who is left, with a WhatsApp reminder
                one tap away.
              </p>
              <ul className="index">
                <li>Fee structures per grade, term and optional item</li>
                <li>Invoices for a class or the whole school</li>
                <li>M-Pesa STK push, Paystack for cards</li>
                <li>Automatic matching of payment to invoice</li>
                <li>Receipts, statements, credit notes, bursaries</li>
                <li>Arrears list with one-tap reminders</li>
                <li>Term transition that carries balances forward</li>
              </ul>
            </Slot>
            <Slot period="period-1" step={3}>
              <h3>What the parent sees</h3>
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

            {/* Period 2 · The register */}
            <Slot period="period-2" step={1} id="period-2">
              <div className="label num">8:40 · Period 2 · The register</div>
              <h2>Attendance from a phone, period by period.</h2>
              <p>
                A teacher takes the register on a phone at the start of each period, in under a
                minute. An absence becomes a record rather than a tick in a book, so it can be
                counted, compared and acted on.
              </p>
            </Slot>
            <Slot period="period-2" step={2}>
              <h3>Because it is a record</h3>
              <p>
                It feeds transport, the clinic and discipline, so a learner on the bus, in the
                sick bay or on suspension is never marked absent by mistake. A pattern is
                flagged by Friday. Term attendance lands on the report card without anyone
                adding it up.
              </p>
              <ul className="index">
                <li>Attendance by period, from any phone</li>
                <li>Absence and late marks with reasons</li>
                <li>Patterns flagged: three absences in a week</li>
                <li>Leaves, suspensions and transfers reflected</li>
                <li>Bus assignments and clinic visits linked</li>
              </ul>
            </Slot>
            <Slot period="period-2" step={3}>
              <h3>What the guardian gets</h3>
              <p>A message the same morning. Not a letter at the end of term.</p>
              <div className="register" aria-label="Attendance register, example">
                <div className="hd">
                  <span className="label">Grade 6 East · Tuesday</span>
                  <span className="label num">27 of 29</span>
                </div>
                <table>
                  <thead>
                    <tr><th>Learner</th><th>P1</th><th>P2</th><th>P3</th><th>P4</th><th>P5</th><th>P6</th></tr>
                  </thead>
                  <tbody>
                    {[
                      ["Amani Wanjiru", "on on on on on on"],
                      ["Brian Otieno", "late on on on on on"],
                      ["Kevin Mwangi", "off off off off off off"],
                      ["Samuel Kiprop", "on on on off off off"],
                    ].map(([n, marks]) => (
                      <tr key={n}>
                        <td>{n}</td>
                        {marks.split(" ").map((x, i) => (
                          <td key={i}><span className={`dot ${x === "on" ? "" : x}`} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Slot>

            {/* Period 3 · The lesson */}
            <Slot period="period-3" step={1} id="period-3">
              <div className="label num">9:20 · Period 3 · The lesson</div>
              <h2>From the scheme of work to the report card, unbroken.</h2>
              <p>
                The term begins with a scheme of work, written week by week and approved by the
                head of department. Lesson plans hang off it. Homework, assignments and quizzes
                are set against it and come back marked.
              </p>
            </Slot>
            <Slot period="period-3" step={2}>
              <h3>Entered once</h3>
              <p>
                Exams are scheduled as sessions. Marks go into the gradebook once, and the
                report card, the class ranking and the progress view are already true. Study
                materials sit alongside, so a learner who missed Tuesday can find what was
                taught.
              </p>
              <ul className="index">
                <li>Schemes of work, week by week, with approval</li>
                <li>Lesson plans linked to the scheme</li>
                <li>Study materials: documents, video, links</li>
                <li>Homework and assignments with submissions</li>
                <li>Quizzes with automatic marking</li>
                <li>Exam sessions, grade scales, results</li>
                <li>Progress per learner, class and subject</li>
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

            {/* Period 4 · Parents */}
            <Slot period="period-4" step={1} id="period-4">
              <div className="label num">10:00 · Period 4 · Parents</div>
              <h2>Nothing to install. It&rsquo;s on WhatsApp.</h2>
              <p>
                A parent taps a link in WhatsApp and sees fees, attendance and results for each
                of their children. The link is theirs alone and it expires on its own. No one at{" "}
                {name} resets a password, ever.
              </p>
            </Slot>
            <Slot period="period-4" step={2}>
              <h3>The school&rsquo;s voice, the other way</h3>
              <p>
                Fee reminders, notices, event invitations. Admissions arrive through a public
                application page for the school, and a watchdog makes sure none waits more than
                48 hours.
              </p>
              <ul className="index">
                <li>Parent view of fees, attendance and results per child</li>
                <li>Magic links on WhatsApp, no password</li>
                <li>Fee reminders and receipts to the phone</li>
                <li>Message campaigns and templates</li>
                <li>Noticeboard and events</li>
                <li>Online application page per school</li>
                <li>Admissions watchdog</li>
              </ul>
            </Slot>
            <Slot period="period-4" step={3}>
              <h3>Monday, 07:00</h3>
              <div className="phone" aria-label="WhatsApp briefing with your numbers">
                <div className="screen">
                  <div className="status num"><span>07:00</span><span>Monday</span></div>
                  <div className="wa">
                    <div className="hdr"><span className="av">T</span><span>Tutagora</span></div>
                    <div className="bubble">
                      <p>Good morning. {school.trim() || "Your school"} this week.</p>
                      <p className="num">Fees: {Math.round(100 - m.unpaid)}% of the term collected. {kes(m.outstanding)} outstanding across about {num(m.unpaidFamilies)} families.</p>
                      <p className="num">Attendance last week 94%. Grade 8 dipped to 88% on Thursday.</p>
                      <p className="num">3 applications waiting more than 48 hours. 2 leave requests need a decision.</p>
                      <time dateTime="07:00">07:00</time>
                    </div>
                  </div>
                </div>
              </div>
            </Slot>

            {/* Period 5 · The staffroom */}
            <Slot period="period-5" step={1} id="period-5">
              <div className="label num">10:40 · Period 5 · The staffroom</div>
              <h2>Every teacher, and the weight they carry.</h2>
              <p>
                Tutagora knows who teaches which class and subject, how many periods that is
                from the timetable, whether the scheme of work is in and approved, and when marks
                were last entered.
              </p>
            </Slot>
            <Slot period="period-5" step={2}>
              <h3>Seen before it is felt</h3>
              <p>
                Teachers are ranked by their classes&rsquo; results against the same exams. And
                the quiet signs are watched: marks entered later each week, leave requests
                creeping up, logins falling away. A burnout risk score, so the head teacher has
                the conversation before the resignation letter.
              </p>
              <ul className="index">
                <li>Staff records, roles and permissions</li>
                <li>Class and subject assignments</li>
                <li>Teaching load from the timetable</li>
                <li>Scheme of work approvals per department</li>
                <li>Marks-entry timeliness per teacher</li>
                <li>Performance by class results</li>
                <li>Burnout risk score</li>
                <li>Branches, with staff across them</li>
              </ul>
            </Slot>
            <Slot period="period-5" step={3}>
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

            {/* Period 6 · The office */}
            <Slot period="period-6" step={1} id="period-6">
              <div className="label num">11:20 · Period 6 · The office</div>
              <h2>How many months of cash the school has.</h2>
              <p>
                The lesson most systems never teach, because it needs every other record at
                once: what was invoiced, what was actually collected, what it costs to run the
                place, and which classes carry the rest.
              </p>
            </Slot>
            <Slot period="period-6" step={2}>
              <h3>Proper books, then read</h3>
              <p>
                A general ledger with a chart of accounts, budgets, expenses with approvals,
                suppliers and bank reconciliation. From those, runway, profitability by grade,
                and what does not add up: fuel logged against a bus that did not run, stock that
                left the store without a requisition.
              </p>
              <ul className="index">
                <li>General ledger and chart of accounts</li>
                <li>Journal entries, budgets, other income</li>
                <li>Expenses with categories and approvals</li>
                <li>Suppliers, accounts payable, bank reconciliation</li>
                <li>Cash runway from real collections</li>
                <li>Profitability per grade and per campus</li>
                <li>Invisible auditor: anomalies flagged</li>
                <li>Ask a question in plain language, on WhatsApp</li>
              </ul>
            </Slot>
            <Slot period="period-6" step={3}>
              <h3>Your estimate</h3>
              <p>From the numbers at the door. The real figure comes from the record.</p>
              <div className="runway" aria-label="Runway estimate">
                <div className="big num">
                  {m.runway.toFixed(1)}
                  <small>months of costs covered by this term&rsquo;s collections</small>
                </div>
                <svg viewBox="0 0 400 120" role="img" aria-label="Collections against costs">
                  <line x1="0" y1="119.5" x2="400" y2="119.5" stroke="rgba(242,242,240,0.2)" />
                  <polyline fill="none" stroke="#f2f2f0" strokeWidth="1.5" strokeLinejoin="round" points="0,110 40,100 80,88 120,84 160,66 200,60 240,52 280,44 320,38 360,30 400,22" />
                  <circle cx="400" cy="22" r="4" fill="#f4a21d" />
                </svg>
                <div className="legend num"><span>Term start</span><span>Week six</span></div>
              </div>
            </Slot>

            {/* Homework */}
            <Slot period="homework" step={2} id="homework">
              <div className="label num">12:00 · After class</div>
              <h2>Homework: bring the real numbers.</h2>
              <p>
                Everything on the board was worked from the figures you typed at the door. The
                record does it from every learner, every invoice and every payment, every day.
              </p>
              <div className="actions">
                <Link href="/signup" className="arrow">
                  Start with {name === "your school" ? "your school" : name} <Arrow />
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
