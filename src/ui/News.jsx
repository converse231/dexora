/* WHAT'S NEW. Four systems arrived at once and the game said so nowhere a
   returning player would look - the only record was a tip that fired when one
   happened to you. Newest first; add an entry at the TOP and give it a new id,
   and the menu's dot comes back for everybody who has not read it.

   "Seen" is a per-device convenience, so it lives in localStorage and not in
   the save: it must never be a reason to migrate a collection, and it is
   wrapped because storage can throw (private windows, blocked site data). */
import { useEffect } from "react";
import { useModalLock, useDismiss } from "./modal.js";

export const NEWS = [
  {
    id: "2026-09-25",
    date: "September 2026",
    title: "The world wakes up",
    items: [
      ["Mass outbreaks", "Once a day one map is overrun by one species. Rare forms of it turn up far more often while it lasts."],
      ["Discovery", "Every species now has a research level. Catch it in different ways to raise it; a finished entry makes its rare forms likelier for good."],
      ["Alphas", "Rarely, a Pokémon is an alpha - huge, stubborn, and worth Rare Candy. It never runs."],
      ["Space-time rifts", "Stay on one map long enough and it tears open: rarer Pokémon, and things lying on the ground."],
      ["Events page", "Everything happening today, in one place - open it from the menu or tap an event card."],
      ["Costume Pikachu", "They live in the Power Plant now, not everywhere."],
      ["Easier to read", "New lettering, bigger buttons on phones, and banners wait until you have finished with a Pokémon."],
    ],
  },
];
export const NEWS_ID = NEWS[0].id;
const KEY = "dexora-news-seen";

export const newsUnread = () => {
  try { return localStorage.getItem(KEY) !== NEWS_ID; } catch { return false; }
};
const markRead = () => {
  try { localStorage.setItem(KEY, NEWS_ID); } catch { /* nothing to remember with */ }
};

export default function News({ onClose, onEvents }) {
  useModalLock();
  useEffect(() => {
    markRead();
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div
        className="helpcard"
        role="dialog"
        aria-modal="true"
        aria-label="What's new"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="set-top">
          <h3>What&rsquo;s new</h3>
          <span className="set-mail">Updates to the game</span>
          <button className="set-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="hp-body">
          {NEWS.map((n) => (
            <section key={n.id} className="nw-entry">
              <h4>{n.date}</h4>
              <h5>{n.title}</h5>
              <ul className="vr-notes">
                {n.items.map(([head, text]) => (
                  <li key={head}><b>{head}.</b> {text}</li>
                ))}
              </ul>
            </section>
          ))}
          <button type="button" className="ev-go" onClick={onEvents}>See today&rsquo;s events</button>
        </div>
      </div>
    </div>
  );
}
