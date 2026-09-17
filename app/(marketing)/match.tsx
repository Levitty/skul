"use client"

// One payment, and everything it moves. An M-Pesa message arrives, and one
// minute later four places in the school have changed without anyone typing.
// Plays once when it scrolls into view.

import { useEffect, useRef } from "react"

export function Match() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!("IntersectionObserver" in window)) {
      el.classList.add("go")
      return
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          el.classList.add("go")
          io.disconnect()
        }
      },
      { threshold: 0.35 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div className="match" ref={ref} role="img" aria-label="An M-Pesa payment at 07:42 settles the invoice, posts to the books, moves the director's collection figure and sends the parent a receipt on WhatsApp by 07:43.">
      <div className="slip sms">
        <span className="from">MPESA</span>
        <p className="num">
          RJ7K2M8QX1 Confirmed. Ksh10,200.00 sent to RIVERSIDE ACADEMY for account STU-0416 on
          17/9/26 at 7:42 AM. New M-PESA balance is Ksh3,410.00.
        </p>
        <time className="num">07:42</time>
      </div>
      <div className="wire" aria-hidden="true" />
      <ol className="lands">
        <li>
          <span className="k">Invoice</span>
          <span className="w">Amani W. · Term 3</span>
          <span className="v num">
            <s>KES 10,200</s> KES 0
          </span>
        </li>
        <li>
          <span className="k">The books</span>
          <span className="w">Fees income, posted</span>
          <span className="v num">+10,200</span>
        </li>
        <li>
          <span className="k">The director</span>
          <span className="w">Term 3 collected</span>
          <span className="v num">
            <s>71%</s> 72%
          </span>
        </li>
        <li>
          <span className="k">The parent</span>
          <span className="w">WhatsApp</span>
          <span className="v">Received. Balance KES 0. Thank you.</span>
        </li>
      </ol>
      <time className="stamp num">07:43</time>
    </div>
  )
}
