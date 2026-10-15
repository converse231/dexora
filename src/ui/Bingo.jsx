/* WEEKLY BINGO on the Events board (bingo.js): this week's 5x5 card, each
   square its goal and progress, done squares stamped. A tap names a square
   in full under the card - a 60px square on a phone has room for two short
   lines, not a sentence. Finished lines are CLAIMED here, together.

   IT IS A BINGO CARD (2026-10-15, asked for): printed paper, B-I-N-G-O
   balls over the columns, the week's card number at its foot, a dauber's
   ink on every finished square (each at its own tilt, as a hand lands it),
   and a marker stroke through every finished line. */
import { useState } from "react";
import Icon from "./Icon.jsx";
import {
  FREE, LINES, BINGO_LINE, BINGO_FULL, doneAt, dueLines, fullDue, shortOf, sayOf,
} from "../game/bingo.js";
import { itemById } from "../game/items.js";

// 3,000 steps fits a square as 3k.
const fmt = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const says = (r) => [r.candy && `${r.candy} Rare Candy`,
  ...Object.entries(r.items ?? {}).map(([id, n]) => `${n} ${itemById(id)?.name ?? id}${n > 1 ? "s" : ""}`),
  r.packs && `${r.packs === 1 ? "a card pack" : `${r.packs} card packs`}`].filter(Boolean).join(" + ");

const BALLS = ["B", "I", "N", "G", "O"];
// A dauber never lands the same way twice: a square's tilt and offset come from its index.
const daub = (i) => ({ "--r": `${((i * 47) % 50) - 25}deg`, "--dx": `${((i * 13) % 9) - 4}%`, "--dy": `${((i * 29) % 9) - 4}%` });
// A finished line's stroke, from square centre to square centre, in a 5x5 box.
const strokeOf = (line) => {
  const at = (i) => [(i % 5) + 0.5, Math.floor(i / 5) + 0.5];
  const [a, b] = [at(line[0]), at(line[line.length - 1])];
  const dx = Math.sign(b[0] - a[0]) * 0.3, dy = Math.sign(b[1] - a[1]) * 0.3;
  return { x1: a[0] - dx, y1: a[1] - dy, x2: b[0] + dx, y2: b[1] + dy };
};

// Days until Monday's new card.
function daysLeft() {
  const d = new Date();
  const left = 7 - ((d.getDay() + 6) % 7);
  return left === 1 ? "tomorrow" : `in ${left} days`;
}

export default function Bingo({ card, onClaim }) {
  const [sel, setSel] = useState(null);
  const [got, setGot] = useState(null);
  if (!card) return null;
  const due = dueLines(card).length;
  const full = fullDue(card);
  const lines = LINES.filter((l) => l.every((i) => doneAt(card, i))).length;
  const pick = sel ?? card.cells.findIndex((c, i) => c && !doneAt(card, i));
  const cell = card.cells[pick];

  return (
    <section className={`ev-card ev-bingo${due || full ? " live" : ""}`}>
      <header className="ev-banner">
        <Icon n="board" size={22} />
        <h4>Weekly Bingo</h4>
        <span className={`ev-stamp${due || full ? " live" : ""}`}>{due || full ? "PRIZE!" : `${lines} / ${LINES.length} LINES`}</span>
      </header>
      <div className="bg-card">
        <div className="bg-head" aria-hidden="true">
          {BALLS.map((l, k) => <span key={l} className={`bg-ball b${k}`}>{l}</span>)}
        </div>
        <div className="bg-grid" role="group" aria-label="This week's bingo card">
          {card.cells.map((c, i) => {
            const done = doneAt(card, i);
            if (i === FREE) {
              return <span key={i} className="bg-sq free done" style={daub(i)} aria-label="Free square"><b>FREE</b><em className="bg-daub" /></span>;
            }
            return (
              <button key={i} type="button" className={`bg-sq${done ? " done" : ""}${i === pick ? " sel" : ""}`}
                aria-pressed={i === pick} aria-label={`${sayOf(c)}: ${done ? "done" : `${card.n[i]} of ${c[1]}`}`}
                onClick={() => setSel(i)} style={{ ...daub(i), "--p": Math.min(1, card.n[i] / c[1]) }}>
                <span>{shortOf(c)}</span>
                {done ? <em className="bg-daub" aria-hidden="true" /> : <i>{fmt(card.n[i])}/{fmt(c[1])}</i>}
              </button>
            );
          })}
          <svg className="bg-lines" viewBox="0 0 5 5" preserveAspectRatio="none" aria-hidden="true">
            {LINES.map((l, k) => l.every((i) => doneAt(card, i)) && <line key={k} {...strokeOf(l)} pathLength="1" />)}
          </svg>
        </div>
        <div className="bg-foot" aria-hidden="true"><span>Card No. {card.week.slice(2)}</span><span>Free centre</span></div>
      </div>
      {cell && (
        <p className="bg-say">
          <b>{sayOf(cell)}</b>
          <span>{doneAt(card, pick) ? "Done" : `${card.n[pick].toLocaleString()} of ${cell[1].toLocaleString()}`}</span>
        </p>
      )}
      {(due > 0 || full) && (
        <button type="button" className="ev-go" onClick={() => setGot(onClaim())}>
          Claim {due ? `${due} line${due > 1 ? "s" : ""}` : ""}{due && full ? " and " : ""}{full ? "the full card" : ""}
        </button>
      )}
      {got && <p className="bg-got" role="status">Claimed: {says(got)}</p>}
      <div className="ev-meta">
        <span>Line: {says(BINGO_LINE)}</span>
        <span>Full card: {says(BINGO_FULL)}</span>
      </div>
      <div className="ev-meta"><span>{card.full ? "Card complete" : `${lines} line${lines === 1 ? "" : "s"} so far`}</span><span>New card {daysLeft()}</span></div>
    </section>
  );
}
