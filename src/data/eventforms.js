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

export const EVENTS = [
  {
    id: "halloween",
    name: "Hallowed Night",
    // The title every look in the Pokedex earns (titles.js).
    title: "Hallowed Hunter",
    /* A check-in on this weekday (0 Sunday .. 6 Saturday) while the event
       runs pays these on top of the day's own reward (asked for, 2026-10-20:
       Friday's check-in, Hallow Balls). Five are a check-in day's worth. */
    checkin: { weekday: 5, items: { "hallow-ball": 5 } },
    // Local days, inclusive, as dayKey() writes them (daily.js).
    start: "20261024",
    end: "20261107",
    looks: [
      { id: 19901, of: 92, title: "Witch Hat Gastly", flavor: "It found a witch's hat in the Pokémon Tower and will not give it back. The gas curls round the brim to keep it on." },
      { id: 19902, of: 93, title: "Witch Hat Haunter", flavor: "It pulls the hat down over its eyes and sneaks up on anyone out after dark. The spikes poke out under the brim." },
      { id: 19903, of: 94, title: "Witch Hat Gengar", flavor: "On the longest night it tips its hat to its own shadow. Its grin is the last thing you see before the lights go out." },
      { id: 19904, of: 778, title: "Pumpkin Mimikyu", flavor: "This year's disguise is a stitched jack-o'-lantern. It drew the face itself, and it is very proud of it." },
      { id: 19905, of: 41, title: "Vampire Zubat", flavor: "A fledgling that has only just found its fangs. It practises its bite on berries and gets the juice everywhere." },
      { id: 19906, of: 42, title: "Vampire Golbat", flavor: "It sweeps its cape over its face and opens a mouth full of dripping fangs. It is only ever hungry." },
      { id: 19907, of: 169, title: "Vampire Crobat", flavor: "The Count of the caves. It wears a gold medallion and a high collar, and four wings carry it without a sound." },
    ],
    /* THE NIGHTMARE: the event's legendary, never a swap and never in the
       grass. Every costume caught on the event's days is a Bad Dream; at
       `dreams` the new moon falls, and the next wild meeting in `area` after
       dark IS it. Lost - fled or run from - it waxes back to `keep`, and three
       more costumes bring it round again. Caught, it is the `medal` and its
       `name`, a title of its own beside the event's. */
    hunt: { id: 19908, of: 491, title: "Scarecrow Darkrai", flavor: "It stitched a sack over its head and stuffed its sleeves with straw to stand in the fields - and every crow that lands on it dreams of the dark.", medal: "nightmare", name: "Nightmare King", dreams: 7, keep: 4, area: "tower" },
  },
];
