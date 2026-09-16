"use client"

// Welcome to class. A school day in four periods, each one a lesson on what
// Tutagora does, worked with the visitor's own numbers. Nothing here hijacks
// the scroll: the board is sticky, the notes scroll past it.

import { useEffect, useMemo, useRef, useState } from "react"
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
  { id: "period-3", time: "9:20", n: 3, name: "Parents" },
  { id: "period-4", time: "10:00", n: 4, name: "The office" },
  { id: "homework", time: "10:40", n: 0, name: "Homework" },
]

const kes = (n: number) => "KES " + Math.round(n).toLocaleString("en-KE")
const num = (n: number) => Math.round(n).toLocaleString("en-KE")

function parse(v: string, fallback: number) {
  const n = Number(String(v).replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

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
      marksDay: learners * 6,
      marksTerm: learners * 6 * 65,
    }
  }, [learnersIn, feeIn, unpaidIn, costsIn])

  const name = school.trim() || "your school"
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
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
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
        <section className="door wrap" data-period="door" id="door">
          <div className="label">Before the bell</div>
          <h1>
            Welcome to class{school.trim() ? `, ${school.trim()}` : ""}.
          </h1>
          <p className="lede">
            Four periods on how Tutagora runs a school. Not our numbers, yours. Three things
            before we begin, and one if you know it.
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

        {/* ---------- Period 1 ---------- */}
        <section className="period" data-period="period-1" id="period-1">
          <div className="wrap">
            <div className="board-col">
              <div className={`chalkboard ${active === "period-1" ? "on" : ""}`}>
                <Board />
                <div className="chalk">
                  <p className="chalk-h">Period 1 · Fees</p>
                  <p>
                    <em>{num(m.learners)}</em> learners × <em>{kes(m.fee)}</em>
                  </p>
                  <p>
                    = <em>{kes(m.invoiced)}</em> invoiced this term
                  </p>
                  <p>
                    By week six: <em>{kes(m.collected)}</em> in,
                  </p>
                  <p>
                    <em>{kes(m.outstanding)}</em> still out, across about{" "}
                    <em>{num(m.unpaidFamilies)}</em> families.
                  </p>
                </div>
              </div>
            </div>
            <div className="notes">
              <div className="label num">8:00 · Period 1</div>
              <h2>Every shilling, reconciled.</h2>
              <p>
                On paper, {name} chases {num(m.unpaidFamilies)} families by phone and hopes the
                bank statement matches the receipt book. In Tutagora, the invoice goes out once
                per term, the parent gets an M-Pesa prompt for the amount, and the payment is
                matched to the invoice the moment it lands.
              </p>
              <p>
                The bursar does not reconcile. The bursar reads a ledger that is already
                balanced, and sees exactly who is left.
              </p>
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
                        Pay Ksh{Math.round(m.fee).toLocaleString("en-KE")}.00 to TUTAGORA*
                        {(school.trim() || "YOUR SCHOOL").toUpperCase()} for account STU-0416?
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
            </div>
          </div>
        </section>

        {/* ---------- Period 2 ---------- */}
        <section className="period" data-period="period-2" id="period-2">
          <div className="wrap">
            <div className="board-col">
              <div className={`chalkboard ${active === "period-2" ? "on" : ""}`}>
                <Board />
                <div className="chalk">
                  <p className="chalk-h">Period 2 · The register</p>
                  <p>
                    <em>{num(m.learners)}</em> learners × 6 periods
                  </p>
                  <p>
                    = <em>{num(m.marksDay)}</em> marks a day,
                  </p>
                  <p>
                    <em>{num(m.marksTerm)}</em> a term, each one a record.
                  </p>
                  <p>Kevin absent all day → his mother knows by 8:15.</p>
                </div>
              </div>
            </div>
            <div className="notes">
              <div className="label num">8:40 · Period 2</div>
              <h2>Attendance from a phone. Marks entered once.</h2>
              <p>
                A teacher takes the register on a phone at the start of each period. An absence
                is a record, not a tick in a book, so it can be counted, compared and acted on:
                a message to the guardian the same morning, a pattern flagged by Friday.
              </p>
              <p>
                Marks work the same way. Entered once in the gradebook, they flow into the
                report card, the class ranking and the teacher&rsquo;s own performance view. No
                re-typing, no midnight spreadsheet.
              </p>
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
            </div>
          </div>
        </section>

        {/* ---------- Period 3 ---------- */}
        <section className="period" data-period="period-3" id="period-3">
          <div className="wrap">
            <div className="board-col">
              <div className={`chalkboard ${active === "period-3" ? "on" : ""}`}>
                <Board />
                <div className="chalk">
                  <p className="chalk-h">Period 3 · Parents</p>
                  <p>
                    About <em>{num(m.families)}</em> families. All on WhatsApp already.
                  </p>
                  <p>No app. No password. A link that expires.</p>
                  <p>
                    Monday, 07:00: the head teacher&rsquo;s briefing, before the first bell.
                  </p>
                </div>
              </div>
            </div>
            <div className="notes">
              <div className="label num">9:20 · Period 3</div>
              <h2>Nothing to install. It&rsquo;s on WhatsApp.</h2>
              <p>
                A parent taps a link and sees fees, attendance and results for each child. The
                link is theirs alone and it expires on its own. No one at {name} resets a
                password, ever.
              </p>
              <p>
                The same channel carries the Monday briefing to the head teacher, written from
                the record, with your numbers in it.
              </p>
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
            </div>
          </div>
        </section>

        {/* ---------- Period 4 ---------- */}
        <section className="period" data-period="period-4" id="period-4">
          <div className="wrap">
            <div className="board-col">
              <div className={`chalkboard ${active === "period-4" ? "on" : ""}`}>
                <Board />
                <div className="chalk">
                  <p className="chalk-h">Period 4 · The office</p>
                  <p>
                    Costs about <em>{kes(m.costs)}</em> a month.
                  </p>
                  <p>
                    Collected so far covers <em>{m.runway.toFixed(1)}</em> months.
                  </p>
                  <p>
                    Per learner, per month: <em>{kes(m.feePerMonth)}</em> in,{" "}
                    <em>{kes(m.costPerLearner)}</em> out.
                  </p>
                  <p>
                    {m.margin >= 0 ? (
                      <>
                        Margin <em>{kes(m.margin)}</em> a head. It works.
                      </>
                    ) : (
                      <>
                        Margin <em>−{kes(Math.abs(m.margin))}</em> a head. Something has to move.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div className="notes">
              <div className="label num">10:00 · Period 4</div>
              <h2>How many months of cash the school has.</h2>
              <p>
                This is the lesson most systems never teach, because it needs every other record
                at once: what was invoiced, what was actually collected, what it costs to run the
                place, and which classes carry the rest.
              </p>
              <p>
                Tutagora computes runway from real collections, shows profitability by grade, and
                flags what does not add up: fuel logged against a bus that did not run, stock
                that left the store without a requisition. The figures on the board are an
                estimate from your four numbers. The real ones come from the record.
              </p>
              <div className="runway" aria-label="Runway estimate">
                <div className="big num">
                  {m.runway.toFixed(1)}
                  <small>months of costs covered</small>
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
            </div>
          </div>
        </section>

        {/* ---------- Homework ---------- */}
        <section className="homework wrap" data-period="homework" id="homework">
          <div className="label num">10:40 · After class</div>
          <h2>Homework: bring the real numbers.</h2>
          <p>
            Everything on the boards was worked from four figures you typed at the door. The
            record does it from every learner, every invoice and every payment, every day. Set-up
            takes an afternoon: classes, the fee structure, and a bulk import of learners from
            the spreadsheet you already have.
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
