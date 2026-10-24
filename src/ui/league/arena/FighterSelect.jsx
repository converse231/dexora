/* CHOOSE YOUR FIGHTERS (asked for, 2026-10-24: "make it like Street Fighter
   or Tekken - a fighting game, not overwhelming"). The Arena team's picker
   as a character-select screen: your three slots across the top, a
   spotlight on the fighter under the cursor - its sprite, role, ULTI, stats
   and the moves it will play - and a roster of ONE portrait a species (its
   best copy; its other copies are a switch in the spotlight). Only what
   fights here: a Pokemon with its own Arena body (arena.js `arenaReady`),
   never a trade lock or an event costume. Arrow keys move, Enter picks,
   Backspace takes the last one out, Escape leaves. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { arenaReady, roleOf, ultiPick, shapeOf, enteringAs } from "../../../game/arena.js";
import { playerFighter, refusal, moveOf } from "../../../game/battle.js";
import { isEvent } from "../../../data/dex.js";
import { speciesById, tierName } from "../../../game/biomes.js";
import { variantOf } from "../../../game/items.js";
import { label } from "../../../game/map.js";
import { MOVES } from "../../../data/moves.js";
import { ARENA_TEAM, RENTALS, SHOWCASE, rentalOf } from "../../../game/ladder.js";
import { foundIn } from "../../../game/biomes.js";
import Icon from "../../Icon.jsx";
import Sprite from "../../Sprite.jsx";
import Types from "../../Types.jsx";
import { useModalLock } from "../../modal.js";

const nameOf = (id) => label(speciesById(id));
const moveName = (i) => MOVES[i].n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const STATS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
const ARCH_SAYS = {
  Cataclysm: "One colossal strike", Storm: "Strikes rain on the court", Cannon: "A court-long beam", Nova: "A blast all round it",
  Barrage: "A fan of homing shots", Onslaught: "A three-dash rush", Phantom: "Vanishes, strikes from below", Sacrifice: "A huge blast, down to 1 HP",
  Fortress: "Three seconds untouchable", Barrier: "A dome that halves hits", Sanctuary: "A big heal, and the bench too",
  Awakening: "Two stats to +2, cooldowns doubled", Domain: "Takes over the field", Snare: "Sleep, paralysis or a trap",
};
// A copy's worth for the roster's face: level first, then a rare form over a plain one.
const rank = (m) => m.level * 10 + (variantOf(m) ? 1 : 0) + (m.alpha ? 2 : 0);

const ROLE_WORD = { brawler: "Melee", blaster: "Ranged" };

export default function FighterSelect({ box, picked, custom, onSave, onClose }) {
  useModalLock();
  /* Your own fighters, then a RENTAL of each rental species you hold no fighter
     of (ladder.js), then the SHOWCASE you have not caught - locked. */
  const fighters = useMemo(() => {
    const own = box.filter((m) => !refusal(m) && !isEvent(m.species) && arenaReady(enteringAs(m).species));
    const held = new Set(own.map((m) => m.species));
    return [...own, ...RENTALS.filter(([id]) => !held.has(id) && arenaReady(id)).map(([id]) => rentalOf(-id))];
  }, [box]);
  const owned = useMemo(() => new Set(box.map((m) => m.species)), [box]);
  const locked = useMemo(() => SHOWCASE.map(([id]) => id).filter((id) => !owned.has(id) && arenaReady(id)), [owned]);
  // One portrait a species: its best copy; the rest are its alternates.
  const roster = useMemo(() => {
    const by = new Map();
    for (const m of fighters) (by.get(m.species) ?? by.set(m.species, []).get(m.species)).push(m);
    return [...by.values()].map((copies) => copies.sort((a, b) => rank(b) - rank(a)))
      .sort((a, b) => b[0].level - a[0].level || a[0].species - b[0].species);
  }, [fighters]);
  const [team, setTeam] = useState(() => picked.map((m) => m.uid).filter((u) => fighters.some((m) => m.uid === u)).slice(0, ARENA_TEAM));
  const [type, setType] = useState("");
  const [reach, setReach] = useState("");       // "", "brawler" (melee) or "blaster" (ranged)
  const [q, setQ] = useState("");
  const roleBy = useMemo(() => new Map(roster.map((c) => [c[0].species, roleOf(playerFighter(c[0]))])), [roster]);
  const shown = useMemo(() => roster.filter((copies) => {
    const sp = speciesById(copies[0].species);
    return (!type || sp.types.includes(type)) && (!reach || roleBy.get(sp.id) === reach)
      && (!q || nameOf(sp.id).toLowerCase().includes(q.toLowerCase()));
  }), [roster, type, reach, q, roleBy]);
  // The locked ones answer the same filters, so a search for Charizard finds it locked.
  const lockedShown = useMemo(() => locked.filter((id) => {
    const sp = speciesById(id);
    return (!type || sp.types.includes(type)) && (!q || nameOf(id).toLowerCase().includes(q.toLowerCase()));
  }), [locked, type, q]);
  const [peek, setPeek] = useState(null);       // a locked species under the cursor
  const [cur, setCur] = useState(0);
  const [alt, setAlt] = useState({});           // species -> the copy chosen in the spotlight
  const copyOf = (copies) => copies.find((m) => m.uid === alt[copies[0].species]) ?? copies[0];
  const focus = shown[Math.min(cur, shown.length - 1)];
  const mon = focus && copyOf(focus);
  const [slam, setSlam] = useState(-1);         // the slot a pick just landed in, for its flash

  const pick = (m) => {
    if (!m) return;
    setTeam((t) => {
      if (t.includes(m.uid)) return t.filter((u) => u !== m.uid);
      // One of a species: picking another copy swaps it in.
      const rest = t.filter((u) => fighters.find((x) => x.uid === u)?.species !== m.species);
      if (rest.length >= ARENA_TEAM) return t;
      setSlam(rest.length);
      return [...rest, m.uid];
    });
  };
  const close = useRef(onClose);
  close.current = onClose;
  const grid = useRef(null);
  useEffect(() => {
    const key = (e) => {
      if (e.target instanceof HTMLInputElement) { if (e.key === "Escape") { e.stopPropagation(); close.current(); } return; }
      const cols = Math.max(1, Math.round((grid.current?.clientWidth ?? 600) / 76));
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (move) { e.preventDefault(); setCur((c) => Math.max(0, Math.min(shown.length - 1, c + move))); }
      else if (e.key === "Enter") { e.preventDefault(); pick(mon); }
      else if (e.key === "Backspace") { e.preventDefault(); setTeam((t) => t.slice(0, -1)); }
      else if (e.key === "Escape") { e.stopPropagation(); close.current(); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });
  useEffect(() => { grid.current?.querySelector(".fs-cell.cur")?.scrollIntoView({ block: "nearest" }); }, [cur]);
  useEffect(() => { if (slam >= 0) { const t = setTimeout(() => setSlam(-1), 450); return () => clearTimeout(t); } }, [slam]);

  // A Mega is shown as what enters: its base's role, ULTI, stats and moves (arena.js `enteringAs`).
  const enter = mon && enteringAs(mon);
  const f = useMemo(() => enter && playerFighter(enter), [mon]);   // eslint-disable-line react-hooks/exhaustive-deps
  const role = f && roleOf(f);
  const ult = enter && ultiPick(enter.species);
  const kit = f ? f.moves.map((m) => m.i).filter((i) => i !== ult.move && shapeOf(moveOf(i))) : [];
  const teamMons = team.map((u) => fighters.find((m) => m.uid === u)).filter(Boolean);
  const types = useMemo(() => [...new Set(roster.flatMap((c) => speciesById(c[0].species).types))].sort(), [roster]);
  const maxStat = 255;

  return createPortal(
    <div className="fs" role="dialog" aria-modal="true" aria-label="Choose your fighters">
      <header className="fs-top">
        <div className="fs-title"><b>Choose your fighters</b><span>{team.length}/{ARENA_TEAM}</span></div>
        <ol className="fs-slots">
          {Array.from({ length: ARENA_TEAM }, (_, k) => {
            const m = teamMons[k];
            return (
              <li key={k} className={`fs-slot${m ? " full" : ""}${slam === k ? " slam" : ""}`}>
                <em>{k === 0 ? "Lead" : `P${k + 1}`}</em>
                {m ? (
                  <button type="button" onClick={() => pick(m)} aria-label={`Take ${nameOf(m.species)} out`}>
                    <Sprite id={m.species} variant={variantOf(m)} eager alt="" />
                    <b>{nameOf(m.species)}</b><span>Lv {m.level}</span>
                  </button>
                ) : <span className="fs-empty">Empty</span>}
              </li>
            );
          })}
        </ol>
        <button type="button" className="fs-x" aria-label="Close" onClick={onClose}>✕</button>
      </header>

      <div className="fs-main">
        <aside className="fs-spot" aria-live="polite">
          {!peek && mon ? (
            <>
              <div className={`fs-stage t-${speciesById(mon.species).types[0]}`}>
                <Sprite id={mon.species} variant={variantOf(mon)} eager alt="" />
              </div>
              <div className="fs-name">
                <h2>{nameOf(mon.species)}</h2>
                <span>Lv {mon.level}{variantOf(mon) ? ` · ${tierName(variantOf(mon))}` : ""}{mon.alpha ? " · Alpha" : ""}</span>
              </div>
              <div className="fs-tags">
                <Types of={speciesById(mon.species).types} />
                <em className={`fs-role r-${role}`}>{ROLE_WORD[role]} · {role === "brawler" ? "Brawler" : "Blaster"}</em>
                {mon.rental && <em className="fs-role fs-rent">Rental</em>}
              </div>
              {enter.species !== mon.species && <p className="fs-megain">Enters as <b>{nameOf(enter.species)}</b>{enter.mega ? " and Mega Evolves in battle." : " - this Mega has no Arena animation yet, so it fights unevolved."}</p>}
              {focus.length > 1 && (
                <div className="fs-copies" role="group" aria-label="Which one">
                  {focus.map((m) => (
                    <button key={m.uid} type="button" className={m.uid === mon.uid ? "on" : ""} onClick={() => setAlt((a) => ({ ...a, [m.species]: m.uid }))}>
                      Lv {m.level}{variantOf(m) ? ` ${tierName(variantOf(m))}` : ""}{m.alpha ? " α" : ""}
                    </button>
                  ))}
                </div>
              )}
              <div className="fs-ult">
                <span>ULTI</span><b>{ult.name}</b><em>{ult.arch}</em>
                <p>{ARCH_SAYS[ult.arch]}</p>
              </div>
              <dl className="fs-stats">
                {STATS.map((n, k) => (
                  <div key={n}><dt>{n}</dt><dd><i style={{ "--v": Math.min(1, f.st[k] / maxStat) }} /><span>{f.st[k]}</span></dd></div>
                ))}
              </dl>
              <ul className="fs-moves">
                {kit.map((i) => <li key={i} className={`t-${MOVES[i].t}`}>{moveName(i)}</li>)}
              </ul>
              <button type="button" className={`fs-pick${team.includes(mon.uid) ? " out" : ""}`} onClick={() => pick(mon)}
                disabled={!team.includes(mon.uid) && team.length >= ARENA_TEAM && !teamMons.some((m) => m.species === mon.species)}>
                {team.includes(mon.uid) ? "Take out" : "Pick"}
              </button>
            </>
          ) : !peek && <p className="fs-none">Catch a Pokémon first - the Arena fights with your Box.</p>}
          {peek && (
            /* A LOCKED one under the cursor: what it is and where it lives - catching it is the key. */
            <div className="fs-locked" role="status">
              <div className={`fs-stage t-${speciesById(peek).types[0]}`}><Sprite id={peek} eager alt="" /><Icon n="lock" size={34} /></div>
              <h2>{nameOf(peek)}</h2>
              <p>Locked - catch one to fight with it.{foundIn(peek).areas.length ? ` Found in ${foundIn(peek).areas.slice(0, 2).map((a) => a.name).join(" and ")}.` : ""}</p>
            </div>
          )}
        </aside>

        <section className="fs-roster">
          <div className="fs-filters">
            <input id="fs-q" type="search" placeholder="Find a fighter" value={q} onChange={(e) => { setQ(e.target.value); setCur(0); }} aria-label="Find a fighter" />
            <div className="fs-types fs-reach" role="group" aria-label="Melee or ranged">
              {[["", "Any reach"], ["brawler", "Melee"], ["blaster", "Ranged"]].map(([r, w]) => (
                <button key={w} type="button" className={`${r ? `r-${r}` : ""}${reach === r ? " on" : ""}`} onClick={() => { setReach(r); setCur(0); }}>{w}</button>
              ))}
            </div>
            <div className="fs-types" role="group" aria-label="Type">
              <button type="button" className={type ? "" : "on"} onClick={() => { setType(""); setCur(0); }}>All</button>
              {types.map((t) => (
                <button key={t} type="button" className={`t-${t}${type === t ? " on" : ""}`} onClick={() => { setType(type === t ? "" : t); setCur(0); }}>{t}</button>
              ))}
            </div>
          </div>
          <div className="fs-grid" ref={grid} role="listbox" aria-label="Fighters">
            {shown.map((copies, k) => {
              const m = copyOf(copies), at = team.findIndex((u) => copies.some((c) => c.uid === u));
              return (
                <button key={copies[0].species} type="button" role="option" aria-selected={at >= 0}
                  className={`fs-cell${k === cur ? " cur" : ""}${at >= 0 ? " picked" : ""}`}
                  onMouseEnter={() => setCur(k)} onFocus={() => setCur(k)} onClick={() => { setCur(k); pick(m); }}
                  aria-label={`${nameOf(m.species)}, level ${m.level}`}>
                  <Sprite id={m.species} variant={variantOf(m)} alt="" />
                  {at >= 0 && <em>{at === 0 ? "L" : at + 1}</em>}
                  {copies.length > 1 && <i>×{copies.length}</i>}
                  {m.rental && <i className="fs-tag">Rent</i>}
                </button>
              );
            })}
            {!reach && lockedShown.map((id) => (
              <button key={`lock-${id}`} type="button" className="fs-cell lock" aria-disabled="true"
                onMouseEnter={() => setPeek(id)} onMouseLeave={() => setPeek(null)} onFocus={() => setPeek(id)} onBlur={() => setPeek(null)}
                onClick={() => setPeek(peek === id ? null : id)} aria-label={`${nameOf(id)} - locked, catch one to unlock`}>
                <Sprite id={id} alt="" />
                <i className="fs-tag"><Icon n="lock" size={12} /></i>
              </button>
            ))}
          </div>
        </section>
      </div>

      <footer className="fs-foot">
        {custom && <button type="button" className="lg-go quiet" onClick={() => onSave([])}>Use my League team</button>}
        <button type="button" className="lg-go fs-ready" disabled={!team.length} onClick={() => onSave(team)}>Ready</button>
      </footer>
    </div>,
    document.body,
  );
}
