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

        <div className="strip wrap" aria-label="What Tutagora covers">
          <ul className="label">
            <li>Admissions</li>
            <li>Fees</li>
            <li>Attendance</li>
            <li>Exams</li>
            <li>Report cards</li>
            <li>Timetable</li>
            <li>Transport</li>
            <li>WhatsApp</li>
          </ul>
        </div>

        <section className="panel" id="fees">
          <div className="wrap">
            <div className="text">
              <h2>Paid on the phone. Matched before the bursar sits down.</h2>
              <p>
                A parent gets an M-Pesa prompt, enters a PIN, and the payment is matched to the
                invoice the moment it lands. Card payments run through Paystack the same way.
              </p>
            </div>
            <div className="art">
              <div className="phone" aria-label="M-Pesa payment prompt, example">
                <div className="screen">
                  <div className="status num">
                    <span>07:42</span>
                    <span>Safaricom</span>
                  </div>
                  <div className="stk-bg">
                    <div className="stk">
                      <div className="t">M-PESA</div>
                      <div className="num">
                        Pay Ksh42,500.00 to TUTAGORA*ST MARYS ACADEMY for account STU-0416?
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

        <section className="panel" id="classroom">
          <div className="wrap">
            <div className="text">
              <h2>Attendance from a phone. Marks entered once.</h2>
              <p>
                Teachers take the register period by period. Marks go in once and flow straight
                into report cards the school prints or sends. No re-typing.
              </p>
            </div>
            <div className="art wide">
              <div className="register" aria-label="Attendance register, example">
                <div className="hd">
                  <span className="label">Grade 6 East · Tuesday 15 Sep</span>
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
                      ["Zawadi Njeri", "on on on on on on"],
                    ].map(([name, marks]) => (
                      <tr key={name}>
                        <td>{name}</td>
                        {marks.split(" ").map((m, i) => (
                          <td key={i}>
                            <span className={`dot ${m === "on" ? "" : m}`} />
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

        <section className="panel" id="parents">
          <div className="wrap">
            <div className="text">
              <h2>Nothing to install. It&rsquo;s on WhatsApp.</h2>
              <p>
                Parents open a link in WhatsApp and see fees, attendance and results for each
                child. No password. The link expires on its own.
              </p>
              <p>
                Every Monday at seven, the head teacher gets the week&rsquo;s numbers the same way.
              </p>
            </div>
            <div className="art">
              <div className="phone" aria-label="WhatsApp briefing, example">
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
                      <p>Good morning. St Mary&rsquo;s Academy this week.</p>
                      <p className="num">
                        Fees: 71% of Term 2 collected. KES 1,412,500 outstanding across 38
                        families, 9 with no payment yet.
                      </p>
                      <p className="num">Attendance last week 94%. Grade 8 dipped to 88% on Thursday.</p>
                      <p className="num">
                        3 applications waiting more than 48 hours. 2 leave requests need a decision.
                      </p>
                      <time dateTime="07:00">07:00</time>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel" id="office">
          <div className="wrap">
            <div className="text">
              <h2>How many months of cash the school has.</h2>
              <p>
                Tutagora forecasts runway from what has actually been collected, shows which
                classes pay for themselves, and flags what does not add up: fuel logged against a
                bus that did not run, stock that left the store without a requisition.
              </p>
            </div>
            <div className="art">
              <div className="runway" aria-label="Cash runway forecast, example">
                <div className="big num">
                  4.7<small>months of cash</small>
                </div>
                <svg viewBox="0 0 400 120" role="img" aria-label="Runway across the term">
                  <line x1="0" y1="119.5" x2="400" y2="119.5" stroke="rgba(242,242,240,0.2)" />
                  <polyline
                    fill="none"
                    stroke="#f2f2f0"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    points="0,96 40,90 80,74 120,70 160,48 200,44 240,40 280,30 320,26 360,20 400,12"
                  />
                  <circle cx="400" cy="12" r="3" fill="#f2f2f0" />
                </svg>
                <div className="legend num">
                  <span>Term start</span>
                  <span>Today</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="vision" id="vision">
          <div className="wrap">
            <div className="label">Vision</div>
            <p>
              A school is run on paper, memory and goodwill. The register is a book. The fees are
              a ledger, a receipt book and a bank statement that never quite agree.
            </p>
            <p>
              Tutagora puts all of it in one place that adds up, and reaches parents where they
              already are. Not a dashboard to admire. A record you can trust.
            </p>
          </div>
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
              <a className="quiet" href="#fees">
                Product
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
            <li>
              <Link className="quiet" href="/signup">
                Create an account
              </Link>
            </li>
          </ul>
          <span className="num">© 2026 Tutagora · Kenya</span>
        </div>
      </footer>
    </>
  )
}
