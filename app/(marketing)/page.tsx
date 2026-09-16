import Link from "next/link"
import { Board } from "./board"
import { SketchSmis, SketchHr, SketchLearning } from "./sketches"
import { Mark, BRAND } from "./logo"

// The hero headline. Swap in the official Tutagora slogan here; nothing else
// on the page needs to change. Words are split so they can enter one by one.
const SLOGAN = "Most systems show you numbers. Tutagora acts on them."

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)


// The school thinking: runway, rising.
const ArtAdvisor = () => (
  <svg viewBox="0 0 480 150" preserveAspectRatio="xMidYMid meet">
    <line x1="16" y1="134" x2="464" y2="134" stroke="rgba(242,242,240,0.18)" />
    <polyline
      fill="none"
      stroke="#f2f2f0"
      strokeWidth="1.75"
      strokeLinejoin="round"
      points="16,118 60,112 104,98 148,96 192,74 236,70 280,62 324,48 368,44 412,30 464,18"
    />
    <circle cx="464" cy="18" r="4" fill={BRAND.orange} />
  </svg>
)

// The three systems, and what each one actually holds. Every item here is a
// record the product keeps today; nothing is aspirational.
const SYSTEMS = [
  {
    id: "smis",
    art: <SketchSmis />,
    name: "Tutagora SMIS",
    tagline: "Every learner, known completely.",
    blurb: "The memory of the school. From first enquiry to final report, one truth about every child.",
    title: "One child. One record. The whole story.",
    lede:
      "A learner arrives as an enquiry and leaves as an alumnus. In between are fees, buses, clinic visits, library books, absences and achievements. Tutagora SMIS holds all of it on a single record, so nothing is asked twice and nothing is lost.",
    holds: [
      "Enquiries and applications",
      "Admission rules",
      "Learner records and documents",
      "Guardians and emergency contacts",
      "Enrolment, promotion, transfer",
      "Attendance by period",
      "Fee structures and invoices",
      "M-Pesa and card payments",
      "Statements and receipts",
      "Transport routes and buses",
      "Clinic visits and health profiles",
      "Library loans",
      "Discipline and merit",
      "Leaves and suspensions",
      "Uniform and store sales",
      "WhatsApp to parents",
    ],
  },
  {
    id: "hr",
    art: <SketchHr />,
    name: "Tutagora HR",
    tagline: "The people who make the school.",
    blurb: "Who teaches, what they carry, and who needs help, seen before it is felt.",
    title: "Every teacher, and the weight they carry.",
    lede:
      "A school is only ever as good as the people standing in front of the class. Tutagora HR knows who teaches what, how many periods, whether the schemes are in and the marks are entered, and it notices who is quietly running on empty before they hand in a letter.",
    holds: [
      "Staff records",
      "Roles and permissions",
      "Class and subject assignments",
      "Teaching load from the timetable",
      "Scheme of work approvals",
      "Marks-entry timeliness",
      "Teacher performance by class results",
      "Burnout risk score",
      "Branches and multi-school access",
    ],
  },
  {
    id: "learning",
    art: <SketchLearning />,
    name: "Tutagora Learning",
    tagline: "What is taught becomes what is known.",
    blurb: "From the term's plan to a single mark, in one unbroken line.",
    title: "From the scheme of work to the report card, unbroken.",
    lede:
      "The plan for the term, the lesson on Tuesday, the homework that came back, the quiz, the exam, the mark, the report card in a parent's hand. Tutagora Learning keeps that line whole, so a mark is entered once and every document downstream is already true.",
    holds: [
      "Schemes of work, week by week",
      "Lesson plans",
      "Study materials",
      "Homework and submissions",
      "Assignments",
      "Quizzes with auto-marking",
      "Exam sessions and results",
      "Grade scales",
      "Gradebook",
      "Report cards, printed or sent",
      "Student progress by class",
    ],
  },
]

const ONTOLOGY = [
  { group: "Learners", items: ["Learner", "Guardian", "Application", "Enrolment", "Attendance", "Leave", "Transfer", "Health profile", "Library loan", "Incident"] },
  { group: "Staff", items: ["Employee", "Role", "Permission", "Class assignment", "Scheme approval", "Staff metrics"] },
  { group: "Learning", items: ["Subject", "Scheme of work", "Lesson plan", "Assignment", "Quiz", "Exam", "Result", "Grade scale", "Report card"] },
  { group: "Money", items: ["Fee structure", "Invoice", "Payment", "Receipt", "Credit note", "Expense", "Supplier", "Budget", "Bank account", "Journal entry", "General ledger"] },
  { group: "School", items: ["School", "Branch", "Academic year", "Term", "Class", "Section", "Period", "Timetable", "Route", "Vehicle", "Event", "Announcement"] },
]

export default function HomePage() {
  return (
    <>
      <main>
        <section className="hero wrap">
          <Board />
          <header className="nav wrap">
            <Link href="/" className="brand" aria-label="Tutagora home">
              <Mark size={30} title="" reverse />
              <span className="wordmark">Tutagora</span>
            </Link>
            <nav aria-label="Primary">
              <ul>
                <li>
                  <a className="quiet" href="#systems">
                    Systems
                  </a>
                </li>
                <li>
                  <a className="quiet" href="#vision">
                    Vision
                  </a>
                </li>
                <li>
                  <Link className="quiet" href="/login">
                    Sign in
                  </Link>
                </li>
              </ul>
            </nav>
          </header>

          <h1>
            {SLOGAN.split(" ").map((word, i) => (
              <span key={i}>
                <span className="w">{word}</span>{" "}
              </span>
            ))}
          </h1>
          <div className="foot">
            <p className="sub">
              School management for school leaders in Kenya. One record for the whole
              school: fees on M-Pesa, parents on WhatsApp, and a truth that adds up.
            </p>
            <Link href="/signup" className="arrow">
              Start with your school <Arrow />
            </Link>
          </div>
        </section>

        <section className="thesis wrap" id="systems">
          <div className="label">Not a dashboard</div>
          <h2>A school is one living thing. We built the software to match.</h2>
          <p>
            Learners, teachers, lessons and money are not four products. They are one body, and
            every part of it should know the rest. Three systems share a single record of the
            school. A fourth reads that record and thinks.
          </p>

          <div className="cards">
            {SYSTEMS.map((c) => (
              <a className="card" href={`#${c.id}`} key={c.id}>
                <div className="card-art" aria-hidden="true">
                  {c.art}
                </div>
                <div className="card-body">
                  <div className="label">{c.name}</div>
                  <h3>{c.tagline}</h3>
                  <p>{c.blurb}</p>
                  <span className="arrow">
                    Explore <Arrow />
                  </span>
                </div>
              </a>
            ))}
            <a className="card card-wide" href="#advisor">
              <div className="card-art" aria-hidden="true">
                <ArtAdvisor />
              </div>
              <div className="card-body">
                <div className="label">Tutagora Advisor</div>
                <h3>The school, thinking about itself.</h3>
                <p>
                  Runway, margin, risk and drift, computed from the record and delivered to your
                  phone before the first bell.
                </p>
                <span className="arrow">
                  Explore <Arrow />
                </span>
              </div>
            </a>
          </div>
        </section>

        {SYSTEMS.map((s, i) => (
          <section className="panel sys" id={s.id} key={s.id}>
            <div className="wrap">
              <div className="text">
                <div className="label num">
                  {String(i + 1).padStart(2, "0")} &nbsp;·&nbsp; {s.name}
                </div>
                <h2>{s.title}</h2>
                <p>{s.lede}</p>
              </div>
              <div className="art">
                <ul className="index" aria-label={`What ${s.name} holds`}>
                  {s.holds.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}

        <section className="panel advisor" id="advisor">
          <div className="wrap">
            <div className="text">
              <div className="label">04 &nbsp;·&nbsp; Tutagora Advisor</div>
              <h2>It does not show you the school. It tells you.</h2>
              <p>
                A dashboard waits to be read. The Advisor reads the record itself, on a schedule,
                and says what it found in plain language on WhatsApp. It makes the invisible
                visible, then it acts: a briefing sent, an alert raised, a question answered from
                the same single truth.
              </p>
            </div>
            <div className="art wide">
              <ul className="insights">
                <li>
                  <span className="k num">4.7</span>
                  <span>
                    <strong>Cash runway, in months.</strong> Income actually collected against
                    expenses actually paid, projected forward.
                  </span>
                </li>
                <li>
                  <span className="k num">−12%</span>
                  <span>
                    <strong>Grade 7 does not pay for itself.</strong> Fee income per class
                    against the direct cost of teaching it. In most schools today, nobody knows.
                  </span>
                </li>
                <li>
                  <span className="k num">2</span>
                  <span>
                    <strong>Teachers at burnout risk.</strong> Late marks, rising leave,
                    falling logins, scored before anyone resigns.
                  </span>
                </li>
                <li>
                  <span className="k num">3</span>
                  <span>
                    <strong>Things that do not add up.</strong> Fuel logged against a bus that
                    did not run. Stock out without a requisition. A register fuller than the fee
                    roll.
                  </span>
                </li>
                <li>
                  <span className="k num">07:00</span>
                  <span>
                    <strong>Monday briefing on WhatsApp.</strong> Fees, attendance, stuck
                    applications and pending decisions, before the first bell.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="onto wrap" id="ontology">
          <div className="label">One ontology</div>
          <h2>One model of the whole school. Every record knows every other.</h2>
          <p>
            A learner belongs to a class, which has a teacher, who teaches a subject, which is
            examined in a term, which is invoiced, which is paid on a phone. More than a hundred
            related tables in one schema, every row locked to its school. Nothing is copied.
            Nothing disagrees.
          </p>
          <div className="onto-grid">
            {ONTOLOGY.map((g) => (
              <div key={g.group}>
                <h3 className="label">{g.group}</h3>
                <ul>
                  {g.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="vision wrap" id="vision">
          <div className="label">Vision</div>
          <p>
            Every school has a second body: the record. The register, the ledger, the receipt
            book, the marks. Today it is scattered across paper and memory, and it never quite
            agrees with itself. The head teacher carries the difference.
          </p>
          <p>
            We are building that second body to be worthy of the first. One model of the whole
            school, complete and current, so the software can do what a great head teacher does:
            hold the entire school in mind at once, and know what to do next.
          </p>
          <p>
            It begins in the classroom, where the main event happens: a teacher and a learner.
            The record exists to serve them. What comes next is a learning guide that knows what
            each child has mastered and what they have not, so no one is left behind and no one
            is held back.
          </p>
          <p>Not a dashboard to admire. A school that knows itself.</p>
        </section>

        <section className="close">
          <div className="wrap">
            <div className="label">Now taking set-ups for 2027</div>
            <h2>Bring your school into one record.</h2>
            <div className="actions">
              <Link href="/signup" className="arrow">
                Begin with your school <Arrow />
              </Link>
              <Link className="quiet" href="/login">
                Sign in
              </Link>
            </div>
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
              <a className="quiet" href="#smis">
                SMIS
              </a>
            </li>
            <li>
              <a className="quiet" href="#hr">
                HR
              </a>
            </li>
            <li>
              <a className="quiet" href="#learning">
                Learning
              </a>
            </li>
            <li>
              <a className="quiet" href="#advisor">
                Advisor
              </a>
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
    </>
  )
}
