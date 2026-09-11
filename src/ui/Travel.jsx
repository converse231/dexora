/* Pick a map. Every area is open from the first minute - what stops you farming
   Frost Hollow at level one is the price of the balls, not a locked door. */
import { BIOMES } from "../game/biomes.js";
import { AREAS } from "../game/map.js";
import Types from "./Types.jsx";

export default function Travel({ areaId, onTravel, busy }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span>TRAVEL</span>
        <span>{AREAS[areaId]?.name}</span>
      </div>

      <div className="arealist">
        {BIOMES.map((b) => {
          const here = b.id === areaId;
          return (
            <button
              key={b.id}
              className={`arearow${here ? " here" : ""}`}
              disabled={here || busy}
              onClick={() => onTravel(b.id)}
            >
              <span className="ar-name">{b.name}</span>
              <Types of={b.types} className="ar-types" />
              <em>{here ? "HERE" : "GO"}</em>
            </button>
          );
        })}
      </div>

      <p className="shop-note">
        Every area is open. The rarer the Pokémon, the more balls it costs to
        land — that is what paces you, not a locked gate.
      </p>
    </div>
  );
}
