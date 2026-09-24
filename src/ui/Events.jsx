/* WHAT IS HAPPENING IN THE WORLD, in one place. Outbreaks, rifts, research
   and alphas each had a card in the corner or a line in How to play, and none
   of them had anywhere that said "here is today's, here is how far along you
   are, go". This is that page: live, read off the engine on every render, and
   every number is the live constant rather than a typed one - the rare-forms
   page records what a typed odds string costs the day the ladder moves.

   Reached from the menu, and from the event cards themselves: a card you can
   see and cannot press is a door painted on a wall. */
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
   question a player actually has ("what should I catch next?"), answered from
   the counters rather than by making them open every dex entry. */
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
  const obGo = obLive && ob.areaId !== state?.areaId && areaOpen(ob.areaId, level) && !busy;

  const rift = world?.rift ?? null;
  const since = world?.sinceTravel ?? 0;

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
          <span className="set-mail">What the world is doing today</span>
          <button className="set-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="hp-body">
          {/* OUTBREAK - the "raid" of the day. */}
          <section className={`ev-card${obLive ? " live" : ""}`}>
            <header>
              <img src={eventIcon("outbreak")} alt="" />
              <h4>Mass outbreak</h4>
              <em>{obLive ? `${ob.left} left` : ob ? "over for today" : "none today"}</em>
            </header>
            {ob && obSp ? (
              <div className="ev-row">
                <Sprite id={obSp.id} alt={label(obSp)} />
                <p>
                  <b>{label(obSp)}</b> {obLive ? "is overrunning" : "overran"}{" "}
                  <b>{AREAS[ob.areaId]?.name}</b>. About a third of what you meet
                  there is one, for {OUTBREAK_SIZE} encounters, and each is{" "}
                  {OUTBREAK_LIFT}&times; as likely to be a rare form.
                </p>
              </div>
            ) : (
              <p>A new outbreak starts every day.</p>
            )}
            {obLive && (
              <button
                type="button"
                className="ev-go"
                disabled={!obGo}
                onClick={() => onTravel(ob.areaId)}
              >
                {ob.areaId === state?.areaId ? "You are here"
                  : !areaOpen(ob.areaId, level)
                    ? `Opens at Lv ${BIOMES.find((b) => b.id === ob.areaId)?.level}`
                    : `Go to ${AREAS[ob.areaId]?.name}`}
              </button>
            )}
          </section>

          {/* RIFT - opened by staying, so the useful thing to show is how long
              you have stayed. */}
          <section className={`ev-card${rift ? " live rift" : ""}`}>
            <header>
              <img src={eventIcon("rift")} alt="" />
              <h4>Space-time rift</h4>
              <em>{rift ? `${rift.left} steps left` : since < RIFT_FROM ? "calm" : "stirring"}</em>
            </header>
            <p>
              {rift
                ? `Open over ${here}: rarer Pokémon are out and things turn up underfoot. Leaving the map closes it.`
                : since < RIFT_FROM
                  ? `Stay on one map and it tears. ${RIFT_FROM - since} more steps here before one can open.`
                  : `Any step here could open one now, and one is certain by ${RIFT_SURE} steps.`}
            </p>
            {!rift && (
              <div className="ev-meter" role="img"
                aria-label={`${since} of ${RIFT_SURE} steps on this map`}>
                <i style={{ width: `${Math.min(100, (since / RIFT_SURE) * 100)}%` }} />
                <b style={{ left: `${(RIFT_FROM / RIFT_SURE) * 100}%` }} />
              </div>
            )}
            {!rift && <small>{since} steps on this map · a rift lasts {RIFT_STEPS}</small>}
          </section>

          {/* DISCOVERY - research, answered as "what next". */}
          <section className="ev-card">
            <header>
              <Mark tier="research" size={16} />
              <h4>Discovery</h4>
              <em>{finished} finished</em>
            </header>
            <p>
              {touched
                ? `${touched} species studied. A finished entry makes its rare forms ${RESEARCH_LIFT}× as likely.`
                : "Catch anything to start its research."}
            </p>
            {close.length > 0 && (
              <ul className="ev-list">
                {close.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => onSelect(r.id)}>
                      <Sprite id={r.id} alt="" />
                      <span>
                        <b>{label(speciesById(r.id))}</b>
                        <i>{r.next}</i>
                      </span>
                      <em>Lv {r.level}</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ALPHAS - nothing to schedule, so it is only the odds and the tally. */}
          <section className="ev-card">
            <header>
              <Mark tier="alpha" size={16} />
              <h4>Alphas</h4>
              <em>{alphas} held</em>
            </header>
            <p>
              About one Pokémon in {Math.round(1 / ALPHA_CHANCE)} is an alpha: far
              bigger, harder to catch, and it never runs. It pays Rare Candy when
              caught and can never be sold.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
