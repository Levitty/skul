"use client"

// The school, without the chasing. A light row of the product as paper:
// each card one true artefact, with a line under it. Slides sideways.

import { useEffect, useRef } from "react"

const Av = ({ tone = "" }: { tone?: string }) => <span className={`av ${tone}`} aria-hidden="true" />

export function Work() {
  const track = useRef<HTMLDivElement>(null)
  const prev = useRef<HTMLButtonElement>(null)
  const next = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const t = track.current
    if (!t) return
    const step = () => {
      const c = t.querySelector<HTMLElement>(".wcard")
      return c ? c.getBoundingClientRect().width + 24 : 400
    }
    const upd = () => {
      if (prev.current) prev.current.disabled = t.scrollLeft < 10
      if (next.current) next.current.disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 10
    }
    t.addEventListener("scroll", upd, { passive: true })
    upd()
    const cards = Array.from(t.querySelectorAll<HTMLElement>(".wcard"))
    let io: IntersectionObserver | null = null
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io?.unobserve(e.target))),
        { threshold: 0.2 }
      )
      cards.forEach((c) => io?.observe(c))
    } else cards.forEach((c) => c.classList.add("in"))
    // A link elsewhere on the page can ask for a particular card.
    const jump = () => {
      const m = /^#work-(\d)$/.exec(location.hash)
      if (!m) return
      const c = cards[Number(m[1]) - 1]
      if (c) t.scrollTo({ left: c.offsetLeft - t.offsetLeft, behavior: "smooth" })
    }
    window.addEventListener("hashchange", jump)
    jump()
    const p = prev.current, n = next.current
    const onP = () => t.scrollBy({ left: -step(), behavior: "smooth" })
    const onN = () => t.scrollBy({ left: step(), behavior: "smooth" })
    p?.addEventListener("click", onP)
    n?.addEventListener("click", onN)
    return () => {
      t.removeEventListener("scroll", upd)
      window.removeEventListener("hashchange", jump)
      p?.removeEventListener("click", onP)
      n?.removeEventListener("click", onN)
      io?.disconnect()
    }
  }, [])

  return (
    <section className="work" id="work">
      <div className="wrap">
        <div className="whead">
          <h2>The school, without the chasing.</h2>
          <p>
            One record handles the term by itself: fees matched as they land, parents answered on
            WhatsApp, the books posted, the director briefed on Monday.{" "}
            <b>You run the school. It keeps the score.</b>
          </p>
        </div>
        <div className="wnav">
          <button ref={prev} aria-label="Previous">
            &#8249;
          </button>
          <button ref={next} aria-label="Next">
            &#8250;
          </button>
        </div>
        <div className="wtrack" ref={track}>
          {/* 1 · collection */}
          <div className="wcard" id="work-1">
            <div className="stage">
              <div className="pair">
                <div className="paper a">
                  <div className="hd">
                    <b>
                      Without Tutagora<small>Term 2 · week 6</small>
                    </b>
                    <span className="big num">58%</span>
                  </div>
                  <div className="row"><Av /><span className="n">Mwangi, K.<small>Grade 4 · called twice</small></span><span className="s num">24,500</span></div>
                  <div className="row"><Av tone="b" /><span className="n">Achieng, O.<small>Grade 7 · no answer</small></span><span className="s num">18,000</span></div>
                  <div className="row"><Av tone="c" /><span className="n">Wanjiru, N.<small>Grade 6 · promised Friday</small></span><span className="s num">10,200</span></div>
                  <div className="row"><Av tone="d" /><span className="n">Otieno, J.<small>Grade 2 · not reached</small></span><span className="s num">31,000</span></div>
                  <div className="row"><Av tone="e" /><span className="n">Kamau, M.<small>Grade 5 · not reached</small></span><span className="s num">12,750</span></div>
                </div>
                <div className="paper b">
                  <div className="hd">
                    <b>
                      With Tutagora<small>Term 2 · week 6</small>
                    </b>
                    <span className="big on num">79%</span>
                  </div>
                  <div className="row"><Av /><span className="n">Mwangi, K.<small>Reminder 08:14 · own balance</small></span><span className="s ok">Paid, M-Pesa</span></div>
                  <div className="row"><Av tone="b" /><span className="n">Achieng, O.<small>On a payment plan</small></span><span className="s">Plan</span></div>
                  <div className="row"><Av tone="c" /><span className="n">Wanjiru, N.<small>Reminder 08:14</small></span><span className="s ok">Paid, M-Pesa</span></div>
                  <div className="row"><Av tone="d" /><span className="n">Otieno, J.<small>Reminder 08:14</small></span><span className="s ok">Paid, card</span></div>
                </div>
              </div>
            </div>
            <div className="wcap">
              <div className="k">Collection</div>
              <div className="t">Collected by week six, not by term end.</div>
              <p>Every family gets a reminder with its own balance and a Pay button. The bursar approves the batch on Friday morning and stops making calls.</p>
            </div>
          </div>

          {/* 2 · the learner */}
          <div className="wcard" id="work-2">
            <div className="stage">
              <div className="rc">
                <div className="paper">
                  <h4>Amani Wanjiru</h4>
                  <div className="sub">Grade 6 East · Term 2 report</div>
                  <table>
                    <tbody>
                      <tr><td>English</td><td className="b"><span className="bar"><i style={{ width: "82%" }} /></span></td><td className="num">82</td></tr>
                      <tr><td>Kiswahili</td><td className="b"><span className="bar"><i style={{ width: "74%" }} /></span></td><td className="num">74</td></tr>
                      <tr><td>Mathematics</td><td className="b"><span className="bar"><i style={{ width: "68%" }} /></span></td><td className="num">68</td></tr>
                      <tr><td>Science</td><td className="b"><span className="bar"><i style={{ width: "79%" }} /></span></td><td className="num">79</td></tr>
                      <tr><td>Social studies</td><td className="b"><span className="bar"><i style={{ width: "88%" }} /></span></td><td className="num">88</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="pill q1"><i /> Fee balance KES 0 <Av tone="c" /></div>
                <div className="pill q2"><i className="blue" /> Bus route 4 · Kileleshwa</div>
                <div className="pill q3"><i className="red" /> Inhaler at the office</div>
              </div>
            </div>
            <div className="wcap">
              <div className="k">The learner</div>
              <div className="t">Every child, known completely.</div>
              <p>One file: marks, fees, the bus, the clinic, the guardian on WhatsApp. Ask about any learner and get the whole answer, including what the family owes.</p>
            </div>
          </div>

          {/* 3 · the teacher */}
          <div className="wcard" id="work-3">
            <div className="stage">
              <div className="rc">
                <div className="paper gb">
                  <h4>Grade 6 East · Mathematics</h4>
                  <div className="sub">CAT 2 · marks entered Tuesday 16:10</div>
                  <table>
                    <tbody>
                      <tr><td><Av tone="c" /> Amani W.</td><td className="num">68</td><td className="g">B</td></tr>
                      <tr><td><Av /> Brian M.</td><td className="num">74</td><td className="g">B+</td></tr>
                      <tr><td><Av tone="d" /> Faith O.</td><td className="num">91</td><td className="g">A</td></tr>
                      <tr><td><Av tone="e" /> Kevin K.</td><td className="num">55</td><td className="g">C+</td></tr>
                      <tr><td><Av tone="b" /> Neema A.</td><td className="num">83</td><td className="g">A-</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="pill q1"><i /> Gradebook updated</div>
                <div className="pill q2"><i /> 32 report cards ready</div>
                <div className="pill q3"><i className="blue" /> Sent to parents 18:04</div>
              </div>
            </div>
            <div className="wcap">
              <div className="k">The teacher</div>
              <div className="t">Marks entered once. Everything after is already true.</div>
              <p>The gradebook, each learner&rsquo;s progress and the report card in the parent&rsquo;s WhatsApp follow from one entry. No re-typing, no weekend of transcription.</p>
            </div>
          </div>

          {/* 4 · the staff */}
          <div className="wcard" id="work-4">
            <div className="stage">
              <div className="today">
                <div className="paper">
                  <div className="hd"><b>Needs you today</b><span className="meta num">12 items · 4 places</span></div>
                  <div className="row"><span className="n">Contracts ending this term<small>Two teachers, one driver</small></span><span className="badge warn num">3</span></div>
                  <div className="row"><span className="n">Probation reviews due<small>Heads to confirm</small></span><span className="badge num">2</span></div>
                  <div className="row"><span className="n">Leave awaiting HR<small>Heads have recommended</small></span><span className="badge num">3</span></div>
                  <div className="row"><span className="n">Letters without receipt<small>Warnings not yet acknowledged</small></span><span className="badge warn num">2</span></div>
                  <div className="row"><span className="n">Payroll<small>Runs on the 28th from the record</small></span><span className="badge ok">Ready</span></div>
                </div>
              </div>
            </div>
            <div className="wcap">
              <div className="k">The staff</div>
              <div className="t">Nothing lapses unnoticed.</div>
              <p>Every employee, teaching and support, on one record: contracts, probation, leave, attendance, payroll. What is due surfaces itself, before it becomes a dispute.</p>
            </div>
          </div>

          {/* 5 · the director */}
          <div className="wcard" id="work-5">
            <div className="stage">
              <div className="wph">
                <div className="top"><span className="t">T</span><span>Tutagora</span><span className="when num">Mon 07:00</span></div>
                <div className="chat">
                  <div className="bub">
                    <p>Good morning. Riverside this week.</p>
                    <p className="num">Fees: 71% of Term 2 collected. 38 families outstanding, 9 with no payment yet.</p>
                    <p className="num">Runway at this rate: 4.7 months. Grade 7 below cost for a second term.</p>
                    <p className="num">Attendance 94%. Two teachers above load in Languages.</p>
                    <time className="num">07:00</time>
                  </div>
                  <div className="btn">Show me Grade 7</div>
                </div>
              </div>
            </div>
            <div className="wcap">
              <div className="k">The director</div>
              <div className="t">Monday, before the first bell.</div>
              <p>The week&rsquo;s position, computed from the record and written in plain language. Ask a question and it answers from the same figures, not from a spreadsheet built for the meeting.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
