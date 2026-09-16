import Link from "next/link"
import { Board } from "./board"

// The hero headline. Swap in the official Tutagora slogan here; nothing else
// on the page needs to change. Words are split so they can enter one by one.
const SLOGAN = "Manage your school with confidence."

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// The three systems, and what each one actually holds. Every item here is a
// record the product keeps today; nothing is aspirational.
const SYSTEMS = [
  {
    id: "smis",
    name: "Tutagora SMIS",
    title: "Every learner, from application to alumni.",
    lede:
      "The school information system. One record per learner that follows them from the first enquiry to the day they leave, with everything the office needs attached to it.",
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
    name: "Tutagora HR",
    title: "Every teacher, and the load they carry.",
    lede:
      "Staff records, roles and the work itself. Who teaches what, how many periods, whether the schemes are in, when marks were last entered, and who is quietly running on empty.",
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
    name: "Tutagora Learning",
    title: "What is taught, and what was learned.",
    lede:
      "From the term's scheme of work down to a single mark. Lessons, homework, assignments and quizzes on one side; exams, gradebook and report cards on the other. Entered once.",
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
            <Link href="/" className="wordmark" aria-label="Tutagora home">
              Tutagora
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
              School management software for schools in Kenya. Fees on M-Pesa. Parents on
              WhatsApp. One record that adds up.
            </p>
            <Link href="/signup" className="arrow">
              Start with your school <Arrow />
            </Link>
          </div>
        </section>

        <section className="thesis wrap" id="systems">
          <div className="label">Not a dashboard</div>
          <h2>
            A school is learners, teachers, lessons and money, all connected. Tutagora runs the
            whole unit as one record.
          </h2>
          <p>
            Three systems share that record. A fourth layer reads it and tells you what to do.
          </p>
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
              <h2>It doesn&rsquo;t show you the school. It tells you.</h2>
              <p>
                Because every record is related to every other, the Advisor can compute what a
                dashboard cannot. It runs on a schedule, sends the answer to WhatsApp, and answers
                questions in plain language.
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
                    against the direct cost of teaching it.
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
          <h2>Every record knows every other.</h2>
          <p>
            A learner belongs to a class, which has a teacher, who teaches a subject, which is
            examined in a term, which is invoiced, which is paid on a phone. More than a hundred
            related tables in one schema, per school, with every row locked to that school.
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
            Schools have been sold software one piece at a time. A fees system. A gradebook. A
            messaging app. The head teacher is left as the integration layer, carrying the whole
            picture in their head.
          </p>
          <p>
            Tutagora is built on a single model of the school. Learners, staff, learning and
            money are one record, so the system can do more than display. It can reason about
            the school as a unit: what it costs, what it earns, who is struggling, what is
            stuck.
          </p>
          <p>Not a dashboard to admire. A school that knows itself.</p>
        </section>

        <section className="close">
          <div className="wrap">
            <h2>See it with your own school&rsquo;s numbers.</h2>
            <div className="actions">
              <Link href="/signup" className="arrow">
                Start with your school <Arrow />
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
          <span className="wordmark">Tutagora</span>
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
