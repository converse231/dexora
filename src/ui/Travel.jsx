/* Pick a map. The world opens as you level: Tall Grass from the first minute,
   the Haunted Tower at 20.

   A locked row still shows its NAME and its TYPES. That is the whole reason to
   draw it rather than hide it - the ladder is a thing to read ahead on, and a
   list that grows out of nowhere teaches nothing about where you are going.

   THE WORLD MAP (2026-10-16, the world plan's first phase): every map as a
   place, joined by its real roads (solid) and doors (dashed) - read off the
   doors in mapdata through `exitsOf`, so a line here is a way you can walk.
   Where each place SITS is ours (`AT`): the mainland is Hoenn's, and Kanto
   is below the line - islands by the ferry from Lilycove City (the fifth
   phase), every stop ringed with a dashed rim. */
import { BIOMES, areaOpen } from "../game/biomes.js";
import { AREAS, exitsOf, FERRY_STOPS } from "../game/map.js";
import Types from "./Types.jsx";
import { eventIcon } from "./Sprite.jsx";

/* Each map's place, in a 100 x 130 frame: a grid of three columns so every
   name is readable at the rail's width (a free layout drew 8px labels). The
   mainland above the line, its geography kept where it can be - Mauville in
   the middle with the desert above it, Seaside Road below, 117 and 118 either
   side, Route 123 off 118; Route 113 and Fallarbor over the desert toward
   Meteor Falls, and Route 115 beyond it; Route
   118 up to Monsoon Trail, Fortree, Rainwood and Route 121 - and the Kanto
   maps below the line, where the ferry will dock. TOWNS are places too
   (dimmer, never a Travel stop). */
const AT = {
  falls: [18, 8], route114: [50, 8], fallarbor: [82, 8],
  route115: [18, 20], route113: [82, 20],
  ember: [18, 32], cinder: [50, 32], desert: [82, 32],
  route117: [18, 44], mauville: [50, 44], route118: [82, 44], route123: [64, 50],
  pond: [50, 56], woods: [82, 56],
  power: [18, 68], mansion: [50, 68], fortree: [82, 68],
  rainwood: [82, 80],
  safari: [50, 92], route121: [82, 92],
  lilycove: [82, 104],
  meadow: [18, 124], ridge: [50, 124], lavender: [82, 124],
  frost: [18, 138], fourisland: [50, 138], tower: [82, 138],
  tanoby: [18, 152], shoal: [50, 152],
};
const SHORE = 112;
const TOWNS = Object.keys(AREAS).filter((id) => AREAS[id].town);

function links() {
  const seen = new Set(), out = [];
  for (const id of Object.keys(AREAS)) {
    for (const ex of exitsOf(id)) {
      if (ex.ferry) continue;          // the ferry is drawn as rims, not lines
      const k = [id, ex.to].sort().join("|") + ex.road;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ a: id, b: ex.to, road: ex.road });
    }
  }
  return out;
}
const LINKS = links();

function WorldMap({ areaId, level, busy, onTravel }) {
  return (
    <svg className="worldmap" viewBox="0 0 100 160" role="img" aria-label="World map - roads, doors and the ferry between maps">
      <line className="wm-shore" x1="4" y1={SHORE} x2="96" y2={SHORE} />
      <line className="wm-ferry" x1={AT.lilycove[0]} y1={AT.lilycove[1]} x2={AT.lilycove[0]} y2={SHORE} />
      <text className="wm-sea" x="44" y={SHORE + 4.5}>Kanto · by ferry from Lilycove City</text>
      {FERRY_STOPS.map((id) => AT[id] && (
        <circle key={`dock-${id}`} className="wm-dock" cx={AT[id][0]} cy={AT[id][1]} r="2.9" />
      ))}
      {LINKS.map(({ a, b, road }) => AT[a] && AT[b] && (
        <line key={`${a}-${b}-${road}`} className={road ? "wm-road" : "wm-door"}
          x1={AT[a][0]} y1={AT[a][1]} x2={AT[b][0]} y2={AT[b][1]} />
      ))}
      {TOWNS.map((id) => AT[id] && (
        <g key={id} className={`wm-place town${id === areaId ? " here" : ""}`}>
          {id === areaId && <circle className="wm-ring" cx={AT[id][0]} cy={AT[id][1]} r="3.2" />}
          <rect x={AT[id][0] - 1.6} y={AT[id][1] - 1.6} width="3.2" height="3.2" rx=".6" />
          <text x={AT[id][0]} y={AT[id][1] + 5.4}>{AREAS[id].name}</text>
        </g>
      ))}
      {BIOMES.map((b) => {
        const p = AT[b.id];
        if (!p) return null;
        const here = b.id === areaId, open = areaOpen(b.id, level);
        return (
          <g key={b.id} className={`wm-place${here ? " here" : ""}${open ? "" : " shut"}`}
            onClick={() => !here && open && !busy && onTravel(b.id)}>
            {here && <circle className="wm-ring" cx={p[0]} cy={p[1]} r="3.2" />}
            <circle cx={p[0]} cy={p[1]} r="1.8" />
            <text x={p[0]} y={p[1] + 5.4}>{b.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Travel({ areaId, level = 1, onTravel, busy, outbreakArea }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span>TRAVEL</span>
        <span>{AREAS[areaId]?.name}</span>
      </div>

      <WorldMap areaId={areaId} level={level} busy={busy} onTravel={onTravel} />

      <div className="arealist">
        {BIOMES.map((b) => {
          const here = b.id === areaId;
          const open = areaOpen(b.id, level);
          const ways = exitsOf(b.id);
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
              {ways.length > 0 && (
                <span className="ar-ways">
                  {ways.map((w) => (w.ferry ? "Ferry" : `${w.road ? "Road" : "Door"} to ${AREAS[w.to]?.name ?? w.to}`)).join(" · ")}
                </span>
              )}
              <em>{here ? "HERE" : open ? "GO" : `LV ${b.level}`}</em>
            </button>
          );
        })}
      </div>

      <p className="shop-note">
        The world opens as you level, up to Tanoby Ruins at 40. Walk a road or a
        door straight into the next map - towns (the squares) are on foot only -
        take the ferry (the dashed rims) between Lilycove City and Kanto's
        islands, or travel here to anywhere you have opened. Inside a map nothing is gated — the rarer the Pokémon, the more
        balls it costs to land, and that is what paces you there.
      </p>
    </div>
  );
}
