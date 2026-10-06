/* THE WALKING PARTY, on the map (docs/cosmetics.md): up to three Pokemon
   from the Box, one walking behind you. Tap one to send it out, tap the one
   walking to put it back in its ball; Q cycles them. The engine plays the
   release on the canvas, so this is buttons only. Hidden with no party. */
import { memo } from "react";
import Sprite from "./Sprite.jsx";
import { label } from "../game/map.js";
import { speciesById } from "../game/biomes.js";
import { variantOf } from "../game/items.js";

function Party({ mons, buddy, onPick }) {
  if (!mons.length) return null;
  return (
    <div className="party" role="group" aria-label="Walking party">
      {mons.map((m) => {
        const name = label(speciesById(m.species));
        const on = m.uid === buddy;
        return (
          <button key={m.uid} type="button" className={`party-mon${on ? " on" : ""}`} aria-pressed={on}
            aria-label={on ? `${name} is walking with you. Put it in its ball` : `Walk with ${name}`}
            data-tip={on ? `${name} · tap to rest · Q to switch` : `Walk with ${name}`}
            onClick={() => onPick(on ? null : m.uid)}>
            <Sprite id={m.species} variant={variantOf(m)} alt="" eager />
          </button>
        );
      })}
    </div>
  );
}

export default memo(Party);
