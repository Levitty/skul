"use client"

// A school that never spoke to itself. The artefacts of one term, as they
// really are, strewn across a white page: the register, the fee book, an
// M-Pesa message, a parent on WhatsApp, the marks spreadsheet, the bus list,
// payroll, a memo, a sticky note. Dotted lines that reach for each other and
// connect nothing. The slate that follows is the answer.

import { useEffect, useRef } from "react"
import { mountMess } from "./mess-logic.js"

const Tick = () => <span className="q-tk">✓</span>

export function Mess() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => mountMess(ref.current), [])
  return (
    <section className="mess" id="mess" ref={ref}>
      <div className="wrap">
        <div className="mhead">
          <h2>A school that never spoke to itself.</h2>
          <p>This is what confirming one payment looks like across nine places.</p>
        </div>
      </div>
      <div className="mess-fit">
        <div className="mess-stage" aria-label="The artefacts of a school term, none of which know each other" role="img">
          <svg className="mlines" viewBox="0 0 1200 780" aria-hidden="true">
            <path d="M 790 130 C 700 150, 700 60, 610 90" />
            <path d="M 560 380 C 520 330, 400 340, 330 260" />
            <path d="M 400 470 C 480 520, 560 480, 600 560" />
            <path d="M 900 440 C 960 470, 1000 540, 960 600" />
            <path d="M 300 660 C 380 690, 420 650, 470 640" />
            <path d="M 760 300 C 720 260, 760 200, 830 190" />
            <text x="612" y="76">?</text>
            <text x="318" y="250">?</text>
            <text x="972" y="604">?</text>
          </svg>

          {/* 1 · the register */}
          <div className="q-it q-paper q-reg" style={{ left: 40, top: 40, width: 300, ["--r" as string]: "-2deg" }}>
            <div className="q-ph">Grade 6 East · Attendance · Term 2</div>
            {[
              ["Amani W.", "✓✓✓A✓"],
              ["Brian M.", "✓✓L✓✓"],
              ["Faith O.", "✓✓✓✓✓"],
              ["Kevin K.", "A A ✓✓✓"],
              ["Neema A.", "✓✓✓✓✓"],
              ["Otieno J.", "✓ L ✓✓A"],
            ].map(([n, m]) => (
              <div className="q-rr" key={n}>
                <span className="q-hand">{n}</span>
                <span className="q-hand q-mk">{m}</span>
              </div>
            ))}
          </div>

          {/* 2 · the fee book */}
          <div className="q-it q-paper q-ledger" style={{ left: 420, top: 24, width: 320, ["--r" as string]: "1.5deg" }}>
            <div className="q-ph">Fees register 2026 · Term 2</div>
            <div className="q-rr q-h"><span>Name</span><span>Paid</span><span>Bal.</span></div>
            {[
              ["Wanjiru, A.", "10,200", "0"],
              ["Mwangi, B.", "15,000", "9,500"],
              ["Achieng, O.", "—", "18,000"],
              ["Otieno, J.", "31,000", "0"],
              ["Kamau, M.", "6,000", "6,750"],
            ].map(([n, p, b]) => (
              <div className="q-rr" key={n}>
                <span className="q-hand">{n}</span>
                <span className="q-hand num">{p}</span>
                <span className="q-hand num">{b}</span>
              </div>
            ))}
            <div className="q-scrawl q-hand">total?? ask Grace</div>
          </div>

          {/* 3 · M-Pesa */}
          <div className="q-it q-sms" style={{ left: 800, top: 70, width: 300, ["--r" as string]: "2deg" }}>
            <div className="q-from">MPESA</div>
            <p className="num">RJ7K2M8QX1 Confirmed. Ksh10,200.00 sent to RIVERSIDE ACADEMY on 17/9/26 at 7:42 AM.</p>
            <span className="q-when num">07:42</span>
            <span className="q-note q-hand">which child?</span>
          </div>

          {/* 4 · the marks spreadsheet */}
          <div className="q-it q-sheet" style={{ left: 60, top: 330, width: 350, ["--r" as string]: "1deg" }}>
            <div className="q-tab">Marks_Term2_FINAL_v3.xlsx</div>
            <table>
              <thead><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
              <tbody>
                <tr><td>1</td><td>Name</td><td>Eng</td><td>Kis</td><td>Math</td></tr>
                <tr><td>2</td><td>Amani W.</td><td className="num">82</td><td className="num">74</td><td className="num">68</td></tr>
                <tr><td>3</td><td>Brian M.</td><td className="num">61</td><td className="num">70</td><td className="num">74</td></tr>
                <tr><td>4</td><td>Faith O.</td><td className="num">88</td><td className="num">79</td><td className="num">91</td></tr>
                <tr><td>5</td><td>Kevin K.</td><td className="num">54</td><td className="num"></td><td className="num">55</td></tr>
                <tr><td>6</td><td>Neema A.</td><td className="num">77</td><td className="num">83</td><td className="num">83</td></tr>
              </tbody>
            </table>
          </div>

          {/* 5 · the parent on WhatsApp */}
          <div className="q-it q-wa" style={{ left: 450, top: 330, width: 300, ["--r" as string]: "-1deg" }}>
            <div className="q-who"><span className="q-av" /><b>Mama Amani</b></div>
            <div className="q-bub">Good morning madam, I have paid 10,200 for Amani. Please confirm 🙏<time className="num">07:58 ✓✓</time></div>
          </div>

          {/* 6 · the bus list */}
          <div className="q-it q-paper q-bus" style={{ left: 800, top: 260, width: 250, ["--r" as string]: "-2.5deg" }}>
            <i className="q-pin" />
            <div className="q-ph">Route 4 · Kileleshwa</div>
            <div className="q-sub">Matron: Mary · Driver: Kip</div>
            {[["Amani W.", "Gate 3"], ["Neema A.", "Shell"], ["Otieno J.", "Gate 3"], ["Kevin K.", "Ring Rd"], ["Zawadi M.", "Church"]].map(([n, s]) => (
              <div className="q-rr" key={n}><span>{n}</span><span className="q-mute">{s}</span></div>
            ))}
          </div>

          {/* 7 · payroll */}
          <div className="q-it q-paper q-pay" style={{ left: 840, top: 500, width: 330, ["--r" as string]: "1.5deg" }}>
            <div className="q-ph">Payroll · September</div>
            <table className="num">
              <tbody>
                <tr><td>Achieng, G.</td><td>Teacher</td><td>Paid</td></tr>
                <tr><td>Kiprop, D.</td><td>Driver</td><td>Paid</td></tr>
                <tr><td>Mutua, P.</td><td>Teacher</td><td className="q-warn">Pending</td></tr>
                <tr><td>Njeri, S.</td><td>Cook</td><td>Paid</td></tr>
              </tbody>
            </table>
          </div>

          {/* 8 · the memo */}
          <div className="q-it q-paper q-memo" style={{ left: 110, top: 560, width: 290, ["--r" as string]: "-1.5deg" }}>
            <div className="q-lh">RIVERSIDE ACADEMY</div>
            <div className="q-ph">Memo · To all class teachers</div>
            <p>Submit the fee balances for your class to the bursar by Friday, 12 noon. Use the new form.</p>
            <span className="q-sig q-hand">— Bursar</span>
          </div>

          {/* 9 · the sticky note */}
          <div className="q-it q-sticky q-hand" style={{ left: 480, top: 560, width: 160, ["--r" as string]: "4deg" }}>
            Amani W. — inhaler at the office!! tell the bus
          </div>

          {/* 10 · the inbox */}
          <div className="q-it q-mail" style={{ left: 680, top: 650, width: 260, ["--r" as string]: "0deg" }}>
            <span className="q-cnt num">47</span>
            <b>Re: Re: Re: arrears list Term 2</b>
            <small>Grace · attached the wrong sheet, see below</small>
          </div>

          {/* the people asking */}
          <div className="q-it q-ask" style={{ left: 250, top: 250, ["--r" as string]: "0deg" }}>
            <span className="q-av q-b" /><span><small>Bursar</small>Who paid 10,200 at 07:42?</span>
          </div>
          <div className="q-it q-ask" style={{ left: 640, top: 470, ["--r" as string]: "0deg" }}>
            <span className="q-av q-c" /><span><small>Director</small>What is Grade 7 costing us?</span>
          </div>
          <div className="q-it q-ask" style={{ left: 940, top: 410, ["--r" as string]: "0deg" }}>
            <span className="q-av q-d" /><span><small>Class teacher</small>Has Amani&rsquo;s mum paid?</span>
          </div>
        </div>
      </div>
      <div className="wrap">
        <p className="mfoot">Every one of these is true. None of them knows the others.</p>
      </div>
    </section>
  )
}
