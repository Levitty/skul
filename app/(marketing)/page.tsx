import Link from "next/link"

// The hero headline. The repo's brand panel uses this line; swap in the
// official Tutagora slogan here and nothing else on the page needs to change.
const SLOGAN = (
  <>
    Manage your school
    <br />
    with <em>confidence.</em>
  </>
)

export default function HomePage() {
  return (
    <>
      <header className="nav">
        <div className="wrap">
          <Link href="/" className="wordmark" aria-label="Tutagora home">
            Tutagora
          </Link>
          <nav aria-label="Primary">
            <ul>
              <li>
                <a className="link" href="#fees">
                  Product
                </a>
              </li>
              <li>
                <a className="link" href="#vision">
                  Vision
                </a>
              </li>
            </ul>
          </nav>
          <div className="aux">
            <Link className="link" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <h1>{SLOGAN}</h1>
            <p className="lede">
              School management software for schools in Kenya. Admissions, fees, attendance,
              exams and report cards in one record that adds up. Parents are reached on WhatsApp,
              not another app.
            </p>
            <div className="actions">
              <Link href="/signup" className="btn">
                Start with your school
              </Link>
              <a className="link" href="#fees">
                See how it works
              </a>
            </div>
          </div>
        </section>

        <section className="ledger-band" aria-label="Example fee ledger">
          <div className="wrap">
            <div className="sheet">
              <div className="sheet-head">
                <span>Grade 6 East · Term 2, 2026 · Fee ledger</span>
                <span className="num">Reconciled 04:12 today · Sample data</span>
              </div>
              <div className="scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th className="r num hide-sm">Invoiced</th>
                    <th className="r num">Paid</th>
                    <th className="r num">Balance</th>
                    <th className="hide-sm">Last payment</th>
                    <th className="hide-sm">Reference</th>
                  </tr>
                </thead>
                <tbody className="num">
                  <tr>
                    <td>Amani Wanjiru</td>
                    <td className="r hide-sm">42,500</td>
                    <td className="r">42,500</td>
                    <td className="r">0</td>
                    <td className="hide-sm">14 Sep · M-Pesa</td>
                    <td className="hide-sm">SGH4K2L9PQ</td>
                  </tr>
                  <tr className="due">
                    <td>Brian Otieno</td>
                    <td className="r hide-sm">42,500</td>
                    <td className="r">20,000</td>
                    <td className="r">22,500</td>
                    <td className="hide-sm">02 Sep · M-Pesa</td>
                    <td className="hide-sm">SG27PLM4XT</td>
                  </tr>
                  <tr>
                    <td>Faith Chebet</td>
                    <td className="r hide-sm">42,500</td>
                    <td className="r">42,500</td>
                    <td className="r">0</td>
                    <td className="hide-sm">28 Aug · Card</td>
                    <td className="hide-sm">PSK-88214</td>
                  </tr>
                  <tr className="due">
                    <td>Kevin Mwangi</td>
                    <td className="r hide-sm">42,500</td>
                    <td className="r">0</td>
                    <td className="r">42,500</td>
                    <td className="hide-sm">—</td>
                    <td className="hide-sm">—</td>
                  </tr>
                  <tr>
                    <td>Mercy Achieng</td>
                    <td className="r hide-sm">42,500</td>
                    <td className="r">42,500</td>
                    <td className="r">0</td>
                    <td className="hide-sm">11 Sep · M-Pesa</td>
                    <td className="hide-sm">SGB9Q1RV7D</td>
                  </tr>
                  <tr className="due">
                    <td>Samuel Kiprop</td>
                    <td className="r hide-sm">42,500</td>
                    <td className="r">21,250</td>
                    <td className="r">21,250</td>
                    <td className="hide-sm">05 Sep · M-Pesa</td>
                    <td className="hide-sm">SG5WTN3ZK8</td>
                  </tr>
                  <tr>
                    <td>Zawadi Njeri</td>
                    <td className="r hide-sm">42,500</td>
                    <td className="r">42,500</td>
                    <td className="r">0</td>
                    <td className="hide-sm">01 Sep · M-Pesa</td>
                    <td className="hide-sm">SG1HC6YD2M</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </section>

        <section className="chapter" id="fees">
          <div className="wrap">
            <div className="no label num">01</div>
            <div className="text">
              <h2>Every shilling, reconciled.</h2>
              <p>
                Invoices go out each term. Parents pay with a one-tap M-Pesa prompt on their phone,
                or by card through Paystack. Each payment is matched to its invoice the moment it
                lands.
              </p>
              <p>
                The bursar&rsquo;s morning starts with a balanced ledger, not a bank statement and a
                receipt book that disagree.
              </p>
            </div>
            <div className="art">
              <div className="doc">
                <div className="doc-head">
                  <span>M-Pesa confirmation</span>
                  <span>Received 07:42</span>
                </div>
                <div className="doc-body">
                  <pre className="receipt">
                    SGH4K2L9PQ Confirmed. Ksh42,500.00 sent to TUTAGORA*ST MARYS ACADEMY for
                    account STU-0416 on 14/9/26 at 7:42 AM. New M-PESA balance is Ksh3,180.00.
                  </pre>
                </div>
                <div className="foot match num">
                  <span>
                    Matched to <strong>INV-2026-T2-0416</strong>
                  </span>
                  <span>Balance 0</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="chapter" id="academics">
          <div className="wrap">
            <div className="no label num">02</div>
            <div className="text">
              <h2>The register, the marks, the report card.</h2>
              <p>
                Teachers take attendance from a phone, period by period. Marks are entered once and
                flow into report cards the school can print or send.
              </p>
              <p>No re-typing. No spreadsheet at midnight before parents&rsquo; day.</p>
            </div>
            <div className="art">
              <div className="doc">
                <div className="doc-head">
                  <span>Report card · Term 2</span>
                  <span>Grade 6 East</span>
                </div>
                <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th className="r">Marks</th>
                      <th className="r">Grade</th>
                      <th className="hide-sm">Teacher</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    <tr>
                      <td>Mathematics</td>
                      <td className="r">84</td>
                      <td className="r">A</td>
                      <td className="hide-sm">Mr Kamau</td>
                    </tr>
                    <tr>
                      <td>English</td>
                      <td className="r">77</td>
                      <td className="r">B+</td>
                      <td className="hide-sm">Ms Adhiambo</td>
                    </tr>
                    <tr>
                      <td>Kiswahili</td>
                      <td className="r">81</td>
                      <td className="r">A-</td>
                      <td className="hide-sm">Mr Barasa</td>
                    </tr>
                    <tr>
                      <td>Science &amp; Technology</td>
                      <td className="r">69</td>
                      <td className="r">B</td>
                      <td className="hide-sm">Ms Wairimu</td>
                    </tr>
                    <tr>
                      <td>Social Studies</td>
                      <td className="r">88</td>
                      <td className="r">A</td>
                      <td className="hide-sm">Mr Odhiambo</td>
                    </tr>
                  </tbody>
                </table>
                </div>
                <div className="foot">
                  <span className="remark">Steady, curious, and asks the right questions.</span>
                  <span className="num"> &nbsp;— Class teacher · Attendance 58 of 60 days</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="chapter" id="parents">
          <div className="wrap">
            <div className="no label num">03</div>
            <div className="text">
              <h2>Nothing to install. It&rsquo;s on WhatsApp.</h2>
              <p>
                A parent taps a link in WhatsApp and sees fees, attendance and results for each of
                their children. No password. The link expires on its own.
              </p>
              <p>
                Every Monday at seven, the head teacher receives a briefing of the week ahead the
                same way.
              </p>
            </div>
            <div className="art">
              <div className="doc">
                <div className="doc-head">
                  <span>WhatsApp · Monday briefing</span>
                  <span>07:00</span>
                </div>
                <div className="doc-body msg">
                  <p>Good morning. Here is St Mary&rsquo;s Academy this week.</p>
                  <p className="num">
                    Fees: 71% of Term 2 collected. KES 1,412,500 outstanding across 38 families,
                    9 of them with no payment yet.
                  </p>
                  <p className="num">
                    Attendance last week: 94%. Grade 8 dipped to 88% on Thursday.
                  </p>
                  <p className="num">
                    Admissions: 3 applications have waited more than 48 hours. Staff: 2 leave
                    requests need a decision.
                  </p>
                  <time dateTime="07:00">Sent automatically · Sample data</time>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="chapter" id="business">
          <div className="wrap">
            <div className="no label num">04</div>
            <div className="text">
              <h2>The school as a business, in plain numbers.</h2>
              <p>
                Tutagora forecasts how many months of cash the school has at its current collection
                rate, and shows which classes pay for themselves.
              </p>
              <p>
                It also flags what does not add up: fuel logged against a bus that did not run,
                stock that left the store without a requisition, a register that is fuller than the
                fee roll.
              </p>
            </div>
            <div className="art">
              <div className="doc">
                <div className="doc-head">
                  <span>Profitability by grade · Term 2</span>
                  <span>KES</span>
                </div>
                <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Grade</th>
                      <th className="r">Learners</th>
                      <th className="r hide-sm">Fee income</th>
                      <th className="r hide-sm">Direct cost</th>
                      <th className="r">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    <tr>
                      <td>Grade 4</td>
                      <td className="r">52</td>
                      <td className="r hide-sm">2,210,000</td>
                      <td className="r hide-sm">1,640,000</td>
                      <td className="r">26%</td>
                    </tr>
                    <tr>
                      <td>Grade 5</td>
                      <td className="r">47</td>
                      <td className="r hide-sm">1,997,500</td>
                      <td className="r hide-sm">1,585,000</td>
                      <td className="r">21%</td>
                    </tr>
                    <tr>
                      <td>Grade 6</td>
                      <td className="r">44</td>
                      <td className="r hide-sm">1,870,000</td>
                      <td className="r hide-sm">1,610,000</td>
                      <td className="r">14%</td>
                    </tr>
                    <tr>
                      <td>Grade 7</td>
                      <td className="r">31</td>
                      <td className="r hide-sm">1,317,500</td>
                      <td className="r hide-sm">1,480,000</td>
                      <td className="r" style={{ color: "var(--mark)" }}>
                        −12%
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
                <div className="foot num">Cash runway at current collection rate: 4.7 months</div>
              </div>
            </div>
          </div>
        </section>

        <section className="vision" id="vision">
          <div className="wrap">
            <div className="label">Why we build this</div>
            <p>
              A school is run on paper, memory and goodwill. The register is a book. The fees are
              a ledger, a receipt book and a bank statement that never quite agree. The plan for
              the week lives in the head teacher&rsquo;s head.
            </p>
            <p>
              Tutagora exists to put all of it in one place that is honest, that adds up, and that
              reaches parents where they already are. <em>Not a dashboard to admire. A record you
              can trust.</em>
            </p>
          </div>
        </section>

        <section className="close">
          <div className="wrap">
            <h2>See it with your own school&rsquo;s numbers.</h2>
            <div className="actions">
              <Link href="/signup" className="btn">
                Start with your school
              </Link>
              <Link className="link" href="/login">
                Sign in
              </Link>
            </div>
            <p className="note">
              Set-up takes an afternoon: classes, fee structure, and a bulk import of learners from
              the spreadsheet you already have.
            </p>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span className="wordmark">Tutagora</span>
          <ul>
            <li>
              <a className="link" href="#fees">
                Product
              </a>
            </li>
            <li>
              <a className="link" href="#vision">
                Vision
              </a>
            </li>
            <li>
              <Link className="link" href="/login">
                Sign in
              </Link>
            </li>
            <li>
              <Link className="link" href="/signup">
                Create an account
              </Link>
            </li>
          </ul>
          <span className="num">© 2026 Tutagora · Built for schools in Kenya</span>
        </div>
      </footer>
    </>
  )
}
