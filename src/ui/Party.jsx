/* THE WALKING PARTY, on the map (docs/cosmetics.md): up to three Pokemon
   from the Box, one walking behind you. Tap one to send it out, tap the one
   walking to put it back in its ball; Q cycles them. A + while there is
   room, an edit button once it is full - both open the party picker. The
   engine plays the release on the canvas, so this is buttons only. */
import { memo } from "react";
import Sprite from "./Sprite.jsx";
import Icon from "./Icon.jsx";
import { label } from "../game/map.js";
import { speciesById } from "../game/biomes.js";
import { variantOf } from "../game/items.js";
import { PARTY_MAX } from "../game/cosmetics.js";
import { abilityOf, abilityName, fieldText, heartsOf, HEARTS } from "../game/abilities.js";

function Party({ mons, buddy, onPick, onEdit }) {
  const full = mons.length >= PARTY_MAX;
  return (
    <div className="party" role="group" aria-label="Walking party">
      {mons.map((m) => {
        const name = label(speciesById(m.species));
        const on = m.uid === buddy;
        // Its ability, what it does out here, and its friendship - the tooltip's second line.
        const what = fieldText(m);
        const about = `${abilityName(abilityOf(m))}${what ? ` (${what.toLowerCase()})` : ""} · friendship ${heartsOf(m.walked)}/${HEARTS.length}`;
        return (
          <button key={m.uid} type="button" className={`party-mon${on ? " on" : ""}`} aria-pressed={on}
            aria-label={on ? `${name} is walking with you. Put it in its ball` : `Walk with ${name}`}
            data-tip={on ? `${name} · ${about} · tap to rest, Q to switch` : `Walk with ${name} · ${about}`}
            onClick={() => onPick(on ? null : m.uid)}>
            <Sprite id={m.species} variant={variantOf(m)} alt="" eager />
          </button>
        );
      })}
      <button type="button" className={`party-add${full ? " edit" : ""}`} onClick={onEdit}
        aria-label={full ? "Change your walking party" : "Add a Pokémon to your walking party"}
        data-tip={full ? "Change your walking party" : mons.length ? "Add another to walk with" : "Walk with a Pokémon"}>
        <Icon n={full ? "edit" : "plus"} size={full ? 16 : 18} />
      </button>
    </div>
  );
}

export default memo(Party);
