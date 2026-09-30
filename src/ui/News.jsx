/* WHAT'S NEW. Four systems arrived at once and the game said so nowhere a
   returning player would look - the only record was a tip that fired when one
   happened to you. Newest first; add an entry at the TOP and give it a new id,
   and the menu's dot comes back for everybody who has not read it.

   "Seen" is a per-device convenience, so it lives in localStorage and not in
   the save: it must never be a reason to migrate a collection, and it is
   wrapped because storage can throw (private windows, blocked site data).

   SHORT AND SCANNABLE (2026-09-30, reported as long and boring to read): an
   entry is one emoji and a title, its items a line each - the headline, not
   the design notes. The two newest open; the rest are a row each, opened by
   a tap. */
import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";

export const NEWS = [
  {
    id: "2026-10-15",
    icon: "⚡",
    date: "October 2026",
    title: "Smoother walking",
    items: [
      ["No more stutter", "Walking on every map is smooth again - the map is drawn once, not every step."],
      ["Loads sooner", "The map's art starts downloading with the game, so it appears faster."],
      ["Clean evolutions", "Glitched Pokémon evolve smoothly again."],
    ],
  },
  {
    id: "2026-10-14",
    icon: "🧠",
    date: "October 2026",
    title: "Smarter team suggestions",
    items: [
      ["Pick a style", "Balanced, All-out attack, Wall of defense - or a team that counters theirs."],
      ["Famous lineups", "Ash's team from any series, Gary, Red or any Champion, built from your Box."],
    ],
  },
  {
    id: "2026-10-13b",
    icon: "💪",
    date: "October 2026",
    title: "Train for ranked",
    items: [
      ["Lv 100 only", "Ranked teams take Lv 100 Pokémon - raising them is part of the climb."],
      ["Train tab", "Buy Rare Candy, level up and teach moves, all on the League page."],
      ["Next battle", "Win in a gym and the next trainer is one tap away."],
      ["Your profile", "Tap your name up top for your trainer card and Pokédex rank."],
      ["Item rings", "Honey, Repels and the White Flute count down as rings."],
    ],
  },
  {
    id: "2026-10-13",
    icon: "🏜️",
    date: "October 2026",
    title: "The Mirage Desert",
    items: [
      ["A new map", "Hoenn's Route 111 opens at Lv 20: sandstorm, Mirage Tower and the Desert Ruins."],
      ["Who lives there", "Sandshrew, Trapinch, Baltoy, Cacnea, Lileep, Anorith and desert Ground types."],
      ["Arceus in every type", "Each of its forms lives on the maps sharing its type."],
      ["Stronger White Flute", "Rarer Pokémon and legendaries about twice as often, for ¥1,800."],
      ["Easier legendaries", "Psychic legendaries live in the Mansion too; none rarer than 1 in 3,333."],
    ],
  },
  {
    id: "2026-10-12",
    icon: "🔥",
    date: "October 2026",
    title: "Hard mode",
    items: [
      ["Lv 100 rematches", "Clear a region to face its leaders, Elite Four and Champion again - brutal."],
      ["Worth it", "A Shiny signature Pokémon per first win, plus a Master Ball and Region Charm per region."],
      ["Entry fees", "Each try costs a fee, handed back when you win."],
      ["League shop", "Hyper and Max Potions, Full Restores, Max Revives and X items."],
      ["Move Tutor", "Teach any move its evolution line learns by its level."],
      ["Kanto's moves", "Kanto Pokémon know their modern moves now."],
    ],
  },
  {
    id: "2026-10-11",
    icon: "🏟️",
    date: "October 2026",
    title: "Walk the gym",
    items: [
      ["Trainers first", "Beat a gym's trainers in order before its leader will battle you."],
      ["A gym is a path", "Tap any step of the path to see that trainer's team."],
      ["Go, Poké Ball!", "Every send-out is thrown in a ball, and balls show who's still standing."],
      ["Cleaner results", "The victory screen is one tidy line."],
    ],
  },
  {
    id: "2026-10-10",
    icon: "✨",
    date: "October 2026",
    title: "Every move, animated",
    items: [
      ["Real animations", "760 moves play their own Game Boy Advance animation."],
      ["The hit lands", "The health bar drops when the attack connects."],
      ["Your pace", "Tap to skip, or switch animations to Quick or Off."],
    ],
  },
  {
    id: "2026-10-09",
    icon: "🏅",
    date: "October 2026",
    title: "Smoother, lighter, sharper",
    items: [
      ["Rank badges", "Every battle and Pokédex rank has its own badge."],
      ["Runs cooler", "Standing still, a phone does a fifth of the work it did."],
      ["Loads faster", "Fonts ship with the game, and it works offline."],
      ["Names", "Iron Bundle, Ho-Oh, Type: Null and more are spelled right."],
    ],
  },
  {
    id: "2026-10-08",
    icon: "🏆",
    date: "October 2026",
    title: "The ranked ladder",
    items: [
      ["Ranks", "Climb from Challenger to Sovereign; your first 5 battles place you."],
      ["Pokédex ranks", "From Field Intern to Pokédex Master, on your Dex tab and card."],
      ["Rank up!", "A new rank plays its own ceremony."],
      ["Monthly seasons", "Ratings soften each month; your best rank stays as a badge."],
      ["Always a battle", "No trainer near your rating? You'll meet an Elite Four member."],
      ["Standings", "The top 100, your friends and your defense log."],
      ["Water for all", "Surfing and fishing meet every generation now."],
    ],
  },
  {
    id: "2026-10-07",
    icon: "⚔️",
    date: "October 2026",
    title: "Ranked battles, preview",
    items: [
      ["Find a battle", "Battle another trainer's defense team, blind."],
      ["Fair play", "The server referees every turn; 60 seconds a turn."],
      ["Resume", "Close the page mid-battle and pick it up later."],
    ],
  },
  {
    id: "2026-10-06",
    icon: "🛡️",
    date: "October 2026",
    title: "Defense teams and badges",
    items: [
      ["Defense teams", "Set up to three teams for challengers to meet."],
      ["Practice", "Battle a friend's defense team - nothing is saved."],
      ["Badges on your card", "Your trainer card shows your League badges."],
    ],
  },
  {
    id: "2026-10-05",
    icon: "🏆",
    date: "October 2026",
    title: "The Pokémon League",
    items: [
      ["Battles are here", "Every region's gyms, Elite Four and Champion, from the menu."],
      ["Level caps", "Each battle has a highest level; raise your team with Rare Candy."],
      ["Prizes", "First wins pay a prize and a badge; rematches pay as you walk."],
      ["Nothing to lose", "Losing costs nothing - try again any time."],
    ],
  },
  {
    id: "2026-10-04",
    icon: "🌊",
    date: "October 2026",
    title: "Seaside Road",
    items: [
      ["A new map", "Route 110, with the Cycling Road raised over the sea."],
      ["Wider view", "Wide screens show more of the world."],
      ["Doors wait", "Doors take you through only when you walk into them."],
    ],
  },
  {
    id: "2026-10-03",
    icon: "🌟",
    date: "October 2026",
    title: "Four new rare forms",
    items: [
      ["Gold, Shadow, Chaotic, Projection", "Four new looks - Gold is the rarest in the game."],
      ["Same odds overall", "About one Pokémon in 18 still wears a rare form."],
    ],
  },
  {
    id: "2026-10-02",
    icon: "🤝",
    date: "October 2026",
    title: "Trading, bigger",
    items: [
      ["Explore a friend", "Browse their Pokédex and ask for any spare."],
      ["Several for one", "Trade up to six a side, and counter offers."],
      ["Find anything", "Search any species to see who has a spare."],
    ],
  },
  {
    id: "2026-10-01",
    icon: "📄",
    date: "October 2026",
    title: "Trade Center page",
    items: [
      ["Its own page", "One scroll, and your phone's Back returns to the game."],
      ["Solid ground", "Raised ground in Frost Hollow and the Safari Zone is reached by its steps."],
    ],
  },
  {
    id: "2026-09-30",
    icon: "🔄",
    date: "September 2026",
    title: "Trading",
    items: [
      ["Trade Center", "Find trainers, add friends and show off six Pokémon."],
      ["Offers, Board and Surprise", "Trade by offer, by listing, or blind with a friend."],
      ["Fair play", "You always keep the last of each species."],
    ],
  },
  {
    id: "2026-09-29",
    icon: "🌙",
    date: "September 2026",
    title: "Night mode",
    items: [
      ["Night mode", "Auto, on or off, from the menu."],
    ],
  },
  {
    id: "2026-09-28",
    icon: "💥",
    date: "September 2026",
    title: "Alphas, rifts and a closer look",
    items: [
      ["Alphas arrive loudly", "A shockwave when one appears."],
      ["Preview", "Tap a Pokémon in the Box for its art and stats."],
    ],
  },
  {
    id: "2026-09-27",
    icon: "⭐",
    date: "September 2026",
    title: "Research stars",
    items: [
      ["Finish research", "Complete every task, then star a species for rarer finds."],
      ["Ember Caldera", "Rebuilt as Hoenn's Magma Hideout, lava and all."],
    ],
  },
  {
    id: "2026-09-26",
    icon: "🌧️",
    date: "September 2026",
    title: "Monsoon Trail",
    items: [
      ["A new map", "Hoenn's Route 119: waterfalls, bridges and Feebas."],
      ["Acro Bike", "Ride the white rails from Lv 10."],
    ],
  },
  {
    id: "2026-09-25",
    icon: "🌍",
    date: "September 2026",
    title: "The world wakes up",
    items: [
      ["Mass outbreaks", "One map a day, overrun by one species."],
      ["Rifts", "Stay on a map long enough and it tears open."],
      ["Alphas", "Rare, huge and worth Rare Candy."],
      ["Events page", "Everything happening today, in one place."],
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
  const [open, setOpen] = useState(() => new Set(NEWS.slice(0, 2).map((n) => n.id)));
  const toggle = (id) => setOpen((o) => { const next = new Set(o); if (next.has(id)) next.delete(id); else next.add(id); return next; });
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
          {NEWS.map((n) => {
            const on = open.has(n.id);
            return (
              <section key={n.id} className={`nw-entry${on ? " open" : ""}`}>
                <button type="button" className="nw-head" aria-expanded={on} onClick={() => toggle(n.id)}>
                  <span className="nw-icon" aria-hidden="true">{n.icon}</span>
                  <span className="nw-title"><b>{n.title}</b><i>{n.date}</i></span>
                  <span className="nw-chev" aria-hidden="true">{on ? "▴" : "▾"}</span>
                </button>
                {on && (
                  <ul className="nw-items">
                    {n.items.map(([head, text]) => <li key={head}><b>{head}</b> {text}</li>)}
                  </ul>
                )}
              </section>
            );
          })}
          <button type="button" className="ev-go" onClick={onEvents}>See today&rsquo;s events</button>
        </div>
      </div>
    </div>
  );
}
