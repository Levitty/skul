import Link from "next/link"
import { Board } from "./board"
import { SketchSmis, SketchHr, SketchLearning, SketchClassroom, SketchBalloon, SketchOnto } from "./sketches"
import { Mark, BRAND } from "./logo"
import { CONTACT, waLink, mailLink, ENQUIRY } from "./contact"
import { FAQ, jsonLd } from "./seo"
import { Match } from "./match"
import { Work } from "./work"
import { Pin } from "./pin"
import { Phone, In, Out, Replies } from "./phone"

// The hero headline. Swap in the official Tutagora slogan here; nothing else
// on the page needs to change. Words are split so they can enter one by one.
const SLOGAN = "Manage your school with confidence."

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
    to: "#smis",
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
    to: "#work-4",
    art: <SketchHr />,
    name: "Tutagora HR",
    tagline: "Every person who works here, first-class.",
    blurb: "From the head teacher to the driver: hired, contracted, paid and grown on one record.",
    title: "The whole workforce, from the open role to the handover.",
    lede:
      "A school is a people business with a building attached, and payroll is its largest cost. Tutagora HR runs the whole lifecycle for every employee, teaching and support, across every branch: recruitment, contracts and letters generated from the record, probation, leave, attendance, training, payroll, and the clearance and handover when someone leaves.",
    holds: [
      "Employee records and documents",
      "Recruitment: open roles and candidates",
      "Offer letters, contracts and warnings, acknowledged on receipt",
      "Probation reviews and contracts ending",
      "Leave: heads recommend, HR decides",
      "Daily attendance and check-in",
      "Payroll and the statutory calendar",
      "Training, goals and performance",
      "Teaching load from the timetable",
      "Assets issued and returned",
      "Staff by department, across branches",
      "Clearance, final dues and handover",
    ],
  },
  {
    id: "learning",
    to: "#work-3",
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
                <li className="hide-sm">
                  <a className="quiet" href="#systems">
                    Systems
                  </a>
                </li>
                <li>
                  <Link className="quiet" href="/class">
                    Class
                  </Link>
                </li>
                <li className="hide-sm">
                  <a className="quiet" href="#vision">
                    Vision
                  </a>
                </li>
                <li>
                  <a className="quiet" href={waLink(ENQUIRY)} target="_blank" rel="noopener">
                    Talk to us
                  </a>
                </li>
              </ul>
            </nav>
          </header>

          <div className="hero-mark" aria-hidden="true">
            <SketchBalloon />
          </div>

          <h1>
            {SLOGAN.split(" ").map((word, i) => (
              <span key={i}>
                <span className="w">{word}</span>{" "}
              </span>
            ))}
          </h1>
          <div className="foot">
            <p className="sub">
              One record for the whole school. Built for Kenya. Fees on M-Pesa, parents on
              WhatsApp, and a truth that adds up.
            </p>
            <Link href="/class" className="arrow">
              Take the class <Arrow />
            </Link>
          </div>
        </section>

        <div className="pin-wrap">
        <Pin>
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
              <a className="card" href={c.to} key={c.id}>
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
        </Pin>
        <Work />
        </div>

        <section className="panel sys smis" id="smis">
          <div className="wrap">
            <div className="top">
              <div className="text">
                <div className="label">Tutagora SMIS</div>
                <h2>Everything an SMIS does. Then the part none of them do.</h2>
                <p>
                  Admissions, learner files, attendance, fee invoices, timetables, exams, report
                  cards, transport, the library, the clinic, and the dashboards to watch them
                  all. You get every one of them on the first day. What you are buying is what
                  happens next.
                </p>
              </div>
              <div className="onto-board" aria-hidden="true">
                <Board />
                <div className="chalk-figure">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div className="chalk-layer" key={n}>
                      <SketchOnto layer={n} delay={(n - 1) * 900} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="diff">
              <div className="diff-text">
                <div className="label">You did not expect</div>
                <h3>A payment that knows where it belongs.</h3>
                <p>
                  At 07:42 a parent pays on M-Pesa. By 07:43 the invoice is settled, the books
                  are posted, the director&rsquo;s collection figure has moved, and the parent
                  has a receipt on WhatsApp. Nobody typed anything.
                </p>
                <p>
                  That is the difference between a system that stores your school and one that
                  knows it. Every record in Tutagora is joined to the others, so one fact lands
                  everywhere it is true.
                </p>
              </div>
              <div className="diff-art">
                <Match />
              </div>
            </div>
          </div>
        </section>

        <section className="panel advisor" id="advisor">
          <div className="wrap">
            <div className="text">
              <div className="label">Tutagora Advisor</div>
              <h2>It does not show you the school. It tells you.</h2>
              <p>
                A dashboard waits to be read. The Advisor reads the record itself, on the
                school&rsquo;s own clock, the term, and says what it found in plain language on
                WhatsApp. Ask it a question and it answers from the same single truth.
              </p>
              <p>
                It drafts the reminder, the checklist, the staffing plan for next term. It sends
                nothing and pays nothing. <strong>The AI drafts. People decide.</strong>
              </p>
              <ul className="watch">
                <li>
                  <b>Every Monday, 07:00.</b> Collection, runway, attendance, load and anything that does not add up, before the first bell.
                </li>
                <li>
                  <b>Any question, any day.</b> Answered from the record, with the figures it used.
                </li>
                <li>
                  <b>Every proposal logged.</b> What it read, what it drafted, who decided.
                </li>
              </ul>
            </div>
            <div className="art talk">
              <Phone time="10:17" day="Wednesday" name="Tutagora" sub="business account" label="The director asks the Advisor why Grade 7 is below cost, and it answers with figures and three options to draft. Example.">
                <Out at="10:17">
                  <p>why is grade 7 below cost</p>
                </Out>
                <In at="10:17">
                  <p className="num">Grade 7 has 31 learners, against 38 last year. Fees collected this term: KES 1.42m. Its direct cost, two teachers and the bus: KES 1.61m. That is 12% below cost, for the second term running.</p>
                </In>
                <In at="10:18">
                  <p>Three things would close it: seven more learners, the bus route shared with Grade 8, or the two streams merged after Term 3. I can draft the numbers for each.</p>
                </In>
                <Replies items={["Draft all three", "Show me the families", "Not now"]} />
                <Out at="10:19">
                  <p>Draft all three</p>
                </Out>
                <In at="10:19">
                  <p>Done. Three one-page notes are in your documents. Nothing has been sent to anyone.</p>
                </In>
              </Phone>
            </div>
          </div>
        </section>

        <section className="vision" id="vision">
          <div className="wrap">
            <div className="vision-art">
              <SketchClassroom />
            </div>
            <h2>Vision</h2>
            <p>
              I have spent years inside the school as an organisation, in different capacities,
              from the lower rungs of the hierarchy to the top, and across its departments. In
              that time the school changed, and so did the tools it ran on. How a school was run
              when I was in one is not how a school is run now.
            </p>
            <p>
              When I began, a school ran on paper: the register, the receipt book, the mark book,
              the file. The first software arrived to replace them one at a time, desktop
              programs that kept the same records in a computer instead of a cupboard. Then the
              systems moved onto the web and onto phones. Fees could be paid on M-Pesa, results
              could be sent by SMS, and a school&rsquo;s records could be reached from home.
            </p>
            <p>
              Then came the dashboards. The data collected over the years could at last be seen:
              enrolment, collection, attendance and results on one screen, without waiting for
              month end. It was a real step. For the first time a director could run a school by
              its numbers, and we could do so much with them. Today every system collects the data
              and shows a dashboard, and that is good.
            </p>
            <p>
              I believed, and felt, that there was still more. A dashboard shows you the school.
              It does not know the school. It cannot tell you that the family behind an arrears
              figure also has a child on the bus, that a grade is not paying for itself, or that
              one teacher is carrying twice the load of her department. Those answers live in the
              connections between records, and a dashboard has none.
            </p>
            <p>
              The world changed too. At the end of 2022 a chat window put a language model in
              everyone&rsquo;s hands and showed what was now possible. We are in the era of agents
              and automated work, where software no longer only reports; it acts. A school that
              runs on paper, WhatsApp threads and a dashboard cannot use any of that safely.
            </p>
            <p>
              So we adapted, ahead of the change rather than behind it, and built on what the
              industry had already started. Not another dashboard, but software ingrained in the
              institution: one model of the school in which every learner, teacher, invoice,
              lesson and bus is a record, joined to the others by the relationships that actually
              exist, and changed only through named, logged actions. The connections a director
              needs for strategy are one step away instead of three spreadsheets apart. And
              intelligence can act inside that model, drafting the reminder, the checklist, the
              staffing plan, while people decide.
            </p>
            <p>
              So now we have Tutagora. It begins where it always did, in the classroom, with a
              teacher and a learner. Everything else exists to serve them.
            </p>
            <p>Not a dashboard to admire. A school that knows itself.</p>
          </div>
        </section>

        <section className="faq wrap" id="questions">
          <div className="label">Questions directors ask</div>
          <h2>Before you call.</h2>
          <dl>
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {jsonLd().map((d, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d) }} />
        ))}

        <section className="close">
          <div className="wrap">
            <h2>Bring your school into one record.</h2>
            <p className="close-sub">
              Tell us about your school and we will come and show you the record, in person or
              on a call. One message is enough.
            </p>
            <div className="actions">
              <a href={waLink(ENQUIRY)} className="arrow" target="_blank" rel="noopener">
                Talk to us on WhatsApp <Arrow />
              </a>
              <a className="quiet" href={mailLink("Enquiry about Tutagora", ENQUIRY)}>
                Email {CONTACT.email}
              </a>
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
              <a className="quiet" href="#work-4">
                HR
              </a>
            </li>
            <li>
              <a className="quiet" href="#work-3">
                Learning
              </a>
            </li>
            <li>
              <a className="quiet" href="#advisor">
                Advisor
              </a>
            </li>
            <li>
              <a className="quiet" href={waLink(ENQUIRY)} target="_blank" rel="noopener">
                WhatsApp
              </a>
            </li>
            <li>
              <a className="quiet" href={mailLink("Enquiry about Tutagora")}>
                Email
              </a>
            </li>
          </ul>
          <span className="num">© 2026 Tutagora · Kenya</span>
        </div>
      </footer>
    </>
  )
}
