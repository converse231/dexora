/* WHAT IS HAPPENING IN THE WORLD, in one place - built as a quest board rather
   than a list, because the first version read as a settings page and these
   are the four things in the game worth going out for today.

   Every card is live, read off the engine on every render, and every number
   is the live constant rather than a typed one - the rare-forms page records
   what a typed odds string costs the day the ladder moves.

   PROGRESS IS DRAWN, NOT WRITTEN. "9 left" is a sentence; fifteen pips with
   six of them spent is a raid in progress. The rift's meter shows the zones it
   moves through, and a research level is a ring you watch close. */
import { useEffect } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import Sprite, { eventIcon } from "./Sprite.jsx";
import Mark from "./Marks.jsx";
import { label, AREAS } from "../game/map.js";
import { speciesById, areaOpen, BIOMES, ALPHA_CHANCE } from "../game/biomes.js";
import {
  OUTBREAK_SIZE, OUTBREAK_LIFT, RIFT_FROM, RIFT_SURE, RIFT_STEPS,
} from "../game/events.js";
import {
  tasksFor, progress, researchLevel, researchPoints, RESEARCH_MAX, RESEARCH_LIFT,
} from "../game/research.js";

const NEAREST = 4;   // how many unfinished entries the Discovery card lists

/* The research you are closest to finishing, and the next task on each - the
   question a player actually has ("what should I catch next?"). */
function nearest(research) {
  return Object.entries(research ?? {})
    .map(([k, row]) => ({ id: Number(k), row, level: researchLevel(Number(k), row) }))
    .filter((r) => r.level < RESEARCH_MAX && speciesById(r.id))
    .sort((a, b) => researchPoints(b.id, b.row) - researchPoints(a.id, a.row) || a.id - b.id)
    .slice(0, NEAREST)
    .map((r) => {
      const t = tasksFor(r.id).find((task) => progress(task, r.row).cleared < task.steps.length);
      const p = t && progress(t, r.row);
      const next = t && t.steps.find((s) => p.n < s);
      return { ...r, next: t ? `${t.label}${t.steps.length > 1 ? ` ${p.n}/${next}` : ""}` : "" };
    });
}

/* Until the day turns, which is when the next outbreak starts - the quest's
   own clock (`dayKey` is local time), so the two can never disagree. */
function untilTomorrow() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const min = Math.max(0, Math.round((next - now) / 60000));
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

// A row of pips: `spent` filled of `total`, drawn rather than counted.
function Pips({ total, spent, label: aria }) {
  return (
    <div className="ev-pips" role="img" aria-label={aria}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < spent ? "on" : ""} />)}
    </div>
  );
}

export default function Events({ world, state, level, busy, onTravel, onSelect, onClose }) {
  useModalLock();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const ob = world?.outbreak ?? null;
  const obSp = ob && speciesById(ob.speciesId);
  const obLive = ob && ob.left > 0;
  const obOpen = ob && areaOpen(ob.areaId, level);
  const obGo = obLive && ob.areaId !== state?.areaId && obOpen && !busy;

  const rift = world?.rift ?? null;
  const since = world?.sinceTravel ?? 0;
  const riftZone = rift ? "open" : since < RIFT_FROM ? "calm" : "stirring";

  const research = state?.research ?? {};
  const touched = Object.keys(research).length;
  const finished = Object.entries(research)
    .filter(([k, row]) => researchLevel(Number(k), row) >= RESEARCH_MAX).length;
  const close = nearest(research);

  const alphas = (state?.box ?? []).filter((m) => m.alpha).length;
  const here = BIOMES.find((b) => b.id === state?.areaId)?.name ?? "";

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div
        className="helpcard evcard"
        role="dialog"
        aria-modal="true"
        aria-label="Events"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="set-top">
          <h3>Events</h3>
          <span className="set-mail">Today&rsquo;s quest board</span>
          <button className="set-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="hp-body">
          {/* OUTBREAK - the raid of the day. */}
          <section className={`ev-card ev-raid${obLive ? " live" : ""}`}>
            <header className="ev-banner">
              <img src={eventIcon("outbreak")} alt="" />
              <h4>Mass outbreak</h4>
              <span className={`ev-stamp${obLive ? " live" : ""}`}>{obLive ? "LIVE" : ob ? "OVER" : "SOON"}</span>
            </header>
            {ob && obSp ? (
              <div className="ev-raid-body">
                <span className="ev-spot"><Sprite id={obSp.id} alt={label(obSp)} /></span>
                <div className="ev-raid-copy">
                  <b>{label(obSp)}</b>
                  <span>{obLive ? "overrunning" : "overran"} {AREAS[ob.areaId]?.name}</span>
                  <small>{OUTBREAK_LIFT}&times; rare-form odds while it lasts</small>
                </div>
              </div>
            ) : (
              <p className="ev-quiet">A new outbreak starts every day.</p>
            )}
            {ob && (
              <>
                <Pips total={OUTBREAK_SIZE} spent={OUTBREAK_SIZE - ob.left}
                  label={`${ob.left} of ${OUTBREAK_SIZE} encounters left`} />
                <div className="ev-meta">
                  <span>{obLive ? `${ob.left} of ${OUTBREAK_SIZE} left` : "All met today"}</span>
                  <span>Next in {untilTomorrow()}</span>
                </div>
              </>
            )}
            {obLive && (
              <button type="button" className="ev-go" disabled={!obGo} onClick={() => onTravel(ob.areaId)}>
                {ob.areaId === state?.areaId ? "You are here — go walking"
                  : !obOpen ? `Opens at Lv ${BIOMES.find((b) => b.id === ob.areaId)?.level}`
                    : `Go to ${AREAS[ob.areaId]?.name} ›`}
              </button>
            )}
          </section>

          {/* RIFT - opened by staying, so what matters is how long you have. */}
          <section className={`ev-card ev-rift ${riftZone}`}>
            <header className="ev-banner">
              <img src={eventIcon("rift")} alt="" />
              <h4>Space-time rift</h4>
              <span className={`ev-stamp${rift ? " live" : ""}`}>{riftZone.toUpperCase()}</span>
            </header>
            <p>
              {rift
                ? `Open over ${here}: rarer Pokémon, and things lying on the ground. Leaving closes it.`
                : since < RIFT_FROM
                  ? `Stay on one map and it tears. ${RIFT_FROM - since} more steps here first.`
                  : `The air is thin here. Any step could open one, and one is certain by ${RIFT_SURE}.`}
            </p>
            {rift ? (
              <div className="ev-drain" role="img" aria-label={`${rift.left} of ${RIFT_STEPS} steps left`}>
                <i style={{ width: `${(rift.left / RIFT_STEPS) * 100}%` }} />
                <b>{rift.left} steps left</b>
              </div>
            ) : (
              <div className="ev-zones" role="img" aria-label={`${since} of ${RIFT_SURE} steps on this map`}>
                <span className="z-calm" style={{ width: `${(RIFT_FROM / RIFT_SURE) * 100}%` }}>calm</span>
                <span className="z-stir">possible</span>
                <i style={{ left: `${Math.min(100, (since / RIFT_SURE) * 100)}%` }} />
              </div>
            )}
            {!rift && <div className="ev-meta"><span>{since} steps on this map</span><span>lasts {RIFT_STEPS}</span></div>}
          </section>

          {/* DISCOVERY - research, answered as "what next". */}
          <section className="ev-card ev-disc">
            <header className="ev-banner">
              <Mark tier="research" size={18} />
              <h4>Discovery</h4>
            </header>
            <div className="ev-stats">
              <span><b>{finished}</b> finished</span>
              <span><b>{touched}</b> studied</span>
              <span><b>{RESEARCH_LIFT}&times;</b> rare odds when done</span>
            </div>
            {close.length > 0 ? (
              <ul className="ev-list">
                {close.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => onSelect(r.id)}>
                      <span className="ev-ring" style={{ "--p": r.level / RESEARCH_MAX }}>
                        <Sprite id={r.id} alt="" />
                      </span>
                      <span>
                        <b>{label(speciesById(r.id))}</b>
                        <i>Next: {r.next}</i>
                      </span>
                      <em>Lv {r.level}</em>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ev-quiet">Catch anything to start its research.</p>
            )}
          </section>

          {/* ALPHAS - nothing to schedule, so it is a trophy count. */}
          <section className="ev-card ev-alpha">
            <header className="ev-banner">
              <Mark tier="alpha" size={18} />
              <h4>Alphas</h4>
            </header>
            <div className="ev-trophy">
              <b>{alphas}</b>
              <span>
                {alphas === 1 ? "alpha caught" : "alphas caught"}
                <small>About one Pokémon in {Math.round(1 / ALPHA_CHANCE)} is one — huge,
                  it never runs, and it pays Rare Candy. It can be a rare form too.</small>
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
