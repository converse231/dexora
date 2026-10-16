/* THE FERRY (the world plan's fifth phase, 2026-10-16; docs/world.md): walked
   into at a harbor, a town's road out or a dungeon's mouth, it offers every
   stop - Lilycove City on the mainland and Kanto's islands. A stop your level
   has not opened is listed shut with the level it opens at, as a door says.
   Escape or a tap away steps back ashore. */
import { useEffect } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import { AREAS, FERRY_STOPS } from "../game/map.js";
import { BIOMES, areaOpen } from "../game/biomes.js";

const levelOf = (id) => BIOMES.find((b) => b.id === id)?.level;
// What a town stop is the doorstep of: the maps behind its doors (not its roads).
const behindIds = (id) => [...new Set((AREAS[id].doors ?? []).filter((d) => d[5] !== 1).map((d) => d[2]))];
/* The mainland's port first (a stop with a road on), then Kanto in the order
   it opens - a town at the level of the map behind its door. */
const mainland = (id) => (AREAS[id].doors ?? []).some((d) => d[5] === 1);
const opensAt = (id) => levelOf(id) ?? Math.min(...behindIds(id).map(levelOf));
const STOPS = [...FERRY_STOPS].sort((a, b) => mainland(b) - mainland(a) || opensAt(a) - opensAt(b));

export default function Ferry({ areaId, level, onSail, onClose }) {
  useModalLock();
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="confirm ferry" role="dialog" aria-modal="true" aria-label="The ferry"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="cf-title">Where to?</h3>
        <div className="ferry-stops">
          {STOPS.filter((id) => id !== areaId).map((id, k) => {
            const open = areaOpen(id, level);
            const sub = behindIds(id).map((b) => AREAS[b].name).join(" · ");
            return (
              <button key={id} type="button" className="ferry-stop" disabled={!open} autoFocus={k === 0}
                onClick={() => onSail(id)}>
                <b>{AREAS[id].name}</b>
                {sub && <span>{sub}</span>}
                {!open && <em>Lv {levelOf(id)}</em>}
              </button>
            );
          })}
        </div>
        <div className="cf-actions">
          <button type="button" onClick={onClose}>Stay ashore</button>
        </div>
      </div>
    </div>
  );
}
