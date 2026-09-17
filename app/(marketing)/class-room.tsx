"use client"

// Welcome to class. The chalkboard fills the screen and stays put for the
// whole lesson. Short cards scroll over it on the left, each in a slot taller
// than the screen. When a card reaches the middle of the screen the board
// takes a step: a new period is rubbed out and rewritten, a new card within
// the same period adds a line or a layer of the drawing. Steps run on a timer
// and reverse when you scroll back. Ordinary scrolling throughout.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { Board } from "./board"
import { Mark } from "./logo"
import { SketchOnto } from "./sketches"
import { Phone, In, Out, Replies } from "./phone"
import { CONTACT, waLink, mailLink } from "./contact"

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const PERIODS = [
  { id: "period-1", time: "8:00", n: 1, name: "One record" },
  { id: "period-2", time: "8:40", n: 2, name: "The people" },
  { id: "period-3", time: "9:20", n: 3, name: "The learner" },
  { id: "period-4", time: "10:00", n: 4, name: "The school" },
  { id: "period-5", time: "10:40", n: 5, name: "Fees" },
  { id: "period-6", time: "11:20", n: 6, name: "Parents" },
  { id: "period-7", time: "12:00", n: 7, name: "The fence" },
  { id: "period-8", time: "12:40", n: 8, name: "The staff" },
  { id: "period-9", time: "13:20", n: 9, name: "Management" },
  { id: "homework", time: "14:00", n: 0, name: "Homework" },
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

// The ontology, drawn on the board in six layers. Layers 1 to 3 are the
// learner's own ring (Period 3); 4 to 6 are the school around her (Period 4).
// Layers up to `seen` were drawn in an earlier period and are shown at once.
// With `auto`, the layers draw themselves when they scroll into view (the
// phone layout, where each period has its own board in the page).
function OntologyFigure({ upto, seen = 0, auto = false }: { upto: number; seen?: number; auto?: boolean }) {
  return (
    <div className="chalk-figure" aria-label="The school's records, drawn around one learner">
      {[1, 2, 3, 4, 5, 6].map((n) =>
        auto && n > upto ? null : (
          <div className="chalk-layer" key={n}>
            {auto ? (
              <SketchOnto layer={n} play={n <= seen ? true : undefined} instant={n <= seen} />
            ) : (
              <SketchOnto layer={n} play={upto >= n} instant={n <= seen} />
            )}
          </div>
        )
      )}
    </div>
  )
}

// ---------- the board ----------

function Chalkboard({
  at,
  lines,
  figure,
}: {
  at: Step
  lines: (period: string) => ReactNode[]
  figure: (period: string, step: number) => ReactNode
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
        {figure(shown, shown === at.period ? at.step : 9)}
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

  // Only what is on the gate: the school's name and its size.
  const m = useMemo(() => {
    const learners = parse(learnersIn, 420)
    return {
      learners,
      families: Math.round(learners * 0.72),
      teachers: Math.max(3, Math.ceil(learners / 30)),
    }
  }, [learnersIn])

  const S = school.trim() || "Your school"

  // What the teacher writes, period by period. Line 0 is the heading; each
  // later line arrives with the matching card.
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
          "Period 2 · The people",
          <>The director asks: what came in this week, and what is it costing us?</>,
          <>The bursar asks who still owes. The teacher asks who is absent, and who is falling behind.</>,
          <>The parent asks what they owe, and how she did. One record answers all four.</>,
        ]
      case "period-3":
        return ["Period 3 · The learner", <>Everything in the school hangs off her.</>, <></>, <></>]
      case "period-4":
        return ["Period 4 · The school around her", <>Six systems. One graph. Every part knows the rest.</>, <></>, <></>]
      case "period-5":
        return [
          "Period 5 · Fees",
          <>Fees decide what a school can become.</>,
          <>Collection seen daily, by grade and by family, not at the end of term.</>,
          <>The evidence for next term&rsquo;s operating budget and the next building.</>,
        ]
      case "period-6":
        return [
          "Period 6 · Parents",
          <>No parent wants another login.</>,
          <>The school answers on WhatsApp: the balance, a Pay button, the statement.</>,
          <>About <em>{num(m.families)}</em> families, reached on the app they already open.</>,
        ]
      case "period-7":
        return [
          "Period 7 · The fence",
          <>The bursar sees money. The teacher sees learning.</>,
          <>The head sees both as totals. A named child only through one logged door.</>,
          <>The AI drafts. People decide.</>,
        ]
      case "period-8":
        return [
          "Period 8 · The staff",
          <>Every person on the payroll has a record, not a line in a notebook.</>,
          <>Hired, contracted, paid and grown on the term clock.</>,
          <>Load seen as lessons and cover, never as a score.</>,
        ]
      case "period-9":
        return [
          "Period 9 · Management",
          <>Cash runway, margin by grade, anomalies. Computed, not estimated.</>,
          <>A briefing every Monday at 07:00. A question answered in plain language.</>,
          <>{S}, run on one record, not on memory.</>,
        ]
      case "homework":
        return ["Homework", <>Bring {school.trim() || "your school"} onto one record.</>, <>Set-up takes an afternoon.</>]
      default:
        return [
          "Before the bell",
          <>Welcome to class{school.trim() ? `, ${school.trim()}` : ""}.</>,
          <>This lesson is about your school.</>,
        ]
    }
  }

  // The drawing on the board: the ontology grows through periods 3 and 4.
  const figure = (id: string, step: number): ReactNode => {
    if (id === "period-3") return <OntologyFigure upto={Math.min(3, step)} />
    if (id === "period-4") return <OntologyFigure upto={3 + Math.min(3, step)} seen={3} />
    return null
  }

  // On a phone the pinned board is hidden and each period gets its own board
  // in the page, fully written, with its drawing. Hidden on wide screens.
  const mboard = (id: string) => (
    <div className="chalkboard on mboard" aria-hidden="true">
      <Board />
      <div className="chalk">
        {lines(id).map((l, i) => (
          <p key={i} className={`${i === 0 ? "chalk-h" : ""} in`}>
            {l}
          </p>
        ))}
        {id === "period-3" && <OntologyFigure upto={3} auto />}
        {id === "period-4" && <OntologyFigure upto={6} seen={3} auto />}
      </div>
    </div>
  )

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
      setProgress(Math.min(1, Math.max(0, -r.top / Math.max(1, total))))
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
            <li><Link className="quiet" href="/">Front page</Link></li>
            <li><Link className="quiet" href="/login">Sign in</Link></li>
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
            Nine periods on how Tutagora runs a school as one record. Two things so the lesson
            is about your school, nothing that belongs in your accounts.
          </p>
          <form className="door-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              <span className="label">School</span>
              <input id="school" type="text" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Riverside Academy" autoComplete="organization" />
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
            <Chalkboard at={at} lines={lines} figure={figure} />
          </div>

          <div className="lesson-steps">
            {/* Period 1 · One record */}
            {mboard("period-1")}
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
              <h3>Why one record</h3>
              <p>
                The questions that decide a school cross departments. Which grade covers its
                costs. Which teacher is overloaded. Which family is in arrears and still has a
                child on the bus. Separate systems cannot answer them. One record can.
              </p>
            </Slot>
            <Slot period="period-1" step={3}>
              <h3>What that means in practice</h3>
              <ul className="index">
                <li>Learners, staff, academics, finance and operations in one model</li>
                <li>Over a hundred related tables per school</li>
                <li>Every row locked to its school</li>
                <li>One source of truth for every report and every message</li>
              </ul>
            </Slot>

            {/* Period 2 · The people */}
            {mboard("period-2")}
            <Slot period="period-2" step={1} id="period-2">
              <div className="label num">8:40 · Period 2 · The people</div>
              <h2>Different people. Different questions.</h2>
              <p>
                A director wants to know what came in this week and what the school is costing.
                A bursar wants to know who still owes. A class teacher wants to know who is absent
                and who is slipping. A parent wants the balance and the result.
              </p>
            </Slot>
            <Slot period="period-2" step={2}>
              <h3>Today, four different books</h3>
              <p>
                The director&rsquo;s answer comes from a spreadsheet built for the meeting. The
                bursar&rsquo;s from the receipt book. The teacher&rsquo;s from the register. The
                parent&rsquo;s from a phone call to the office. Four answers, and they rarely
                agree.
              </p>
            </Slot>
            <Slot period="period-2" step={3}>
              <h3>With Tutagora, one record answers everyone</h3>
              <p>
                The same fact serves all four. A payment received at 07:42 is on the
                bursar&rsquo;s ledger, in the director&rsquo;s weekly figure, on the class
                teacher&rsquo;s arrears view and in the parent&rsquo;s WhatsApp by 07:43.
              </p>
              <ul className="index">
                <li>Director: cash, collection, cost, by branch and by grade</li>
                <li>Bursar: invoices, receipts, arrears, the books</li>
                <li>Head and deputy: schemes, lessons, timetable, discipline</li>
                <li>Teachers: register, marks, homework, their own classes</li>
                <li>Parents: balance, attendance, results, on WhatsApp</li>
              </ul>
            </Slot>

            {/* Period 3 · The learner */}
            {mboard("period-3")}
            <Slot period="period-3" step={1} id="period-3">
              <div className="label num">9:20 · Period 3 · The learner</div>
              <h2>The learner is the centre of the school.</h2>
              <p>
                Every record in Tutagora is reached from the learner. Her guardian, who sees her
                on WhatsApp. Her class, and the teacher who takes it. Watch the board.
              </p>
            </Slot>
            <Slot period="period-3" step={2}>
              <h3>The money she generates</h3>
              <p>
                Each term she is billed. Each payment settles that invoice and no other, matched
                by the M-Pesa reference, so her file and the school&rsquo;s books agree by
                construction.
              </p>
            </Slot>
            <Slot period="period-3" step={3}>
              <h3>What she learns, and how she gets there</h3>
              <p>
                Her marks, attendance and remarks make her report card. Her bus route, stop and
                fare sit on the same file. Nothing about her is held in two places.
              </p>
            </Slot>

            {/* Period 4 · The school around her */}
            {mboard("period-4")}
            <Slot period="period-4" step={1} id="period-4">
              <div className="label num">10:00 · Period 4 · The school around her</div>
              <h2>The academic spine.</h2>
              <p>
                Her class belongs to a timetable, the timetable to subjects, the subjects to
                schemes of work and exams. What is taught in Grade 6 East on Tuesday is a record,
                and her mark on Friday is linked to it.
              </p>
            </Slot>
            <Slot period="period-4" step={2}>
              <h3>The books</h3>
              <p>
                Every payment posts itself to the ledger. Budgets, expenses, suppliers and bank
                reconciliation sit in the same books, so the director&rsquo;s cash position and
                the bursar&rsquo;s receipts are the same number.
              </p>
            </Slot>
            <Slot period="period-4" step={3}>
              <h3>Operations</h3>
              <p>
                An enquiry becomes an application becomes a learner, without re-typing. The
                clinic, the library and discipline write to her file too. Six systems, one graph,
                and each part of the school knows the rest.
              </p>
            </Slot>

            {/* Period 5 · Fees */}
            {mboard("period-5")}
            <Slot period="period-5" step={1} id="period-5">
              <div className="label num">10:40 · Period 5 · Fees</div>
              <h2>Fees decide what a school can become.</h2>
              <p>
                Collection is the lifeblood of the institution: it pays the teachers, keeps the
                buses on the road and decides whether next year brings a new classroom block.
                It is the number a director watches most closely, and usually sees last.
              </p>
            </Slot>
            <Slot period="period-5" step={2}>
              <h3>Collection, seen daily</h3>
              <p>
                Invoices go out once a term. Every M-Pesa payment matches its invoice on arrival.
                The director sees collection by grade, by branch and by family on any day of the
                term, not in a spreadsheet at the end of it.
              </p>
              <ul className="index">
                <li>Fee structures per grade, term and optional item</li>
                <li>Bulk invoicing, discounts and bursaries</li>
                <li>M-Pesa STK push, Paystack for cards, automatic matching</li>
                <li>Arrears by family with one-tap reminders</li>
                <li>Receipts, statements and credit notes</li>
              </ul>
            </Slot>
            <Slot period="period-5" step={3}>
              <h3>Evidence for planning</h3>
              <p>
                Collection patterns across terms show when families pay, which grades lag and
                how cash moves through the year. That is the basis for next term&rsquo;s operating
                budget and for the capital decisions that shape a school: the next classroom
                block, the next bus, the next branch.
              </p>
              <Phone time="16:22" day="Tuesday" name="Tutagora" sub="business account" label="The director asks how the branches compare, on WhatsApp. Example.">
                <Out at="16:22">
                  <p>how do the branches compare</p>
                </Out>
                <In at="16:22">
                  <p className="num">Main: 422 learners, 79% of the term collected, KES 1.70m in the last 7 days.</p>
                  <p className="num">Junior: 79 learners, 64% collected, KES 966k outstanding.</p>
                  <p className="num">Hill Road: billing looks incomplete. Worth checking before Friday.</p>
                </In>
              </Phone>
            </Slot>

            {/* Period 6 · Parents */}
            {mboard("period-6")}
            <Slot period="period-6" step={1} id="period-6">
              <div className="label num">11:20 · Period 6 · Parents</div>
              <h2>We bring the school to the parent, on WhatsApp.</h2>
              <p>
                No parent wants another login. They already have WhatsApp, and so does the
                school. Instead of a portal to remember, the school&rsquo;s number answers: the
                balance, a Pay button, the statement, the results when they are out.
              </p>
            </Slot>
            <Slot period="period-6" step={2}>
              <h3>What a parent sees</h3>
              <Phone time="19:51" day="Tuesday" name={S} sub="business account" label="A parent's exchange with the school on WhatsApp. Example.">
                <Out at="19:51">
                  <p>Hi</p>
                </Out>
                <In at="19:51">
                  <p>Good evening. This number is for <strong>Amani W.</strong>, Grade 6.</p>
                  <p className="num">Fee balance: <strong>KES 10,200</strong></p>
                  <p>You can pay by M-Pesa right here.</p>
                </In>
                <Replies items={["Pay the full balance", "Pay an amount", "Send my statement"]} />
              </Phone>
            </Slot>
            <Slot period="period-6" step={3}>
              <h3>The school&rsquo;s voice, the other way</h3>
              <p>
                Fee reminders with each family&rsquo;s own balance, sent in one action. A notice
                that the bus is late, sent only to the parents on that route. Report cards to the
                guardian&rsquo;s number on file. Enquiries from new families answered from the
                same place.
              </p>
              <ul className="index">
                <li>Private link per parent, no password</li>
                <li>Balance, Pay button, statement, results</li>
                <li>Reminders and notices to exactly the families affected</li>
                <li>Enquiries and admissions through the same number</li>
              </ul>
            </Slot>

            {/* Period 7 · The fence */}
            {mboard("period-7")}
            <Slot period="period-7" step={1} id="period-7">
              <div className="label num">12:00 · Period 7 · The fence</div>
              <h2>Who sees what is decided by the record.</h2>
              <p>
                Money and learning describe the same children, and in Tutagora they are never
                joined casually. The bursar sees invoices and receipts. The class teacher sees
                marks and attendance. The head sees both as totals for a grade, and a named
                child&rsquo;s case only through one door: a safeguarding role, time-limited, and
                logged.
              </p>
            </Slot>
            <Slot period="period-7" step={2}>
              <h3>Every change is an action</h3>
              <p>
                Nothing in the record changes except through a named action: a payment recorded,
                a discount approved, a report card issued. Each one checks who is asking, checks
                its own rule, and writes a line to a log that cannot be edited. If something goes
                wrong, the investigation starts from records, not recollection.
              </p>
              <ul className="index">
                <li>Every record locked to its school</li>
                <li>Roles decide the screens, down to the column</li>
                <li>Every action logged: what, to which record, by whom</li>
                <li>The same log is the audit trail and the Monday briefing</li>
              </ul>
            </Slot>
            <Slot period="period-7" step={3}>
              <h3>The AI drafts. People decide.</h3>
              <p>The Advisor reads the record and proposes. It sends nothing and pays nothing. The bursar decides, and every proposal is logged with what it read.</p>
              <Phone time="08:10" day="Friday" name="Tutagora" sub="business account" label="The Advisor proposes fee reminders and the bursar decides, on WhatsApp. Example.">
                <In at="08:10">
                  <p className="num">Term 2, week 6. 41 invoices are past due across 33 families. I have drafted each family a reminder with its own balance.</p>
                </In>
                <Replies items={["Review the 33", "Send all", "Not now"]} />
                <Out at="08:14">
                  <p>Review the 33</p>
                </Out>
                <In at="08:14">
                  <p className="num">Two families are on payment plans, so I left them out. 31 ready when you are.</p>
                </In>
              </Phone>
            </Slot>

            {/* Period 8 · The staff */}
            {mboard("period-8")}
            <Slot period="period-8" step={1} id="period-8">
              <div className="label num">12:40 · Period 8 · The staff</div>
              <h2>Every person who works here, first-class.</h2>
              <p>
                Teachers, the bursar, the drivers, the cooks, the matron. Payroll is the largest
                cost in a school, and most of it lives in a notebook. Tutagora HR gives every
                employee one record: contract, documents, leave, attendance, pay, training. Across
                every branch.
              </p>
            </Slot>
            <Slot period="period-8" step={2}>
              <h3>The lifecycle, on rails</h3>
              <p>
                From the open role to the certificate of service, each stage produces its own
                paperwork from the record, instead of a Word template on someone&rsquo;s laptop.
              </p>
              <ul className="index">
                <li>Recruitment: open roles, and every candidate seen for each</li>
                <li>Offer letters, contracts and warnings, each acknowledged on receipt</li>
                <li>Probation reviews and contracts ending, surfaced before they lapse</li>
                <li>Leave: the head recommends, HR decides</li>
                <li>Daily check-in, payroll and the statutory calendar</li>
                <li>Training, goals and performance</li>
                <li>Assets issued and returned</li>
                <li>Clearance, final dues and a handover pack when someone leaves</li>
              </ul>
            </Slot>
            <Slot period="period-8" step={3}>
              <h3>One teacher, this week</h3>
              <div className="staff" aria-label="A teacher's record, example">
                <div className="hd"><span className="label">Ms Adhiambo · English</span><span className="label num">Grade 6 East · Main</span></div>
                <dl>
                  <div><dt>Teaching load</dt><dd>26 lessons · dept. 24</dd></div>
                  <div><dt>Cover taken this term</dt><dd>2 lessons</dd></div>
                  <div><dt>Schemes of work</dt><dd>3 of 3 approved</dd></div>
                  <div><dt>Marks last entered</dt><dd>2 days ago</dd></div>
                  <div><dt>Leave balance</dt><dd>14 days</dd></div>
                  <div><dt>Contract</dt><dd>To December · renewal due</dd></div>
                  <div><dt>Probation</dt><dd>Confirmed</dd></div>
                </dl>
              </div>
            </Slot>

            {/* Period 9 · Management */}
            {mboard("period-9")}
            <Slot period="period-9" step={1} id="period-9">
              <div className="label num">13:20 · Period 9 · Management</div>
              <h2>Insight a director can act on.</h2>
              <p>
                Because every record is connected, the Advisor computes what separate systems
                cannot: months of cash at the current collection rate, profitability by grade,
                teaching load out of balance, and transactions that do not add up. It works on
                the school&rsquo;s own clock, the term, not the calendar month. Read daily.
                Flagged, not discovered at audit.
              </p>
            </Slot>
            <Slot period="period-9" step={2}>
              <h3>Monday, 07:00</h3>
              <p>The week&rsquo;s position on the director&rsquo;s phone before the first bell, and any question answered in plain language after it.</p>
              <Phone time="07:00" day="Monday" name="Tutagora" sub="business account" label="The Monday briefing on WhatsApp. Example.">
                <In at="07:00">
                  <p>Good morning. {S} this week.</p>
                  <p className="num">Fees: 71% of Term 2 collected. Outstanding across 38 families, 9 with no payment yet.</p>
                  <p className="num">Runway at this rate: 4.7 months. Grade 7 below cost for a second term.</p>
                  <p className="num">Attendance 94%. 3 applications waiting over 48 hours. Two teachers above load in Languages.</p>
                </In>
              </Phone>
            </Slot>
            <Slot period="period-9" step={3}>
              <h3>{S === "Your school" ? "A school" : S}, in 2027</h3>
              <p>
                Run on one record, not on memory. Decisions made in week two on figures that
                agree, instead of at year end on figures that do not. A complete view for
                management. Work that is seen. Numbers parents trust.
              </p>
            </Slot>

            {/* Homework */}
            {mboard("homework")}
            <Slot period="homework" step={2} id="homework">
              <div className="label num">14:00 · After class</div>
              <h2>Homework: bring {S === "Your school" ? "your school" : S} onto one record.</h2>
              <p>
                Set-up takes an afternoon: classes, the fee structure, and a bulk import of
                learners from the spreadsheet you already have. From then on the record does the
                work. Send one message and we will come and show you.
              </p>
              <div className="actions">
                <a
                  href={waLink(
                    school.trim()
                      ? `Hello Tutagora. I am from ${school.trim()}, about ${num(m.learners)} learners. I would like to talk about using Tutagora.`
                      : "Hello Tutagora. I have taken the class and would like to talk about using Tutagora at my school."
                  )}
                  className="arrow"
                  target="_blank"
                  rel="noopener"
                >
                  Talk to us on WhatsApp <Arrow />
                </a>
                <a className="quiet" href={mailLink(`Enquiry from ${school.trim() || "a school"}`)}>
                  Email {CONTACT.email}
                </a>
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
