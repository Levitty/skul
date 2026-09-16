"use client"

// Welcome to class. One chalkboard stays on the left for the whole lesson.
// As each period scrolls into view on the right, the board is rubbed out and
// rewritten with that period's working, in the visitor's own numbers.
// Ordinary scrolling throughout; nothing is hijacked.

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

// ---------- the board ----------

function Chalkboard({ id, lines }: { id: string; lines: (id: string) => ReactNode[] }) {
  const [shown, setShown] = useState(id)
  const [phase, setPhase] = useState<"on" | "wipe">("on")
  useEffect(() => {
    if (id === shown) return
    setPhase("wipe")
    const t = window.setTimeout(() => {
      setShown(id)
      setPhase("on")
    }, 620)
    return () => window.clearTimeout(t)
  }, [id, shown])
  return (
    <div className={`chalkboard ${phase}`} aria-live="polite">
      <Board />
      <div className="duster" aria-hidden="true" />
      <div className="chalk" key={shown}>
        {lines(shown).map((l, i) => (
          <p key={i} className={i === 0 ? "chalk-h" : undefined}>
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
  const [active, setActive] = useState("door")

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
      learners,
      fee,
      unpaid,
      invoiced,
      collected,
      outstanding,
      families,
      unpaidFamilies,
      costs,
      defaultCosts,
      runway,
      feePerMonth,
      costPerLearner,
      margin,
      teachers,
      periodsWeek: teachers * 26,
      marksDay: learners * 6,
      marksTerm: learners * 6 * 65,
      subjects: 9,
    }
  }, [learnersIn, feeIn, unpaidIn, costsIn])

  const name = school.trim() || "your school"
  const NAME = (school.trim() || "YOUR SCHOOL").toUpperCase()

  // What the teacher writes for each period.
  const lines = (id: string): ReactNode[] => {
    switch (id) {
      case "period-1":
        return [
          "Period 1 · Fees",
          <>
            <em>{num(m.learners)}</em> learners × <em>{kes(m.fee)}</em> = <em>{kes(m.invoiced)}</em>{" "}
            invoiced this term
          </>,
          <>
            By week six: <em>{kes(m.collected)}</em> in, <em>{kes(m.outstanding)}</em> still out
          </>,
          <>
            About <em>{num(m.unpaidFamilies)}</em> families to chase. Or none, if the prompt does
            it.
          </>,
        ]
      case "period-2":
        return [
          "Period 2 · The register",
          <>
            <em>{num(m.learners)}</em> learners × 6 periods = <em>{num(m.marksDay)}</em> marks a
            day
          </>,
          <>
            <em>{num(m.marksTerm)}</em> a term. Each one a record, not a tick.
          </>,
          <>Kevin absent all day → his mother knows by 8:15.</>,
        ]
      case "period-3":
        return [
          "Period 3 · The lesson",
          <>
            Scheme of work → lesson plan → homework → quiz → exam → mark → report card
          </>,
          <>
            <em>{num(m.learners * m.subjects)}</em> marks per exam, entered once.
          </>,
          <>
            <em>{num(m.learners)}</em> report cards, printed or sent. No re-typing.
          </>,
        ]
      case "period-4":
        return [
          "Period 4 · Parents",
          <>
            About <em>{num(m.families)}</em> families. All on WhatsApp already.
          </>,
          <>No app. No password. A link that expires.</>,
          <>Monday, 07:00: the head teacher&rsquo;s briefing, before the first bell.</>,
        ]
      case "period-5":
        return [
          "Period 5 · The staffroom",
          <>
            About <em>{num(m.teachers)}</em> teachers, <em>{num(m.periodsWeek)}</em> periods a
            week between them.
          </>,
          <>Who teaches what. Schemes in? Marks entered? One screen.</>,
          <>Burnout risk, scored before the letter is written.</>,
        ]
      case "period-6":
        return [
          "Period 6 · The office",
          <>
            Costs about <em>{kes(m.costs)}</em> a month. Collected so far covers{" "}
            <em>{m.runway.toFixed(1)}</em> months.
          </>,
          <>
            Per learner, per month: <em>{kes(m.feePerMonth)}</em> in, <em>{kes(m.costPerLearner)}</em>{" "}
            out.
          </>,
          m.margin >= 0 ? (
            <>
              Margin <em>{kes(m.margin)}</em> a head. It works.
            </>
          ) : (
            <>
              Margin <em>−{kes(Math.abs(m.margin))}</em> a head. Something has to move.
            </>
          ),
        ]
      default:
        return [
          "Before the bell",
          <>Welcome to class{school.trim() ? `, ${school.trim()}` : ""}.</>,
          <>Fill in the register on the right and take your seat.</>,
        ]
    }
  }

  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root || !("IntersectionObserver" in window)) return
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-period]"))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.period || "door")
        }
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [])

  const boardFor = active === "homework" ? "period-6" : active

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
            <li key={p.id} className={active === p.id ? "on" : ""}>
              <a href={`#${p.id}`}>
                <span className="num t">{p.time}</span>
                <span className="pn">{p.n ? `Period ${p.n}` : "After"}</span>
                <span className="nm">{p.name}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>

      <main>
        <div className="lesson wrap">
          <div className="lesson-board">
            <Chalkboard id={boardFor} lines={lines} />
          </div>

          <div className="lesson-notes">
            {/* ---------- the door ---------- */}
            <section className="door" data-period="door" id="door">
              <div className="label">Before the bell</div>
              <h1>Welcome to class{school.trim() ? `, ${school.trim()}` : ""}.</h1>
              <p className="lede">
                Six periods on how Tutagora runs a school, worked on the board with your numbers,
                not ours. Four things before we begin, and one if you know it.
              </p>
              <form className="door-form" onSubmit={(e) => e.preventDefault()}>
                <label>
                  <span className="label">School</span>
                  <input
                    id="school"
                    type="text"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="St Mary's Academy"
                    autoComplete="organization"
                  />
                </label>
                <label>
                  <span className="label">Learners</span>
                  <input
                    id="learners"
                    type="text"
                    inputMode="numeric"
                    value={learnersIn}
                    onChange={(e) => setLearnersIn(e.target.value)}
                  />
                </label>
                <label>
                  <span className="label">Fee per learner, per term (KES)</span>
                  <input
                    id="fee"
                    type="text"
                    inputMode="numeric"
                    value={feeIn}
                    onChange={(e) => setFeeIn(e.target.value)}
                  />
                </label>
                <label>
                  <span className="label">Still unpaid at week six (%)</span>
                  <input
                    id="unpaid"
                    type="text"
                    inputMode="numeric"
                    value={unpaidIn}
                    onChange={(e) => setUnpaidIn(e.target.value)}
                  />
                </label>
                <label>
                  <span className="label">Monthly costs (KES), if you know them</span>
                  <input
                    id="costs"
                    type="text"
                    inputMode="numeric"
                    value={costsIn}
                    onChange={(e) => setCostsIn(e.target.value)}
                    placeholder={num(m.defaultCosts)}
                  />
                </label>
              </form>
              <a className="arrow" href="#period-1">
                Take your seat <Arrow />
              </a>
            </section>

            {/* ---------- Period 1 · Fees ---------- */}
            <section className="period" data-period="period-1" id="period-1">
              <div className="label num">8:00 · Period 1 · Fees</div>
              <h2>Every shilling, reconciled.</h2>
              <p>
                On paper, {name} chases about {num(m.unpaidFamilies)} families by phone each
                term and hopes the bank statement agrees with the receipt book. In Tutagora the
                fee structure is set once per grade and term, invoices go out to every learner in
                one action, and each parent gets an M-Pesa prompt on their phone for the exact
                amount. The payment is matched to its invoice the moment it lands.
              </p>
              <p>
                The bursar does not reconcile. The bursar opens a ledger that is already
                balanced and sees exactly who is left, and can send those families a reminder
                on WhatsApp from the same screen.
              </p>
              <ul className="index" aria-label="What Fees holds">
                <li>Fee structures per grade, term and optional item</li>
                <li>Invoices generated for a class or the whole school</li>
                <li>M-Pesa STK push, Paystack for cards</li>
                <li>Automatic matching of every payment to its invoice</li>
                <li>Receipts and statements per learner</li>
                <li>Credit notes, discounts and bursaries</li>
                <li>Arrears list with one-tap reminders</li>
                <li>Term transition that carries balances forward</li>
              </ul>
              <div className="phone" aria-label="M-Pesa payment prompt with your fee">
                <div className="screen">
                  <div className="status num">
                    <span>07:42</span>
                    <span>Safaricom</span>
                  </div>
                  <div className="stk-bg">
                    <div className="stk">
                      <div className="t">M-PESA</div>
                      <div className="num">
                        Pay Ksh{Math.round(m.fee).toLocaleString("en-KE")}.00 to TUTAGORA*{NAME}{" "}
                        for account STU-0416?
                      </div>
                      <div className="pin" aria-label="PIN entry">
                        ••••
                      </div>
                      <div className="btns">
                        <span className="quiet">Cancel</span>
                        <span>Send</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ---------- Period 2 · The register ---------- */}
            <section className="period" data-period="period-2" id="period-2">
              <div className="label num">8:40 · Period 2 · The register</div>
              <h2>Attendance from a phone, period by period.</h2>
              <p>
                A teacher takes the register on a phone at the start of each period, in under a
                minute. An absence becomes a record rather than a tick in a book, so it can be
                counted, compared and acted on: a message to the guardian the same morning, a
                pattern flagged by Friday, a term&rsquo;s attendance on the report card without
                anyone adding it up.
              </p>
              <p>
                The same record feeds transport, the clinic and discipline, so a learner who is
                on the bus, in the sick bay or on suspension is never marked absent by mistake.
              </p>
              <ul className="index" aria-label="What the register holds">
                <li>Attendance by period, from any phone</li>
                <li>Absence and late marks with reasons</li>
                <li>Guardian notified on WhatsApp the same day</li>
                <li>Patterns flagged: three absences in a week</li>
                <li>Leaves, suspensions and transfers reflected</li>
                <li>Bus assignments and clinic visits linked</li>
                <li>Term attendance carried onto the report card</li>
              </ul>
              <div className="register" aria-label="Attendance register, example">
                <div className="hd">
                  <span className="label">Grade 6 East · Tuesday</span>
                  <span className="label num">Present 27 of 29</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Learner</th>
                      <th>P1</th>
                      <th>P2</th>
                      <th>P3</th>
                      <th>P4</th>
                      <th>P5</th>
                      <th>P6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Amani Wanjiru", "on on on on on on"],
                      ["Brian Otieno", "late on on on on on"],
                      ["Faith Chebet", "on on on on on on"],
                      ["Kevin Mwangi", "off off off off off off"],
                      ["Mercy Achieng", "on on on on on on"],
                      ["Samuel Kiprop", "on on on off off off"],
                    ].map(([n, marks]) => (
                      <tr key={n}>
                        <td>{n}</td>
                        {marks.split(" ").map((x, i) => (
                          <td key={i}>
                            <span className={`dot ${x === "on" ? "" : x}`} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ---------- Period 3 · The lesson ---------- */}
            <section className="period" data-period="period-3" id="period-3">
              <div className="label num">9:20 · Period 3 · The lesson</div>
              <h2>From the scheme of work to the report card, unbroken.</h2>
              <p>
                The term begins with a scheme of work, written week by week and approved by the
                head of department. Lesson plans hang off it. Homework, assignments and quizzes
                are set against it and come back marked. Exams are scheduled as sessions, marks
                are entered once in the gradebook, and the report card, the class ranking and the
                progress view are already true.
              </p>
              <p>
                Study materials sit alongside, so a learner who missed Tuesday can find what was
                taught. Nothing is typed twice, and nothing waits for the night before
                parents&rsquo; day.
              </p>
              <ul className="index" aria-label="What the lesson holds">
                <li>Schemes of work, week by week, with approval</li>
                <li>Lesson plans linked to the scheme</li>
                <li>Study materials: documents, video, links</li>
                <li>Homework and assignments with submissions</li>
                <li>Quizzes with automatic marking</li>
                <li>Exam sessions, grade scales and results</li>
                <li>Gradebook: enter once, use everywhere</li>
                <li>Report cards printed in bulk or sent to a phone</li>
                <li>Progress per learner, per class, per subject</li>
              </ul>
              <div className="register" aria-label="Gradebook, example">
                <div className="hd">
                  <span className="label">Grade 6 East · Term 2 exam</span>
                  <span className="label num">Entered once · 9 subjects</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Learner</th>
                      <th>Mat</th>
                      <th>Eng</th>
                      <th>Kis</th>
                      <th>Sci</th>
                      <th>SST</th>
                      <th>Mean</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {[
                      ["Amani Wanjiru", [84, 77, 81, 69, 88]],
                      ["Brian Otieno", [62, 70, 74, 58, 66]],
                      ["Faith Chebet", [91, 85, 79, 88, 90]],
                      ["Kevin Mwangi", [48, 55, 61, 44, 52]],
                      ["Mercy Achieng", [73, 80, 77, 71, 75]],
                    ].map(([n, marks]) => {
                      const ms = marks as number[]
                      const mean = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)
                      return (
                        <tr key={String(n)}>
                          <td>{String(n)}</td>
                          {ms.map((x, i) => (
                            <td key={i} className="r">
                              {x}
                            </td>
                          ))}
                          <td className="r">
                            <strong>{mean}</strong>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ---------- Period 4 · Parents ---------- */}
            <section className="period" data-period="period-4" id="period-4">
              <div className="label num">10:00 · Period 4 · Parents</div>
              <h2>Nothing to install. It&rsquo;s on WhatsApp.</h2>
              <p>
                A parent taps a link in WhatsApp and sees fees, attendance and results for each
                of their children. The link is theirs alone and it expires on its own. No one at{" "}
                {name} resets a password, ever, and no parent is asked to download an app they
                will not open.
              </p>
              <p>
                The same channel carries the school&rsquo;s voice the other way: fee reminders,
                notices, event invitations and the Monday briefing to the head teacher, written
                from the record with your numbers in it. Admissions arrive the same way, through a
                public application page for the school.
              </p>
              <ul className="index" aria-label="What Parents holds">
                <li>Parent view of fees, attendance and results per child</li>
                <li>Magic links on WhatsApp, no password</li>
                <li>Fee reminders and receipts to the phone</li>
                <li>Message campaigns and templates</li>
                <li>Noticeboard and events</li>
                <li>Online application page per school</li>
                <li>Admissions watchdog: nothing waits over 48 hours</li>
                <li>Monday briefing to the head teacher, 07:00</li>
              </ul>
              <div className="phone" aria-label="WhatsApp briefing with your numbers">
                <div className="screen">
                  <div className="status num">
                    <span>07:00</span>
                    <span>Monday</span>
                  </div>
                  <div className="wa">
                    <div className="hdr">
                      <span className="av">T</span>
                      <span>Tutagora</span>
                    </div>
                    <div className="bubble">
                      <p>Good morning. {school.trim() || "Your school"} this week.</p>
                      <p className="num">
                        Fees: {Math.round(100 - m.unpaid)}% of the term collected.{" "}
                        {kes(m.outstanding)} outstanding across about {num(m.unpaidFamilies)}{" "}
                        families.
                      </p>
                      <p className="num">
                        Attendance last week 94%. Grade 8 dipped to 88% on Thursday.
                      </p>
                      <p className="num">
                        3 applications waiting more than 48 hours. 2 leave requests need a
                        decision.
                      </p>
                      <time dateTime="07:00">07:00</time>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ---------- Period 5 · The staffroom ---------- */}
            <section className="period" data-period="period-5" id="period-5">
              <div className="label num">10:40 · Period 5 · The staffroom</div>
              <h2>Every teacher, and the weight they carry.</h2>
              <p>
                Roughly {num(m.teachers)} teachers carry {name}. Tutagora knows who teaches which
                class and subject, how many periods that is from the timetable, whether the
                scheme of work is in and approved, and when marks were last entered. It ranks
                teachers by their classes&rsquo; results, fairly, against the same exams.
              </p>
              <p>
                It also watches for the quiet signs: marks entered later each week, leave
                requests creeping up, logins falling away. A burnout risk score per teacher, so
                the head teacher has the conversation before the resignation letter.
              </p>
              <ul className="index" aria-label="What the staffroom holds">
                <li>Staff records and roles</li>
                <li>Permissions per role, custom roles per school</li>
                <li>Class and subject assignments</li>
                <li>Teaching load from the timetable</li>
                <li>Scheme of work approvals, per department</li>
                <li>Marks-entry timeliness per teacher</li>
                <li>Performance by class results</li>
                <li>Burnout risk score</li>
                <li>Branches, with staff who work across them</li>
              </ul>
            </section>

            {/* ---------- Period 6 · The office ---------- */}
            <section className="period" data-period="period-6" id="period-6">
              <div className="label num">11:20 · Period 6 · The office</div>
              <h2>How many months of cash the school has.</h2>
              <p>
                This is the lesson most systems never teach, because it needs every other record
                at once: what was invoiced, what was actually collected, what it costs to run the
                place, and which classes carry the rest. Tutagora keeps proper books, a general
                ledger with a chart of accounts, budgets, expenses with approvals, suppliers and
                bank reconciliation, and then reads them.
              </p>
              <p>
                It computes runway from real collections, profitability by grade, and flags what
                does not add up: fuel logged against a bus that did not run, stock that left the
                store without a requisition, a register fuller than the fee roll. The figures on
                the board are an estimate from your numbers. The real ones come from the record.
              </p>
              <ul className="index" aria-label="What the office holds">
                <li>General ledger and chart of accounts</li>
                <li>Journal entries, budgets, other income</li>
                <li>Expenses with categories and approvals</li>
                <li>Suppliers and accounts payable</li>
                <li>Bank accounts and reconciliation</li>
                <li>Cash runway from real collections</li>
                <li>Profitability per grade and per campus</li>
                <li>Invisible auditor: anomalies flagged</li>
                <li>Uniform store, library, clinic, transport books</li>
                <li>Ask a question in plain language, on WhatsApp</li>
              </ul>
              <div className="runway" aria-label="Runway estimate">
                <div className="big num">
                  {m.runway.toFixed(1)}
                  <small>months of costs covered by this term&rsquo;s collections</small>
                </div>
                <svg viewBox="0 0 400 120" role="img" aria-label="Collections against costs">
                  <line x1="0" y1="119.5" x2="400" y2="119.5" stroke="rgba(242,242,240,0.2)" />
                  <polyline
                    fill="none"
                    stroke="#f2f2f0"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    points="0,110 40,100 80,88 120,84 160,66 200,60 240,52 280,44 320,38 360,30 400,22"
                  />
                  <circle cx="400" cy="22" r="4" fill="#f4a21d" />
                </svg>
                <div className="legend num">
                  <span>Term start</span>
                  <span>Week six</span>
                </div>
              </div>
            </section>

            {/* ---------- Homework ---------- */}
            <section className="homework" data-period="homework" id="homework">
              <div className="label num">12:00 · After class</div>
              <h2>Homework: bring the real numbers.</h2>
              <p>
                Everything on the board was worked from the figures you typed at the door. The
                record does it from every learner, every invoice and every payment, every day.
                Set-up takes an afternoon: classes, the fee structure, and a bulk import of
                learners from the spreadsheet you already have.
              </p>
              <div className="actions">
                <Link href="/signup" className="arrow">
                  Start with {name === "your school" ? "your school" : name} <Arrow />
                </Link>
                <Link className="quiet" href="/">
                  Back to the front page
                </Link>
              </div>
            </section>
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
          <span className="num">© 2026 Tutagora · Kenya</span>
        </div>
      </footer>
    </div>
  )
}
