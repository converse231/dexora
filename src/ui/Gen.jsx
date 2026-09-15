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

import { genOf } from "../game/biomes.js";

export default function Gen({ id, className = "" }) {
  const gen = genOf(id);
  return (
    <span className={`gen ${className}`.trim()} data-tip={`Generation ${gen}`}>
      GEN {gen}
    </span>
  );
}
