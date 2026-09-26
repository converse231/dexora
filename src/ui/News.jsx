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
    id: "2026-09-30",
    date: "September 2026",
    title: "Trading",
    items: [
      ["The Trade Center", "Sign in and open the Trade Center from the menu: find trainers, add friends, and show off six Pokémon on your card."],
      ["Offers", "Put Pokémon up for trade on your card, and ask for anything on someone else's. Nothing moves until both sides agree."],
      ["Surprise Trade and the Board", "Swap one for one with a friend without knowing what comes back, or list \"this for that\" on the Trade Board. A Pokédex entry's On the Board button searches it."],
      ["Fair play", "You always keep the last of each species. A traded Pokémon fills your Pokédex; medals and rare-form marks stay for the ones you caught. Block or report anyone from their profile."],
    ],
  },
  {
    id: "2026-09-29",
    date: "September 2026",
    title: "Night mode",
    items: [
      ["Night mode", "Open the menu and choose Night mode: Auto follows your device, or switch it on or off. The map and the battles stay as drawn; everything around them goes dark."],
      ["Loading", "The loading screen now shows a Poké Ball wobbling while your Pokédex arrives."],
    ],
  },
  {
    id: "2026-09-28",
    date: "September 2026",
    title: "Alphas, rifts and a closer look",
    items: [
      ["Alphas arrive loudly", "An alpha now shows itself with a shockwave when it appears, and running from one asks first."],
      ["Legendary research", "A legendary's research is catching one, feeding it a berry, landing the first ball and raising one to Lv 100. Its star spends a spare - never the last one."],
      ["Rifts ask first", "Leaving a map with a rift open asks before it closes behind you."],
      ["Preview", "Tap a Pokémon's picture in the Box to see its art and base stats."],
    ],
  },
  {
    id: "2026-09-27",
    date: "September 2026",
    title: "Research stars",
    items: [
      ["Every task counts", "Research now finishes only when every task is done - ten ordinary catches, night, a tiny or huge one, first ball, a rare form, a berry and an evolution where there is one. An alpha is a bonus."],
      ["Raising counts", "Evolving into a species counts towards its research, and a legendary's research is simply catching one."],
      ["Get a star", "Finished research can be starred from the Dex: give up ten ordinary ones and that species' rare forms turn up 1.5x as often for good."],
      ["Rarer alphas", "Alphas now turn up about one Pokémon in 250."],
      ["Ember Caldera, rebuilt", "Ember Caldera is now Hoenn's Magma Hideout, all eight rooms tile for tile - real rock edges, real ladders, and a lava pool you can surf."],
    ],
  },
  {
    id: "2026-09-26",
    date: "September 2026",
    title: "Monsoon Trail",
    items: [
      ["A new map", "Monsoon Trail - Hoenn's Route 119, tile for tile - replaces Deep Woods: two waterfalls, log bridges you can walk over or surf under, and a river full of Feebas."],
      ["The first door", "The Weather Institute on Monsoon Trail opens onto the Pokémon Mansion, and the Mansion's front door leads back out."],
      ["The Acro Bike", "At Lv 10 you get the Acro Bike. Step onto the white rails and you ride them - on Monsoon Trail and in the Safari Zone."],
      ["Grass that moves", "Tall grass rustles as you walk into it and hides your feet."],
    ],
  },
  {
    id: "2026-09-25",
    date: "September 2026",
    title: "The world wakes up",
    items: [
      ["Mass outbreaks", "Once a day one map is overrun by one species. Rare forms of it turn up far more often while it lasts."],
      ["Discovery", "Every species now has a research level. Catch it in different ways to raise it; a finished entry makes its rare forms likelier for good."],
      ["Alphas", "Rarely, a Pokémon is an alpha - huge, stubborn, and worth Rare Candy. It never runs, and it can be a rare form too: an Alpha Shiny is rarer than either."],
      ["Regional evolutions", "Alolan, Galarian, Hisuian and Paldean forms evolve now - Hisuian Growlithe into Hisuian Arcanine, and Quilava can choose Hisuian Typhlosion."],
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
