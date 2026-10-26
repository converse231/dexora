/* EVENT LOOKS: Pokemon dressed for a dated event, drawn for this game.

   HAND-WRITTEN, not fetched: no API has these, because nobody else drew them.
   The art is `art/events/<event>/<base id>.jpg`, made into the front sprite
   `public/sprites/event/<event>/<base id>.png` by `npm run eventart`. There is
   no back sprite, no shiny, no Origin and no strip - which is what keeps them
   out of battles and off the tiers that need their own drawing.

   A LOOK IS A SPECIES, like a form: it has a Dex entry, a Box row and a tier
   row, and it is appended to `SPECIES` (dex.js) by its `wave`, after every
   form - one past the forms' last wave, and fetch-forms counts these when it
   picks the next one, so a form fetched later still APPENDS. Saves are keyed
   by position; an event look's position never moves.

   IT IS COUNTED BY NOTHING: the Dex files it under Event, not a region, and
   no medal, rank, bonus or "left to find" counts it (`isEvent`, `DEX_TOTAL`),
   so a player who missed the event can still finish the dex. (`genOf` reads
   through to its species, as a Mega's does, for what only a roll reads.) It is
   met only while its event runs (`eventLive`), as a rare substitution for its
   own species - wherever that species is met, and nowhere it is not
   (`eventLook` in events.js). It evolves the way its species does, look to
   look, at the species' own price.

   Ids are 19901 and up: under the 20000 the trading server accepts
   (`between 1 and 20000` in trading.sql), and above the plates and looks
   (PLATE_BASE + a PokeAPI form id, 19716 at most today). fetch-forms refuses
   a form of its own that lands on one. An id is a saved fact: never renumber
   one. */

export const EVENT_WAVE = 6;

/* AN EVENT IS ONE WEEK (2026-10-26, your call: "with the amount of Pokemon we
   have it is easy to complete within days"): seven local days, start to end
   inclusive, and a longer celebration is a run of weeks, each its own event
   - its own costumes, its own hunted legendary, its own title (check.mjs
   holds every event to seven days and none to overlap). Events of one
   celebration share a `shelf`: the items sold on their days (items.js
   `event`), so a Hallow Ball bought in week one still works in week two. */
export const EVENTS = [
  {
    id: "halloween",
    name: "Hallowed Night",
    // The title every look in the Pokedex earns (titles.js).
    title: "Hallowed Hunter",
    // Its mark on the chip, the board and the poster; its look is `.ev-<id>` (styles.css).
    emblem: "🎃",
    shelf: "halloween",
    /* A check-in on this weekday (0 Sunday .. 6 Saturday) while the event
       runs pays these on top of the day's own reward (asked for, 2026-10-20:
       Friday's check-in, Hallow Balls). Five are a check-in day's worth. */
    checkin: { weekday: 5, items: { "hallow-ball": 5 } },
    // Local days, inclusive, as dayKey() writes them (daily.js).
    start: "20261024",
    end: "20261030",   // a fortnight until 2026-10-26: the second week is The Haunting
    looks: [
      { id: 19901, of: 92, title: "Witch Hat Gastly", flavor: "It found a witch's hat in the Pokémon Tower and will not give it back. The gas curls round the brim to keep it on." },
      { id: 19902, of: 93, title: "Witch Hat Haunter", flavor: "It pulls the hat down over its eyes and sneaks up on anyone out after dark. The spikes poke out under the brim." },
      { id: 19903, of: 94, title: "Witch Hat Gengar", flavor: "On the longest night it tips its hat to its own shadow. Its grin is the last thing you see before the lights go out." },
      { id: 19904, of: 778, title: "Pumpkin Mimikyu", flavor: "This year's disguise is a stitched jack-o'-lantern. It drew the face itself, and it is very proud of it." },
      { id: 19905, of: 41, title: "Vampire Zubat", flavor: "A fledgling that has only just found its fangs. It practises its bite on berries and gets the juice everywhere." },
      { id: 19906, of: 42, title: "Vampire Golbat", flavor: "It sweeps its cape over its face and opens a mouth full of dripping fangs. It is only ever hungry." },
      { id: 19907, of: 169, title: "Vampire Crobat", flavor: "The Count of the caves. It wears a gold medallion and a high collar, and four wings carry it without a sound." },
      /* THE SECOND WAVE (2026-10-24, asked for: the first seven were three
         families and an afternoon's work). One a map, each a costume of its
         own: no next stage is drawn, so evolving one leaves the costume behind
         (fetch-evolutions writes no row) and every look is a catch. Ids run on
         past the hunt's - a position follows its id (dex.js), so the hunt
         never moves. */
      { id: 19909, of: 163, title: "Sheet Ghost Hoothoot", flavor: "It found a bedsheet on a washing line and cut two holes for its eyes. It hoots \"boo\" at anyone who walks under its tree." },
      { id: 19910, of: 228, title: "Skeleton Houndour", flavor: "Its bones are only painted on, but it rattles them anyway. The pack follows the one in the skull hood." },
      { id: 19911, of: 261, title: "Werewolf Poochyena", flavor: "Under the full moon it pulls on a wolf's head and howls far bigger than it is. The claws are cardboard." },
      { id: 19912, of: 361, title: "Mummy Snorunt", flavor: "It wrapped itself up against the cold and kept going. One loose bandage always trails behind it in the snow." },
      { id: 19913, of: 622, title: "Frankenstein Golett", flavor: "Somebody bolted its neck and stitched its brow, and it has never once stopped to ask why. The jacket was always too small." },
      { id: 19914, of: 425, title: "Trick-or-Treat Drifloon", flavor: "It drifts from door to door in cat ears with its bucket held out. Nobody has ever dared to give it a trick." },
      { id: 19915, of: 592, title: "Ghost Bride Frillish", flavor: "It drifts up the shore in a veil of old lace, holding roses that wilted long ago. It is still waiting at the water's edge." },
    ],
    /* THE NIGHTMARE: the event's legendary, never a swap and never in the
       grass. Every costume caught on the event's days is a Bad Dream; at
       `dreams` the new moon falls, and the next wild meeting in `area` after
       dark IS it. Lost - fled or run from - it waxes back to `keep`, and three
       more costumes bring it round again. Caught, it is the `medal` and its
       `name`, a title of its own beside the event's. */
    hunt: { id: 19908, of: 491, title: "Scarecrow Darkrai", flavor: "It stitched a sack over its head and stuffed its sleeves with straw to stand in the fields - and every crow that lands on it dreams of the dark.", medal: "nightmare", name: "Nightmare King", dreams: 20, keep: 12, area: "tower" },   // 7 and 4 at 1 costume in 16 meetings; now 1 in 2 (2026-10-24)
  },
  /* HALLOWED NIGHT'S SECOND WEEK (2026-10-26, asked for): fourteen costumes
     and a new legendary, from Halloween itself - whole lines this time, second
     and final stages too, and NONE EVOLVES (`evolves: false`, your call): each
     stage is a catch of its own. A later stage is rarely met wild (Dusknoir
     almost never), so a look may also be met `on` its line's base: meeting a
     Duskull can be any of the three Reapers (events.js `eventLook`). Themes
     the first week did not wear, and no devils (your call). */
  {
    id: "haunting",
    name: "The Haunting",
    title: "Phantom Hunter",
    emblem: "👻",
    shelf: "halloween",
    evolves: false,
    // HARDER (2026-10-26, asked for): a third of the species' meetings, where the first week had half.
    share: 1 / 3,
    checkin: { weekday: 5, items: { "hallow-ball": 5 } },
    start: "20261031",
    end: "20261106",
    looks: [
      { id: 19916, of: 355, title: "Grim Reaper Duskull", flavor: "It drags a scythe twice its size and never quite lifts it. It counts the hours to midnight on its one red eye." },
      { id: 19917, of: 356, on: 355, title: "Grim Reaper Dusclops", flavor: "Its hooded robe hides the hollow body, and the scythe rests on its shoulder. Whatever it swallows, it keeps an hourglass for." },
      { id: 19918, of: 477, on: 355, title: "Grim Reaper Dusknoir", flavor: "The reaper of the Pokémon Tower. It reads names off a long scroll by candlelight, and its scythe never makes a sound." },
      { id: 19919, of: 52, title: "Black Cat Meowth", flavor: "It painted its fur black and its charm moon silver, and it crosses every path it can find. Nobody's luck has changed." },
      { id: 19920, of: 278, title: "Ghost Pirate Wingull", flavor: "It flies a tattered flag from a ship that sank a hundred years ago. The eyepatch is on the wrong eye." },
      { id: 19921, of: 279, on: 278, title: "Ghost Captain Pelipper", flavor: "Captain of a ship nobody has seen in a century. It still carries the crew's last letters in its bill." },
      { id: 19922, of: 54, title: "Zombie Psyduck", flavor: "Its headache finally won. It shuffles about with its arms out, moaning - which is what it always did." },
      { id: 19923, of: 74, title: "Gargoyle Geodude", flavor: "It perches on the mansion's roof with stone wings and stone horns, and holds its pose until dawn." },
      { id: 19924, of: 75, on: 74, title: "Gargoyle Graveler", flavor: "Four stone arms and a pair of stone wings. It guards the mansion's gate and pretends to be a statue whenever anyone looks." },
      { id: 19925, of: 76, on: 74, title: "Gargoyle Golem", flavor: "The great gargoyle of the bell tower. When the midnight bell rings, it stretches its wings for the first time all year." },
      { id: 19926, of: 50, title: "Gravedigger Diglett", flavor: "It pops up in the old graveyard beside a crooked headstone, lantern in hand, and pops back down before you can read the name." },
      { id: 19927, of: 51, on: 50, title: "Gravedigger Dugtrio", flavor: "Three gravediggers, three top hats, one very old headstone. They never agree on whose turn it is to dig." },
      /* Two that never evolve (2026-10-26, asked for): full-grown, and met at
         3-5% where they live. */
      { id: 19928, of: 324, title: "Cauldron Torkoal", flavor: "Its shell became a witch's cauldron, and the smoke from its nostrils bubbles up green. Something in there smells like soup." },
      // RARE (asked for: "its sprite looks so special"): a fifth of the week's odds - about one Tower meeting in 200 by day.
      { id: 19929, of: 302, rare: 0.2, title: "Phantom Thief Sableye", flavor: "A domino mask, a swirling cape and a sack of stolen gems. It leaves a calling card in every tomb it robs." },
      // Drawn from an earlier prompt, and back in the week for it (2026-10-26).
      { id: 19930, of: 77, title: "Headless Horseman Ponyta", flavor: "It gallops through the fields in a rider's tattered cloak, a glowing jack-o'-lantern swinging from its saddle." },
    ],
    hunt: { id: 19931, of: 487, title: "Grim Reaper Giratina", flavor: "It rose out of the Distortion World in a reaper's hood, its scythe as long as its wings - and the Pokémon Mansion's clocks all stopped at midnight.", medal: "reaper", name: "The Reaper", dreams: 20, keep: 12, area: "mansion" },
  },
];
