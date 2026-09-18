"use client"

// Ask the school. The record, shown as the thing it is for: a director asks,
// and the board draws only the records the answer walks through.

import { useEffect, useMemo, useRef } from "react"
import { Board } from "./board"
import { ASK, ASK_GHOST } from "./sketches"
import { mountAsk } from "./ask-logic.js"

export function Ask() {
  const ref = useRef<HTMLDivElement>(null)
  const ghost = useMemo(() => ({ __html: ASK_GHOST }), [])
  const layers = useMemo(() => ASK.map((x) => ({ __html: x.svg })), [])
  useEffect(() => mountAsk(ref.current), [])
  return (
    <div className="ask" ref={ref}>
      <div className="ask-board">
        <Board />
        <div className="ask-slate">
          <p className="ask-question" aria-live="polite" />
          <div className="ask-fig" aria-hidden="true">
            <div className="ask-ghost" dangerouslySetInnerHTML={ghost} />
            {ASK.map((x, i) => (
              <div className="ask-layer" key={i} data-a={x.a} dangerouslySetInnerHTML={layers[i]} />
            ))}
          </div>
          <p className="ask-answer" aria-live="polite" />
        </div>
      </div>
      <div className="ask-q">
        <span className="ask-k">Ask it</span>
        <ol>
          {ASK.map((x, i) => (
            <li key={i}>
              <button type="button" data-q={x.q} aria-pressed={i === 0}>
                {x.q}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
