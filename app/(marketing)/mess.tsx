"use client"

// A school that never spoke to itself, then one record. The section pins
// while the reader scrolls. At rest it is the chaos: the artefacts of one
// term as they really are, strewn across the page at their real relative
// sizes. Scrolling fades them into grey wireframes that fill in as a tidy
// grid of matching panels around one centre card, the heading swaps, and
// three lines type into the card from the M-Pesa message. The reader's own
// scrolling fixes the mess.

import { useEffect, useRef } from "react"
import { mountMess } from "./mess-logic.js"

const FEES = [
  ["Wanjiru, A.", "10,200", "0"],
  ["Mwangi, B.", "15,000", "9,500"],
  ["Achieng, O.", "—", "18,000"],
  ["Otieno, J.", "31,000", "0"],
  ["Kamau, M.", "6,000", "6,750"],
  ["Njoroge, P.", "12,000", "12,000"],
  ["Auma, Z.", "24,500", "0"],
  ["Kiptoo, S.", "—", "24,500"],
]

const LOG = [
  "07:42 · M-Pesa payment matched to Amani W., Term 2. Balance KES 0. Receipt sent to her mother.",
  "16:10 · Mrs Achieng entered CAT 2 marks for Grade 6 East. 32 report cards ready.",
  "16:30 · Kevin K. absent a second day. His mother replied: at the clinic, back Thursday.",
  "17:05 · Mr Mutua's contract ends in three weeks. Renewal drafted for the head to sign.",
  "18:04 · Report cards sent to parents on WhatsApp. Monday's brief updated for the director.",
]

export function Mess() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => mountMess(ref.current), [])
  return (
    <section className="mess" id="mess" ref={ref}>
      <div className="mess-pin">
        <div className="wrap">
          <div className="mhead">
            <div className="mh-a">
              <h2>A school that never spoke to itself.</h2>
              <p>This is what one Tuesday looks like across nine places that do not know each other.</p>
            </div>
            <div className="mh-b" aria-hidden="true">
              <h2>Now, one record.</h2>
              <p>Fees, marks, attendance, staff and the books in one place. The same Tuesday, kept by the record.</p>
            </div>
          </div>
        </div>
        <div className="mess-fit">
          <div className="mess-stage">
            {/* ---------- the chaos ---------- */}
            <div className="m-chaos" role="img" aria-label="The artefacts of a school term, none of which know each other">
              <svg className="mlines" viewBox="0 0 1440 900" aria-hidden="true">
                <defs>
                  <marker id="m-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                </defs>
                <path d="M 590 360 C 520 380, 480 300, 470 250 C 460 200, 520 190, 540 230" markerEnd="url(#m-arr)" />
                <path d="M 1120 380 C 1150 320, 1100 300, 1080 260 C 1060 220, 1100 190, 1070 170" markerEnd="url(#m-arr)" />
                <path d="M 700 620 C 760 640, 790 700, 770 740 C 760 760, 740 760, 760 770" markerEnd="url(#m-arr)" />
                <path d="M 300 620 C 340 560, 400 560, 380 610 C 360 650, 300 640, 320 690" markerEnd="url(#m-arr)" />
                <path d="M 540 150 C 640 60, 800 120, 900 30" />
                <path d="M 870 250 C 760 300, 700 200, 560 230" />
                <text x="452" y="242">?</text>
                <text x="1062" y="150">?</text>
                <text x="784" y="796">?</text>
              </svg>

              <div className="q-it q-feebook">
                <div className="q-sheetb q-s2" />
                <div className="q-sheetb q-s1" />
                <div className="q-paper q-ledger">
                  <div className="q-ph">Fees register 2026 · Term 2 · Grade 6 East</div>
                  <div className="q-rr q-h"><span>Name</span><span>Paid</span><span>Balance</span></div>
                  {FEES.map(([n, p, b]) => (
                    <div className="q-rr" key={n}>
                      <span className="q-hand">{n}</span>
                      <span className="q-hand num">{p}</span>
                      <span className="q-hand num">{b}</span>
                    </div>
                  ))}
                  <div className="q-scrawl q-hand">total?? ask Grace</div>
                </div>
              </div>

              <div className="q-it q-paper q-reg">
                <div className="q-ph">Grade 6 East · Attendance · Week 6</div>
                {[["Amani W.", "✓✓✓A✓"], ["Brian M.", "✓✓L✓✓"], ["Faith O.", "✓✓✓✓✓"], ["Kevin K.", "A A ✓✓✓"], ["Neema A.", "✓✓✓✓✓"], ["Otieno J.", "✓ L ✓✓A"]].map(([n, m]) => (
                  <div className="q-rr" key={n}>
                    <span className="q-hand">{n}</span>
                    <span className="q-hand q-mk">{m}</span>
                  </div>
                ))}
              </div>

              <div className="q-it q-photo">
                <div className="q-slip">
                  <b>Riverside Academy</b>
                  <small>Official receipt · No. 04417</small>
                  <div className="q-sl"><span>Received from</span><i className="q-hand">Mama Amani</i></div>
                  <div className="q-sl"><span>Amount</span><i className="q-hand num">10,200/=</i></div>
                  <div className="q-sl"><span>For</span><i className="q-hand">Term 2 fees</i></div>
                  <div className="q-sl"><span>Class</span><i className="q-hand">?</i></div>
                  <span className="q-stamp">Received</span>
                </div>
              </div>

              <div className="q-it q-sticky q-hand">Amani W. — inhaler at the office!! tell the bus</div>
              <div className="q-it q-sticky q-sticky2 q-hand">Mutua contract ends Oct?? renew? ask HR</div>

              <div className="q-it q-paper q-bus">
                <i className="q-pin" />
                <div className="q-ph">Route 4 · Kileleshwa</div>
                <div className="q-sub">Matron: Mary · Driver: Kip</div>
                {[["Amani W.", "Gate 3"], ["Neema A.", "Shell"], ["Otieno J.", "Gate 3"], ["Kevin K.", "Ring Rd"], ["Zawadi M.", "Church"]].map(([n, s]) => (
                  <div className="q-rr" key={n}><span>{n}</span><span className="q-mute">{s}</span></div>
                ))}
              </div>

              <div className="q-it q-phone">
                <div className="q-scr">
                  <div className="q-bar"><span className="num">07:43</span><span className="q-sig">●●●● ▮</span></div>
                  <div className="q-hd"><span className="q-ico">M</span>MPESA</div>
                  <div className="q-msg num">RJ7K2M8QX1 Confirmed. Ksh10,200.00 sent to RIVERSIDE ACADEMY on 17/9/26 at 7:42 AM. New M-PESA balance is Ksh3,410.00.<time>07:42</time></div>
                  <div className="q-msg num">RJ7L0P3WD8 Confirmed. Ksh6,000.00 sent to RIVERSIDE ACADEMY on 17/9/26 at 8:10 AM.<time>08:10</time></div>
                  <div className="q-msg num">RJ7M4K1QZ2 Confirmed. Ksh15,000.00 sent to RIVERSIDE ACADEMY on 17/9/26 at 8:31 AM.<time>08:31</time></div>
                </div>
                <span className="q-note q-hand">which child?</span>
              </div>

              <div className="q-it q-app q-wa-ico"><span className="num">107</span></div>

              <div className="q-it q-wa">
                <div className="q-who"><span className="q-av" /><b>Mama Amani</b><small>online</small></div>
                <div className="q-bub">Good morning madam, I have paid 10,200 for Amani. Please confirm 🙏<time className="num">07:58 ✓✓</time></div>
                <div className="q-bub q-out">Let me check with the bursar and revert<time className="num">09:20 ✓✓</time></div>
              </div>

              <div className="q-it q-mail">
                <span className="q-gm">M</span>
                <span className="q-cnt num">47</span>
                <b>Re: Re: Re: arrears list Term 2</b>
                <small>Grace · attached the wrong sheet, see below</small>
              </div>

              <div className="q-it q-xls">
                <div className="q-file q-f2"><div className="q-tab">Marks_Term2_FINAL.xlsx</div></div>
                <div className="q-file q-f1"><div className="q-tab">Marks_Term2_FINAL_v2.xlsx</div></div>
                <div className="q-file q-sheet">
                  <div className="q-tab">Marks_Term2_FINAL_v3.xlsx</div>
                  <table>
                    <thead><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead>
                    <tbody>
                      <tr><td>1</td><td>Name</td><td>Eng</td><td>Kis</td><td>Math</td><td>Sci</td></tr>
                      <tr><td>2</td><td>Amani W.</td><td className="num">82</td><td className="num">74</td><td className="num">68</td><td className="num">79</td></tr>
                      <tr><td>3</td><td>Brian M.</td><td className="num">61</td><td className="num">70</td><td className="num">74</td><td className="num">66</td></tr>
                      <tr><td>4</td><td>Faith O.</td><td className="num">88</td><td className="num">79</td><td className="num">91</td><td className="num">85</td></tr>
                      <tr><td>5</td><td>Kevin K.</td><td className="num">54</td><td className="num q-bad">#REF!</td><td className="num">55</td><td className="num">60</td></tr>
                      <tr><td>6</td><td>Neema A.</td><td className="num">77</td><td className="num">83</td><td className="num">83</td><td className="num">81</td></tr>
                      <tr><td>7</td><td>Otieno J.</td><td className="num">69</td><td className="num">72</td><td className="num"></td><td className="num">70</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="q-it q-paper q-memo">
                <div className="q-lh">RIVERSIDE ACADEMY</div>
                <div className="q-ph">Memo · To all class teachers</div>
                <p>Submit the fee balances for your class to the bursar by Friday, 12 noon. Use the new form, not the old one.</p>
                <span className="q-sig2 q-hand">— Bursar</span>
              </div>

              <div className="q-it q-paper q-pay">
                <div className="q-ph">Payroll · September</div>
                <table className="num">
                  <tbody>
                    <tr><td>Achieng, G.</td><td>Teacher</td><td>Paid</td></tr>
                    <tr><td>Kiprop, D.</td><td>Driver</td><td>Paid</td></tr>
                    <tr><td>Mutua, P.</td><td>Teacher</td><td className="q-warn">Pending</td></tr>
                    <tr><td>Njeri, S.</td><td>Cook</td><td>Paid</td></tr>
                    <tr><td>Wekesa, L.</td><td>Teacher</td><td className="q-warn">Pending</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="q-it q-folder">
                <i />
                <span>Fee slips 2026<small>318 items</small></span>
              </div>

              <div className="q-it q-ask q-a1"><span className="q-av q-b" /><span><small>Bursar</small>Who paid 10,200 at 07:42?</span></div>
              <div className="q-it q-ask q-a2"><span className="q-av q-c" /><span><small>Director</small>Who is carrying the most lessons?</span></div>
              <div className="q-it q-ask q-a3"><span className="q-av q-d" /><span><small>Class teacher</small>Who has Kevin&rsquo;s mum&rsquo;s number?</span></div>
            </div>

            {/* ---------- the order ---------- */}
            <div className="m-order" role="img" aria-label="The same term as one record: the learner, her invoice, her guardian, the bus, attendance, the report card and the books, all changed by one payment">
              <div className="mh-b m-only" aria-hidden="true">
                <h2>Now, one record.</h2>
                <p>Fees, marks, attendance, staff and the books in one place. The same Tuesday, kept by the record.</p>
              </div>

              <div className="o-col o-left">
                <div className="o-panel o-learner">
                  <div className="o-k">Learner</div>
                  <div className="o-t">Amani Wanjiru</div>
                  <div className="o-s">Grade 6 East · Adm. 0416</div>
                  <div className="o-row"><span>Guardian</span><b>Mama Amani · 0722 ··· 416</b></div>
                  <div className="o-row"><span>Bus</span><b>Route 4 · Gate 3</b></div>
                  <div className="o-row"><span>Clinic</span><b>Inhaler at the office</b></div>
                  <div className="o-row"><span>Fees</span><b className="o-ok">Balance KES 0</b></div>
                </div>
                <div className="o-panel o-attend">
                  <div className="o-k">Attendance · Week 6</div>
                  <div className="o-big num">94%</div>
                  <div className="o-s">Grade 6 East · Kevin K. absent, mother reached 16:30</div>
                </div>
                <div className="o-panel o-report">
                  <div className="o-k">Report card · Term 2</div>
                  <div className="o-marks num"><span>Eng <b>82</b></span><span>Kis <b>74</b></span><span>Math <b>68</b></span><span>Sci <b>79</b></span></div>
                  <div className="o-row"><span>Class teacher</span><b>Mrs Achieng</b></div>
                  <div className="o-row"><span>Sent to parents</span><b>Fri 18:04</b></div>
                </div>
              </div>

              <div className="o-col o-mid">
                <div className="o-panel o-class">
                  <div className="o-k">Class · Grade 6 East</div>
                  <div className="o-list"><span>32 learners</span><span>Mrs Achieng <i>class teacher</i></span><span>28 lessons a week <i>4 covers</i></span><span>Bus route 4 <i>11 riders</i></span></div>
                </div>
                <div className="o-panel o-centre">
                  <div className="o-k">Tuesday, on the record</div>
                  <ol className="o-log">
                    {LOG.map((l, i) => (
                      <li key={i} data-t={l}><span /></li>
                    ))}
                  </ol>
                </div>
                <div className="o-panel o-guardian">
                  <div className="o-k">Guardian · WhatsApp</div>
                  <div className="o-bub">Received, thank you. KES 10,200 for Amani, Term 2. Balance KES 0.<time className="num">07:43 ✓✓</time></div>
                </div>
              </div>

              <div className="o-col o-right">
                <div className="o-panel o-invoice">
                  <div className="o-k">Invoice · Term 2</div>
                  <div className="o-t">Amani W.</div>
                  <div className="o-row"><span>Tuition</span><b className="num">8,700</b></div>
                  <div className="o-row"><span>Transport</span><b className="num">1,500</b></div>
                  <div className="o-row o-tot"><span>Balance</span><b className="num"><s>10,200</s> 0</b></div>
                </div>
                <div className="o-panel o-staff">
                  <div className="o-k">Staff · Mr Mutua P.</div>
                  <div className="o-t">Teacher · Mathematics</div>
                  <div className="o-row"><span>Contract</span><b>Ends 21 Oct · renewal drafted</b></div>
                  <div className="o-row"><span>Leave</span><b>4 days left</b></div>
                  <div className="o-row"><span>Payroll</span><b className="o-ok">Ready · 28th</b></div>
                </div>
                <div className="o-panel o-books">
                  <div className="o-k">The books</div>
                  <div className="o-row"><span>Fees income</span><b className="num o-ok">+10,200</b></div>
                  <div className="o-row"><span>Term 2 collected</span><b className="num"><s>71%</s> 72%</b></div>
                  <div className="o-row"><span>Staff cost</span><b className="num">58% of income</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
