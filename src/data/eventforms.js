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
    /* ITS SKY: the Pokemon that float across its poster (Season.jsx), the
       Arena's own PMD walks baked by `npm run drift` - up to five, each on its
       own lane (asked for, 2026-10-29). FLIERS AND FLOATERS ONLY: a walker
       (Sableye, Gengar, Mimikyu, Pikachu) striding through the air read
       wrong. */
    drift: [92, 93, 42, 425, 41],
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
    hunt: { id: 19908, of: 491, title: "Scarecrow Darkrai", flavor: "It stitched a sack over its head and stuffed its sleeves with straw to stand in the fields - and every crow that lands on it dreams of the dark.", medal: "nightmare", name: "Nightmare King", dreams: 20, again: 25, area: "tower" },   // 7 and 4 at 1 costume in 16 meetings; now 1 in 2 (2026-10-24)
  },
  /* HALLOWED NIGHT'S SECOND WEEK (2026-10-26, asked for): costumes
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
    drift: [93, 355, 477, 198, 278],
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
      /* THE THIRD WAVE (2026-10-27, asked for: two more lines and three more
         one-of-a-kind catches). Ids run on past the Reaper's, so the hunt never
         moves; each needs its row in trading.sql's event_slots(). */
      { id: 19932, of: 198, rare: 3, title: "Plague Doctor Murkrow", flavor: "A beaked mask, a little leather hat and a cane it is far too proud of. It makes its rounds of the graveyard every night." },
      { id: 19933, of: 430, on: 198, rare: 3, title: "Plague Doctor Honchkrow", flavor: "The head doctor of the night. Its lantern is the last light in the street, and every Murkrow follows it on its rounds." },
      { id: 19934, of: 63, title: "Fortune Teller Abra", flavor: "It dozes under a little turban beside a crystal ball. It already knows your fortune - it just will not wake up to tell you." },
      { id: 19935, of: 64, on: 63, title: "Fortune Teller Kadabra", flavor: "It fans a hand of tarot cards and its spoon points at one. It always draws the same card for you, and it never says which." },
      { id: 19936, of: 65, on: 63, title: "Fortune Teller Alakazam", flavor: "The seer of the fair. Two spoons circle its crystal ball, and the mist inside it shows next year's Halloween." },
      // Evolved, so each is met on its line's first stage too: still one costume and one catch.
      /* EVERY ONE MET IS DRESSED (`rare` 3, the share times three; 2026-10-29, audited):
         Murkrow and Riolu are 0.1-0.6% of their best maps, so at a third the
         Plague Doctors and the Monster Hunter took 900-2,300 meetings each. */
      { id: 19937, of: 448, on: 447, rare: 3, title: "Monster Hunter Lucario", flavor: "It reads every costume's aura by lantern light. It has hunted down every monster in the mansion and found them all very friendly." },
      { id: 19938, of: 199, on: 79, title: "Ghost Story Slowking", flavor: "It holds a candle under its chin and opens the old book. Its stories are so slow that the scary part arrives after sunrise." },
      { id: 19939, of: 465, on: 114, title: "Swamp Monster Tangrowth", flavor: "It rose out of the bog wearing half of it. A frog has lived on its shoulder for three Halloweens and has never once been asked to leave." },
    ],
    hunt: { id: 19931, of: 487, title: "Grim Reaper Giratina", flavor: "It rose out of the Distortion World in a reaper's hood, its scythe as long as its wings - and the Pokémon Mansion's clocks all stopped at midnight.", medal: "reaper", name: "The Reaper", dreams: 20, again: 25, area: "mansion" },
  },
  /* PONCHO PARADE (2026-10-28, asked for): Pikachu in the Pokemon Center's
     ponchos - the 16 printed on Japan's promo cards, three sold only as
     figures and keychains (Sableye, Altaria, Scizor), the Magikarp and
     Gyarados costumes of the same series, and one of our own (Mega Gengar,
     for the ghosts). Pinsir, Latias, Latios, Venusaur, Blastoise and
     Garchomp were drawn up and left out (2026-10-29, your call) - so the
     Mirage Desert, Ground alone, has no poncho.
     Every look is a Pikachu, so a poncho is never met in a Pikachu's place:
     the week ROAMS (`roam`, events.js `roamLook`) - a share of every walking
     meeting on a map is a poncho whose Pokemon (`wears`) shares a type with
     the map, so a Charizard poncho is met on the volcano and a Gyarados one
     by the water. A poncho printed on a real card (`card`, the promo set in
     data/cards/sets/poncho.js) files that card into your collection on its
     first catch (the engine's `grantPromo`); a card that shows three ponchos
     comes with each of them. Daylight: the ponchos are out by day. */
  {
    id: "ponchos",
    name: "Poncho Parade",
    title: "Poncho Collector",
    emblem: "⚡",
    shelf: "ponchos",
    // Mew, Rayquaza and Altaria among the bunting (a Pikachu walks; it does not fly).
    drift: [151, 384, 334],
    evolves: false,
    roam: true,
    daytime: true,
    // Of EVERY walking meeting on a map with a poncho that fits it, not of one species'.
    share: 1 / 12,
    checkin: { weekday: 5, items: { "poncho-honey": 1 } },
    // Two days after The Haunting (asked for, 2026-10-29).
    start: "20261108",
    end: "20261114",
    lore: "Every autumn the Pokémon Center sews a new parade of ponchos - and this year the Pikachu got to the rack first. They are out all over the region with the hoods pulled up: wings flapping, tails trailing, sleeves two sizes too long. Each poncho draws its Pikachu where its Pokémon would live, so the Charizard ones are by the volcano and the Gyarados ones down by the water. Catch one that was ever printed on a card and the card is yours. And something pink has been seen in the Safari Zone, wearing a poncho of its own.",
    looks: [
      // On a real card: the Mega Charizard X and Y Special Boxes (2016).
      { id: 19940, of: 25, wears: 10034, card: "poncho-xy207", title: "Charizard X Poncho Pikachu", flavor: "Its poncho is Mega Charizard X: black, with blue flames stitched round the hood. It practises a roar in the mirror and squeaks every time." },
      { id: 19941, of: 25, wears: 10035, card: "poncho-xy208", title: "Charizard Y Poncho Pikachu", flavor: "It wears Mega Charizard Y's great orange wings on its back and flaps them hard on every hilltop. It has not taken off yet." },
      // The Skytree Town Special Box (2016): Rayquaza, and its shiny in black.
      { id: 19942, of: 25, wears: 384, card: "poncho-xy230", title: "Rayquaza Poncho Pikachu", flavor: "A long green Rayquaza poncho with a tail that trails behind it for metres. It coils up in the tail to sleep." },
      // RARE: the black one, as rare in its box as a shiny is in the grass.
      { id: 19943, of: 25, wears: 384, card: "poncho-xy231", rare: 0.25, title: "Shiny Rayquaza Poncho Pikachu", flavor: "The black Rayquaza poncho, gold rings down its length. Only a few were ever sewn, and this Pikachu will not let anyone else try it on." },
      { id: 19944, of: 25, wears: 10079, card: "poncho-xy274", title: "Mega Rayquaza Poncho Pikachu", flavor: "Mega Rayquaza's golden whiskers stream from the hood when it runs. It runs everywhere, just to see them stream." },
      // The Pikachu Mega Campaign (2015): three in one card.
      { id: 19945, of: 25, wears: 10069, card: "poncho-xy203", title: "Audino Poncho Pikachu", flavor: "A soft white Mega Audino poncho with long frilled ears. It pats anyone who looks tired on the head." },
      { id: 19946, of: 25, wears: 10059, card: "poncho-xy203", title: "Lucario Poncho Pikachu", flavor: "It wears Mega Lucario's blue hood and red-tipped sleeves, and stands like a fighter whenever anyone is watching." },
      { id: 19947, of: 25, wears: 10071, card: "poncho-xy203", title: "Slowbro Poncho Pikachu", flavor: "A pink Mega Slowbro poncho with a grey shell on the back. It takes a very long time to notice that it is wearing it." },
      // The Mega Battle Play Point cards (2016): four, and three.
      { id: 19948, of: 25, wears: 10068, card: "poncho-xy274", title: "Gallade Poncho Pikachu", flavor: "Mega Gallade's green crest and white cape. It sweeps the cape about with great dignity and trips on it." },
      { id: 19949, of: 25, wears: 10045, card: "poncho-xy274", title: "Ampharos Poncho Pikachu", flavor: "A yellow Mega Ampharos poncho with a white mane and a glowing red bead on its tail. Its cheeks and the bead light up together." },
      { id: 19950, of: 25, wears: 10052, card: "poncho-xy274", title: "Mawile Poncho Pikachu", flavor: "Two great Mega Mawile jaws hang from the back of its hood. It is very sweet, and the jaws are very not." },
      { id: 19951, of: 25, wears: 10088, card: "poncho-xy275", title: "Lopunny Poncho Pikachu", flavor: "Mega Lopunny's long ears and fluffy cream cuffs. It hops instead of walking whenever it is wearing them." },
      { id: 19952, of: 25, wears: 10075, card: "poncho-xy275", title: "Diancie Poncho Pikachu", flavor: "A pink Mega Diancie poncho set with little gems that catch the light. It insists on being called Princess." },
      { id: 19953, of: 25, wears: 10051, card: "poncho-xy275", title: "Gardevoir Poncho Pikachu", flavor: "Mega Gardevoir's long white gown, gathered up so it can run. It twirls whenever the wind gets under it." },
      // The Alolan Vulpix and Vulpix Special Box (2017).
      { id: 19954, of: 25, wears: 37, card: "poncho-sm038", title: "Vulpix Poncho Pikachu", flavor: "A russet Vulpix poncho with six curled tails bobbing behind it. It chases them round and round." },
      { id: 19955, of: 25, wears: 10103, card: "poncho-sm037", title: "Alolan Vulpix Poncho Pikachu", flavor: "A snow-white Alolan Vulpix poncho with six pale curls of tail. Its breath puffs white even on warm days." },
      /* The Hiroshima Special Box (2015): Magikarp and Gyarados, the same series
         named "Pretend" on the card (asked for, 2026-10-29), and the red Gyarados
         Pokemon Shuffle dressed it in. Ids past the hunt's: a look's place follows
         its id, so the hunt never moves. */
      { id: 19967, of: 25, wears: 129, card: "poncho-xy150", title: "Magikarp Poncho Pikachu", flavor: "A bright red Magikarp poncho, the fish's own gaping mouth framing its face. It flops about on dry land and is very proud of the splash it makes." },
      { id: 19968, of: 25, wears: 130, card: "poncho-xy151", title: "Gyarados Poncho Pikachu", flavor: "It evolved its Magikarp poncho into a Gyarados one overnight. It glares like a sea serpent, and then giggles." },
      // RARE: the red one, as rare as a red Gyarados in a lake.
      { id: 19969, of: 25, wears: 130, rare: 0.25, title: "Shiny Gyarados Poncho Pikachu", flavor: "The red Gyarados poncho from the lake of rage. Only a few Pikachu have ever been seen in it, and every one of them was furious about something." },
      // Sold only as figures and keychains, never printed.
      { id: 19956, of: 25, wears: 10066, title: "Sableye Poncho Pikachu", flavor: "Mega Sableye's great red gem held out in front like a shield. Its eyes glitter in the dark under the hood." },
      { id: 19957, of: 25, wears: 10067, title: "Altaria Poncho Pikachu", flavor: "A fluffy cloud of a Mega Altaria poncho. It naps on the softest part and calls it a bed." },
      { id: 19958, of: 25, wears: 10046, title: "Scizor Poncho Pikachu", flavor: "A red Mega Scizor poncho with two pincer mittens. It snaps them at everything, very politely." },
      // Our own: the poncho the Center never made.
      { id: 19965, of: 25, wears: 10038, title: "Gengar Poncho Pikachu", flavor: "A purple Mega Gengar poncho with a wide stitched grin. It hides in shadows and giggles, and the giggle gives it away." },
    ],
    /* THE SPECIAL ONE: the other way round - Mew in a Pikachu poncho. Twenty
       ponchos caught and the next meeting in the Safari Zone is it. */
    hunt: { id: 19966, of: 151,
      title: "Pikachu Poncho Mew", medal: "mischief", name: "Pink Mischief", dreams: 20, again: 25, area: "safari",
      flavor: "It borrowed a Pikachu poncho from the rack and wears it back to front, the hood's ears flopping over its eyes. When you call it a Pikachu it giggles and vanishes.",
      words: {
        token: "Poncho Stamp", tokens: "Poncho Stamps", due: "Something pink is in the Safari Zone", rise: "A PINK SHIMMER",
        falls: "Mew giggles and slips away...", fade: "MEW SLIPS AWAY", back: "it will come back to play",
        run: "Mew slips away if you run",
      },
    },
  },
];
