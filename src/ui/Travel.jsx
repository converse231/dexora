/* Pick a map. The world opens as you level: Tall Grass from the first minute,
   the Haunted Tower at 20.

   A locked row still shows its NAME and its TYPES. That is the whole reason to
   draw it rather than hide it - the ladder is a thing to read ahead on, and a
   list that grows out of nowhere teaches nothing about where you are going. */
import { BIOMES, areaOpen } from "../game/biomes.js";
import { AREAS } from "../game/map.js";
import Types from "./Types.jsx";
import { eventIcon } from "./Sprite.jsx";

export default function Travel({ areaId, level = 1, onTravel, busy, outbreakArea }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span>TRAVEL</span>
        <span>{AREAS[areaId]?.name}</span>
      </div>

      <div className="arealist">
        {BIOMES.map((b) => {
          const here = b.id === areaId;
          const open = areaOpen(b.id, level);
          return (
            <button
              key={b.id}
              className={`arearow${here ? " here" : ""}${open ? "" : " locked"}`}
              disabled={here || busy || !open}
              onClick={() => onTravel(b.id)}
              data-tip={open ? undefined : `Opens at level ${b.level}`}
            >
              <span className="ar-name">
                {b.name}
                {b.id === outbreakArea && (
                  <img className="ar-event" src={eventIcon("outbreak")} alt="Mass outbreak"
                    data-tip="A mass outbreak is on this map today" />
                )}
              </span>
              <Types of={b.types} className="ar-types" />
              <em>{here ? "HERE" : open ? "GO" : `LV ${b.level}`}</em>
            </button>
          );
        })}
      </div>

      <p className="shop-note">
        The world opens as you level, up to the Haunted Tower at 20. Inside a
        map nothing is gated — the rarer the Pokémon, the more balls it costs to
        land, and that is what paces you there.
      </p>
    </div>
  );
}
