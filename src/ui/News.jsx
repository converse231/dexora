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
    id: "2026-10-09",
    date: "October 2026",
    title: "Smoother, lighter, sharper",
    items: [
      ["Rank badges", "Every battle and Pokédex rank now has its own badge - on the Dex tab, your trainer card, the ladder and the rank-up ceremony. The Dex tab's badge is ringed with your way to the next rank."],
      ["Runs cooler", "Standing still, the game no longer redraws anything, and the Dex's animated forms rest while they're off screen - a phone does a fifth of the work it did."],
      ["Loads faster", "The game's fonts now come with it, so it starts sooner and looks the same offline, and the rank badges are a fiftieth of their old size."],
      ["Names", "Iron Bundle, Scream Tail, Ho-Oh, Type: Null, Mime Jr., the Tapus, the Treasures of Ruin and more are now spelled properly everywhere."],
    ],
  },
  {
    id: "2026-10-08",
    date: "October 2026",
    title: "The ranked ladder",
    items: [
      ["Ratings and ranks", "Ranked battles now count. Your first 5 battles each season place you; after that you climb from Challenger through Contender, Rival, Vanguard, Elite, Master and Champion, three divisions each, to Sovereign."],
      ["Pokédex ranks", "Catching has ranks too: from Field Intern through Researcher, Senior Researcher, Specialist, Professor, Expedition Leader and Grand Scholar to Pokédex Master, for the whole Pokédex. Yours is on the Dex tab and your trainer card."],
      ["Rank up!", "Reaching a new rank - in the Pokédex or on the ladder - now plays its own ceremony: your old medal evolves into the new one, and the whole ladder lights up to where you stand. Tap your rank on the Dex tab or the Ranked tab to watch yours again."],
      ["Monthly seasons", "Each month is a season. When a new one starts, your rating moves halfway back to the middle, and the highest rank you reached stays on your trainer card as a season badge."],
      ["Always someone to battle", "You're matched with trainers near your rating. When nobody is, you'll meet a League Elite Four member or Champion rated to match."],
      ["The top 100", "The Standings tab shows the season's top trainers, you and your friends, and past seasons. Your Defenses tab shows who battled your teams and how they did."],
      ["20 a day", "You can play 20 ranked battles a day. Walking away from a battle for ten minutes counts as a loss."],
      ["A cleaner League", "The League's cards and badge case are simpler: no coloured stripes, and a region's badges sit beside its name."],
      ["Defenders say so", "Selling, trading or evolving a Pokémon in one of your defense teams now tells you first, and sweeps leave it unticked."],
      ["Every generation in the water", "Surfing now meets each map's own water Pokémon, and every rod fishes up all nine generations as they arrive - the water was all Kanto before."],
      ["Research, lighter", "Catching ordinary ones needs 5, not 10, and a star costs 5. A legendary's first-ball task is now: win a League battle with it."],
      ["How many you hold", "A wild Pokémon you already own shows how many of that form you have, beside the Poké Ball."],
      ["The rift, on screen", "A ring in the corner fills as a rift builds on your map and drains while one is open."],
      ["Fixes", "Mt Moon's far ladder leads out to the Power Plant, Frost Hollow's holes drop you one way instead of bouncing you back, and Projection flickers instead of glitching."],
    ],
  },
  {
    id: "2026-10-07",
    date: "October 2026",
    title: "Ranked battles, preview",
    items: [
      ["Find a battle", "On the League's Ranked tab, battle another trainer's defense team with one of yours. You won't know which of their teams you'll meet until it's sent out."],
      ["Played on the server", "The server referees every turn, so nobody can bend a result. You get 60 seconds a turn - after that your turn is played for you - and ten minutes away from a battle counts as a loss."],
      ["Pick up where you left off", "Closing the page mid-battle is fine: open the Ranked tab again and resume."],
      ["Unrated for now", "Results aren't rated yet. Ratings, ranks and seasons come with the ladder."],
    ],
  },
  {
    id: "2026-10-06",
    date: "October 2026",
    title: "Defense teams and badges",
    items: [
      ["Defense teams", "The League has a new Ranked tab. Set up to three teams there: when ranked battles open, a challenger will meet one of them without knowing which, and the CPU will play it for you."],
      ["Ranked rules", "In ranked, every Pokémon is Lv 100 with the same IVs, and a team has one of each species - a Mega or a regional form counts as its species. So what you've caught is what matters, not how you raised it."],
      ["Practice with friends", "Battle one of a friend's defense teams from the Ranked tab. You won't know which until it's sent out, and nothing is saved."],
      ["Badges on your card", "Your trainer card now shows how many League badges you've won."],
    ],
  },
  {
    id: "2026-10-05",
    date: "October 2026",
    title: "The Pokémon League",
    items: [
      ["Battles are here", "Open the menu and choose Pokémon League. Every region from Kanto to Paldea has its Gym Leaders (Alola's Island Kahunas), their gym trainers, and its Elite Four and Champion, with the teams they used in their games."],
      ["In order", "A region's leaders open one at a time, in the games' order. Win all of a region's badges to face its Elite Four, one at a time, and then its Champion. Beat everyone in a region, gym trainers too, to open the next one."],
      ["A level cap", "Each battle has a highest level you may bring, and legendaries have a lower one. Battles never give EXP: raise your team with Rare Candy."],
      ["Prizes", "Your first win against anyone pays a prize, and a leader's first win gives you its badge. Rematches pay part of the prize, which refills as you walk, and each rematch win makes that opponent stronger."],
      ["Potions, Full Heals and Revives", "A new Battle shelf in the Shop. Open the Bag in a battle to heal, cure or revive a Pokémon in place of a move."],
      ["Nothing to lose", "Losing or giving up costs nothing. Your Pokémon are never used up, and a battle cut short by closing the page simply didn't happen."],
    ],
  },
  {
    id: "2026-10-04",
    date: "October 2026",
    title: "Seaside Road",
    items: [
      ["A new map", "Pond & Shore is now Seaside Road: Route 110 from Ruby and Sapphire, tile for tile, with the Seaside Cycling Road raised over the sea. Ride it through its two gatehouses, or surf underneath it."],
      ["The Cycling Road", "It's for bikes, as in the original: ride it with the Acro Bike. Walk under it through the grass, or surf under it from the sea."],
      ["A wider view", "On a wide screen the map now shows more of the world across, instead of leaving empty space at the sides."],
      ["Doors wait for you", "Doors, cave mouths and stairs only take you through when you walk into them, so you no longer get pulled inside just by walking past. Ladders still work the moment you step on."],
      ["Firmer water", "Rocks in the river on Monsoon Trail and the edges of its waterfalls are solid now, so you can't surf through them."],
    ],
  },
  {
    id: "2026-10-03",
    date: "October 2026",
    title: "Four new rare forms",
    items: [
      ["Gold", "Cast in gold, with a sheen and glints running over it. The rarest form in the game."],
      ["Shadow", "Sealed in darkness, with violet flame rising around it."],
      ["Chaotic", "Unstable energy: a red and black aura pulses out of it, and now and then it glitches into a black-and-yellow negative."],
      ["Projection", "A projection of light, standing in the beam of an emitter, scanlines and all."],
      ["Just as rare as before", "There are twelve forms now, and one Pokémon in about 18 still wears one. Each form got a little rarer to make room, so meeting any form is as common as it was. Every new form has its own honey in the shop."],
    ],
  },
  {
    id: "2026-10-02",
    date: "October 2026",
    title: "Trading, bigger",
    items: [
      ["Explore a friend", "Browse a friend's Pokédex against yours, see every spare they have, and ask for any of it - not just what they put up."],
      ["Several for one", "Offer up to six for up to six, list a bundle on the Board, and counter an offer instead of just declining. One Pokémon can be in several offers; the first accepted takes it."],
      ["Find anything", "Search any species - even ones you've never seen - and see which friends have a spare and who has one up for trade."],
      ["Easier picking", "Duplicates are grouped, with search, type, rare-form and \"not in my Pokédex\" filters. Edit each part of your card on its own, and a trade throws one Poké Ball per Pokémon."],
    ],
  },
  {
    id: "2026-10-01",
    date: "October 2026",
    title: "Trade Center page, and solid ground",
    items: [
      ["A page of its own", "The Trade Center now opens as its own page with one scroll, instead of a box over the map. Your phone's Back button returns to the game."],
      ["Copy your code", "Your friend code has a copy button beside it."],
      ["Rare forms move", "Shiny sparks, holo foil and the rest now animate everywhere in the Trade Center, not just on your showcase."],
      ["Frost Hollow and the Safari Zone", "Raised ground is raised again: you reach it by its steps, not by walking off any edge, and on Frost Hollow's shelf you are no longer drawn under its lip."],
    ],
  },
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
