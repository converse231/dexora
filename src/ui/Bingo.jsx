/* WEEKLY BINGO on the Events board (bingo.js): this week's 5x5 card, each
   square its goal and progress, done squares stamped. A tap names a square
   in full under the card - a 60px square on a phone has room for two short
   lines, not a sentence. Finished lines are CLAIMED here, together.

   A POKEMON BINGO CARD in the app's own glass (2026-10-15, asked for): a
   ball sprite over each B-I-N-G-O column, a finished square CAUGHT - tinted
   and stamped with a Poke Ball, its words still readable - and a finished
   line lit gold. A paper card with ink daubs and marker strokes was tried
   the same day: at eight lines the strokes buried every word. */
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

// The columns are balls, rarest last; a caught square wears a Poke Ball.
const BALLS = [["B", "poke-ball"], ["I", "great-ball"], ["N", "ultra-ball"], ["G", "net-ball"], ["O", "master-ball"]];

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
  const won = new Set(LINES.filter((l) => l.every((i) => doneAt(card, i))).flat());

  return (
    <section className={`ev-card ev-bingo${due || full ? " live" : ""}`}>
      <header className="ev-banner">
        <Icon n="board" size={22} />
        <h4>Weekly Bingo</h4>
        <span className={`ev-stamp${due || full ? " live" : ""}`}>{due || full ? "PRIZE!" : `${lines} / ${LINES.length} LINES`}</span>
      </header>
      <div className="bg-card">
        <div className="bg-head" aria-hidden="true">
          {BALLS.map(([l, ball]) => <span key={l} className="bg-ball"><img src={`items/${ball}.png`} alt="" />{l}</span>)}
        </div>
        <div className="bg-grid" role="group" aria-label="This week's bingo card">
          {card.cells.map((c, i) => {
            const done = doneAt(card, i);
            if (i === FREE) {
              return <span key={i} className={`bg-sq free done${won.has(i) ? " won" : ""}`} aria-label="Free square"><img src="items/poke-ball.png" alt="" /><b>FREE</b></span>;
            }
            return (
              <button key={i} type="button" className={`bg-sq${done ? " done" : ""}${won.has(i) ? " won" : ""}${i === pick ? " sel" : ""}`}
                aria-pressed={i === pick} aria-label={`${sayOf(c)}: ${done ? "done" : `${card.n[i]} of ${c[1]}`}`}
                onClick={() => setSel(i)} style={{ "--p": Math.min(1, card.n[i] / c[1]) }}>
                <span>{shortOf(c)}</span>
                {done ? <img className="bg-caught" src="items/poke-ball.png" alt="" /> : <i>{fmt(card.n[i])}/{fmt(c[1])}</i>}
              </button>
            );
          })}
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
