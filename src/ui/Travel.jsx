/* Pick a map. The world opens as you level: Tall Grass from the first minute,
   Tanoby Ruins at 40.

   A locked place still shows its NAME and its TYPES. That is the whole reason
   to draw it rather than hide it - the ladder is a thing to read ahead on, and
   a list that grows out of nowhere teaches nothing about where you are going.

   THE MAP TAB, REDRAWN (2026-10-17, reported: dots and lines said nothing, and
   the list under them was squeezed to two rows in a scroller of its own). ONE
   SCROLL for the pane: the world map, the PLACE CARD of what you tapped, then
   every map grouped by region.
   - Every place is a LOGO: a glyph for what kind of place it is (`KIND`) on
     its main type's colour, a town a slate square, a place not open yet grey
     with a lock and the level it opens at.
   - Roads are solid, doors dashed, and the ferry a dashed lane from Lilycove
     to Kanto's stops, each rimmed - all read off the doors in mapdata through
     `exitsOf`, so a line is a way you can walk. A legend says so.
   - Tapping a place SELECTS it: the card names its kind, types and level,
     every way out (each a tap to that place), and travels on one button.
   Where each place SITS is ours (`AT`): Hoenn on foot above the shore, Kanto
   by ferry below it. check.mjs holds every map to a place here. */
import { useEffect, useRef, useState } from "react";
import { BIOMES, areaOpen } from "../game/biomes.js";
import { AREAS, AREA_IDS, exitsOf, FERRY_STOPS } from "../game/map.js";
import Types from "./Types.jsx";
import Icon, { glyph } from "./Icon.jsx";
import { eventIcon } from "./Sprite.jsx";

/* Each map's place, in a 100 x 166 frame: three columns so every name reads
   at the rail's width. Mauville in the middle with the desert above it,
   Seaside Road below, 117 and 118 either side, Route 123 off 118; Route 113
   and Fallarbor over the desert toward Meteor Falls, Route 115 beyond it;
   Route 118 up to Monsoon Trail, Fortree, Rainwood, Route 121 and Lilycove -
   then the shore, and Kanto's ferry stops with what lies behind their doors. */
export const AT = {
  falls: [18, 14], route114: [50, 14], fallarbor: [82, 14],
  route115: [18, 26], route113: [82, 26],
  ember: [18, 38], cinder: [50, 38], desert: [82, 38],
  route117: [18, 50], mauville: [50, 50], route118: [82, 50], route123: [64, 56],
  pond: [50, 62], woods: [82, 62],
  power: [18, 74], mansion: [50, 74], fortree: [82, 74],
  rainwood: [82, 86],
  safari: [50, 98], route121: [82, 98],
  lilycove: [82, 110],
  meadow: [18, 132], ridge: [50, 132], lavender: [82, 132],
  frost: [18, 146], fourisland: [50, 146], tower: [82, 146],
  tanoby: [18, 160], shoal: [50, 160],
};
const SHORE = 119;
const H = 168;

/* WHAT KIND OF PLACE each map is - its logo's glyph (Icon.jsx) and its word.
   Ours, like `AT`: the maps carry no such field. check.mjs holds every map to
   one. */
export const KIND = {
  meadow: "grass", woods: "forest", pond: "coast", route117: "grass", route118: "coast",
  route123: "grass", route113: "desert", route121: "grass", route114: "grass", route115: "coast",
  rainwood: "forest", safari: "safari", desert: "desert",
  ridge: "cave", falls: "cave", ember: "cave", cinder: "mountain", frost: "ice", shoal: "ice",
  power: "building", mansion: "building", tower: "tower", tanoby: "ruins",
  mauville: "town", fortree: "town", fallarbor: "town", lilycove: "town", lavender: "town", fourisland: "town",
};
const KIND_NAME = {
  grass: "Route", forest: "Forest route", coast: "Coast", desert: "Desert", safari: "Safari Zone",
  cave: "Cave", mountain: "Mountain", ice: "Ice cave", building: "Building", tower: "Tower",
  ruins: "Ruins", town: "Town",
};

const biomeOf = (id) => BIOMES.find((b) => b.id === id) ?? null;
const kantoOf = (id) => (AT[id]?.[1] ?? 0) > SHORE;
const openAt = (id, level) => AREAS[id]?.town || areaOpen(id, level);

function links() {
  const seen = new Set(), out = [];
  for (const id of AREA_IDS) {
    for (const ex of exitsOf(id)) {
      if (ex.ferry) continue;          // the ferry is a lane and rims, not lines
      const k = [id, ex.to].sort().join("|") + ex.road;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ a: id, b: ex.to, road: ex.road });
    }
  }
  return out;
}
const LINKS = links();

// A place's logo inside the map: its glyph on its type's colour, a 24-grid
// path scaled to `s` units. A place not open yet is grey with the LEVEL it
// opens at in it - a tag beside it ran into the label above.
function Logo({ id, x, y, open, s = 4.4 }) {
  const kind = KIND[id] ?? "grass", town = kind === "town";
  const t = biomeOf(id)?.types?.[0];
  return (
    <g className={`wx-logo${town ? " town" : ""}${open ? "" : " shut"}${t && !town ? ` t-${t}` : ""}`}>
      {town
        ? <rect x={x - 3.4} y={y - 3.4} width="6.8" height="6.8" rx="1.6" />
        : <circle cx={x} cy={y} r="3.6" />}
      {open
        ? <path d={glyph(kind)} transform={`translate(${x - s / 2} ${y - s / 2}) scale(${s / 24})`} />
        : <text className="wx-lv" x={x} y={y + 1.05}>{biomeOf(id)?.level}</text>}
    </g>
  );
}

function WorldMap({ areaId, level, sel, onSelect }) {
  const [lx, ly] = AT.lilycove;
  // In a block of its own: a grid row sized by an SVG's aspect ratio alone
  // collapsed to its border, and the list drew over the map.
  return (
    <div className="wx-mapbox">
    <svg className="wx-map" viewBox={`0 0 100 ${H}`} role="img"
      aria-label="World map - places, roads, doors and the ferry">
      <text className="wx-region" x="4" y="5.5">HOENN · ON FOOT</text>
      <line className="wx-shore" x1="4" y1={SHORE} x2="96" y2={SHORE} />
      <text className="wx-region" x="4" y={SHORE + 5}>KANTO · BY FERRY FROM LILYCOVE</text>
      <line className="wx-ferry" x1={lx} y1={ly + 3.6} x2={lx} y2={SHORE} />
      <g className="wx-boat">
        <circle cx={lx} cy={SHORE} r="2.6" />
        <path d={glyph("boat")} transform={`translate(${lx - 1.7} ${SHORE - 1.7}) scale(${3.4 / 24})`} />
      </g>
      {LINKS.map(({ a, b, road }) => AT[a] && AT[b] && (
        <line key={`${a}-${b}-${road}`} className={road ? "wx-road" : "wx-door"}
          x1={AT[a][0]} y1={AT[a][1]} x2={AT[b][0]} y2={AT[b][1]} />
      ))}
      {FERRY_STOPS.map((id) => AT[id] && (
        <circle key={`dock-${id}`} className="wx-dock" cx={AT[id][0]} cy={AT[id][1]} r="5" />
      ))}
      {AREA_IDS.map((id) => {
        const p = AT[id];
        if (!p) return null;
        const here = id === areaId, open = openAt(id, level);
        return (
          <g key={id} className={`wx-place${here ? " here" : ""}${id === sel ? " sel" : ""}${open ? "" : " shut"}`}
            role="button" tabIndex={-1} aria-label={AREAS[id].name} onClick={() => onSelect(id)}>
            <circle className="wx-hit" cx={p[0]} cy={p[1]} r="7" />
            {(here || id === sel) && <circle className="wx-ring" cx={p[0]} cy={p[1]} r="5.4" />}
            <Logo id={id} x={p[0]} y={p[1]} open={open} />
            <text x={p[0]} y={p[1] + 7.6}>{AREAS[id].name}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

function Legend() {
  return (
    <div className="wx-legend" aria-label="Map key">
      <span><svg viewBox="0 0 16 6"><line className="wx-road" x1="1" y1="3" x2="15" y2="3" /></svg>Road</span>
      <span><svg viewBox="0 0 16 6"><line className="wx-door" x1="1" y1="3" x2="15" y2="3" /></svg>Door</span>
      <span><i className="wx-key ferry"><Icon n="boat" size={12} /></i>Ferry</span>
      <span><i className="wx-key town"><Icon n="town" size={12} /></i>Town</span>
      <span><i className="wx-key shut">25</i>Opens at that level</span>
      <span className="wx-tint">Colour = main type</span>
    </div>
  );
}

// An HTML logo, for the card and the list.
function Disc({ id, level, size = 34 }) {
  const kind = KIND[id] ?? "grass", town = kind === "town", open = openAt(id, level);
  const t = biomeOf(id)?.types?.[0];
  return (
    <span className={`wx-disc${town ? " town" : ""}${open ? "" : " shut"}${t && !town ? ` t-${t}` : ""}`}
      style={{ "--d": `${size}px` }} aria-hidden="true">
      <Icon n={open ? kind : "lock"} size={Math.round(size * 0.55)} />
    </span>
  );
}

function PlaceCard({ id, areaId, level, busy, outbreakArea, onTravel, onSelect, cardRef }) {
  const a = AREAS[id], b = biomeOf(id), town = !!a.town;
  const here = id === areaId, open = openAt(id, level);
  const ways = exitsOf(id);
  return (
    <section className="wx-card" aria-live="polite" ref={cardRef}>
      <header>
        <Disc id={id} level={level} size={42} />
        <div>
          <h4>{a.name}{id === outbreakArea && (
            <img className="wx-event" src={eventIcon("outbreak")} alt="Mass outbreak"
              data-tip="A mass outbreak is on this map today" />
          )}</h4>
          <span className="wx-kind">
            {KIND_NAME[KIND[id]] ?? "Route"}
            {town ? " · no wild Pokémon" : b ? ` · ${kantoOf(id) ? "Kanto" : "Hoenn"} · Lv ${b.level}` : ""}
          </span>
        </div>
      </header>
      {b && <Types of={b.types} className="wx-types" />}
      {ways.length > 0 && (
        <ul className="wx-ways">
          {ways.map((w) => (
            <li key={`${w.to}:${w.road}`}>
              {w.ferry ? (
                <>
                  <Icon n="boat" size={14} /> <b>Ferry</b> to {FERRY_STOPS.filter((s) => s !== id).length} stops:
                  {" "}{FERRY_STOPS.filter((s) => s !== id).map((s, k) => (
                    <span key={s}>{k ? ", " : ""}<button type="button" className="wx-to" onClick={() => onSelect(s)}>{AREAS[s].name}</button></span>
                  ))}
                </>
              ) : (
                <>
                  <i className={`wx-way ${w.road ? "road" : "door"}`} aria-hidden="true" />
                  {w.road ? "Road" : "Door"} to{" "}
                  <button type="button" className="wx-to" onClick={() => onSelect(w.to)}>{AREAS[w.to]?.name ?? w.to}</button>
                  {!openAt(w.to, level) && <em> · opens at Lv {biomeOf(w.to)?.level}</em>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {town ? (
        <p className="wx-note">Towns are on foot only - walk in by road, or take the ferry where there is one.</p>
      ) : (
        <button type="button" className={`wx-go${here ? " here" : ""}`} disabled={here || busy || !open}
          onClick={() => onTravel(id)}>
          {here ? "You are here" : open ? `Travel to ${a.name}` : `Opens at Lv ${b?.level}`}
        </button>
      )}
    </section>
  );
}

function Row({ b, areaId, level, busy, outbreakArea, onTravel, onSelect }) {
  const here = b.id === areaId, open = areaOpen(b.id, level);
  return (
    <div className={`wx-row${here ? " here" : ""}${open ? "" : " shut"}`}>
      <button type="button" className="wx-pick" onClick={() => onSelect(b.id)}
        aria-label={`${b.name}: show on the map`}>
        <Disc id={b.id} level={level} />
        <span className="wx-row-name">
          {b.name}
          {b.id === outbreakArea && <img className="wx-event" src={eventIcon("outbreak")} alt="Mass outbreak" />}
        </span>
        <Types of={b.types} className="wx-row-types" />
      </button>
      <button type="button" className="wx-row-go" disabled={here || busy || !open} onClick={() => onTravel(b.id)}
        data-tip={open ? undefined : `Opens at level ${b.level}`}>
        {here ? "HERE" : open ? "GO" : <><Icon n="lock" size={11} /> LV {b.level}</>}
      </button>
    </div>
  );
}

export default function Travel({ areaId, level = 1, onTravel, busy, outbreakArea }) {
  const [sel, setSel] = useState(areaId);
  // A new map (walked, sailed or travelled) is what the card shows next.
  useEffect(() => { setSel(areaId); }, [areaId]);
  const cardRef = useRef(null);
  const pick = (id) => setSel(AREAS[id] ? id : areaId);
  // Picked from the list, far below the card: bring the card to it.
  const pickRow = (id) => {
    pick(id);
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const groups = [["Hoenn", BIOMES.filter((b) => !kantoOf(b.id))], ["Kanto · by ferry", BIOMES.filter((b) => kantoOf(b.id))]];
  return (
    <div className="panel">
      <div className="panel-head">
        <span>TRAVEL</span>
        <span>{AREAS[areaId]?.name}</span>
      </div>
      <div className="wx-scroll">
        <WorldMap areaId={areaId} level={level} sel={sel} onSelect={pick} />
        <Legend />
        {AREAS[sel] && (
          <PlaceCard id={sel} areaId={areaId} level={level} busy={busy} outbreakArea={outbreakArea}
            onTravel={onTravel} onSelect={pick} cardRef={cardRef} />
        )}
        {groups.map(([title, list]) => (
          <section key={title} className="wx-group">
            <h4>{title}</h4>
            <div className="wx-rows">
              {list.map((b) => (
                <Row key={b.id} b={b} areaId={areaId} level={level} busy={busy} outbreakArea={outbreakArea}
                  onTravel={onTravel} onSelect={pickRow} />
              ))}
            </div>
          </section>
        ))}
        <p className="shop-note">
          The world opens as you level, up to Tanoby Ruins at 40. Walk a road or a door into the next map, take
          the ferry between Lilycove City and Kanto, or travel here to anywhere you have opened. Inside a map
          nothing is gated - the rarer the Pokémon, the more balls it costs to land.
        </p>
      </div>
    </div>
  );
}
