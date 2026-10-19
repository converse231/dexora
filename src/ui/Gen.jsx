/* The generation chip.

   Gen 1 is all that ships, so "GEN 1" on every wild Pokémon tells you nothing
   today — and that is the reason it goes on now rather than alongside the first
   generation it would actually distinguish. A badge that arrives the same day as
   the thing it labels reads as a label. One that was always there reads as
   information, and the day a Chikorita turns up in the Deep Woods its GEN 2 is
   the only word on the nameplate that has changed.

   Gold rather than a type colour, because it is deliberately not a type: the
   nameplate already carries one or two of those and a third chip in the same
   palette would read as a third type. */

import { genOf, speciesById } from "../game/biomes.js";
import { isEvent } from "../data/dex.js";
import { EVENTS } from "../data/eventforms.js";

export default function Gen({ id, className = "" }) {
  /* AN EVENT LOOK belongs to no generation (eventforms.js): its chip names
     the event, in the event's own colours, so a costume met in the grass is
     announced on the nameplate itself. */
  if (isEvent(id)) {
    const ev = EVENTS.find((e) => e.id === speciesById(id).event);
    return (
      <span className={`gen gen-event ev-${ev.id} ${className}`.trim()} data-tip={`${ev.name} event Pokémon`}>
        EVENT
      </span>
    );
  }
  const gen = genOf(id);
  return (
    <span className={`gen ${className}`.trim()} data-tip={`Generation ${gen}`}>
      GEN {gen}
    </span>
  );
}
