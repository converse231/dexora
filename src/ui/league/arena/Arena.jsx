/* THE ARENA (the Arena plan): real-time battles, its OWN TAB since
   2026-10-22 ("Battles would be League, then Arena a separate tab with a
   totally different UI/UX, like a complete game"). game/arena.js is the
   rules; render.js draws them; this is the page - a game's lobby (your team,
   the modes, the floors, one big Battle) - and a match's controls and HUD.
   Reached only by `lazy()` from App, like the League it borrows its data from.

   THE LOOP LIVES OUTSIDE REACT, like the map's: requestAnimationFrame steps
   the match in whole ticks (`TPS`) from accumulated time and draws between
   them; React hears a snapshot a few times a second, for the HUD alone. It
   stops the moment the page is hidden - a loop nobody can see is not free.

   A match never touches your Pokemon. A win against a CPU pays once a level a
   day (`engine.arenaWin`, priced like a road trainer in road.js); a master of
   the Arena Ladder (ladder.js) pays its first win once (`engine.arenaMaster`,
   which also judges the order). The Arena's three are the save's own
   `arenaTeam`, apart from the League's six (empty: the League's first three).

   ONLINE (phase 3): a FRIEND is challenged from the lobby (db/arena.sql), the
   two browsers link up (net.js) and play one match in lockstep (arena.js) in
   the Fair format - each side's species at Lv 50 - unranked and unpaid. The
   challenger is side 0; each end draws itself as `me`. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { newMatch, tick, cpuTeam, masterTeam, fairTeam, lockstep, rulesPrint, activeOf, TPS, LIMIT, INTRO, SURGE_MAX, SURGE_T, FAIR_LEVEL,
  FINAL_T, spent, SWAP_CD, basicShape, PICKUPS, SUDDEN_T, roleOf, basicCd, ultOf,
  cooldownOf, DODGE_CD, ARENAS, shapeOf, GROUND, ZONE_SAYS } from "../../../game/arena.js";
import { CLOUD, signedIn, myFriends, arenaChallenge, arenaInvites, arenaAnswer, arenaCancel } from "../../../net/cloud.js";
import { isEvent } from "../../../data/dex.js";
import { connect } from "./net.js";
import { LADDER, masterOf, ladderOpen, ladderPay, ARENA_TEAM } from "../../../game/ladder.js";
import { playerFighter, moveOf, STRUGGLE, refusal, learnable, movesOf } from "../../../game/battle.js";
import { TUTOR_PRICE } from "../../../game/items.js";
import { pricedAt } from "../../../game/trainer.js";
import { MOVES } from "../../../data/moves.js";
import { speciesById } from "../../../game/biomes.js";
import { variantOf } from "../../../game/items.js";
import { label } from "../../../game/map.js";
import { ARENA_LEVELS, arenaPay } from "../../../game/road.js";
import { dayKey, hash } from "../../../game/daily.js";
import { ARENA_NEWS_KEY, write } from "../../../game/store.js";
import BattleSwitch from "../BattleSwitch.jsx";
import { createRenderer } from "./render.js";
import { loadAnims } from "../moveAnim.js";
import Sprite from "../../Sprite.jsx";
import Icon from "../../Icon.jsx";
import Types from "../../Types.jsx";
import Picker, { keyOf } from "../../trade/Picker.jsx";
import { useModalLock, useDismiss } from "../../modal.js";
import { PMD_REV } from "../../../data/pmd.js";

const nameOf = (id) => label(speciesById(id));
const moveName = (i) => (i === STRUGGLE ? "Struggle" : MOVES[i].n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "));
const touchDevice = () => matchMedia("(hover: none) and (pointer: coarse)").matches;
const clock = (ticks) => { const s = Math.max(0, Math.ceil(ticks / TPS)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const asset = (p) => new URL(p, document.baseURI).href;
// Device preferences, never the save.
const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* a preference */ } };
const FLOOR_KEY = "dexora-arena-floor", MODE_KEY = "dexora-arena-mode", LEVEL_KEY = "dexora-arena-cpu";
const STATUS_TAG = ["PAR", "BRN", "PSN", "SLP", "FRZ"];
const STAT = ["", "Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];
const SHAPE_WORD = { shot: "Shot", beam: "Beam", melee: "Blow", dash: "Dash", pulse: "Pulse", field: "Trap", self: "Self", multi: "Burst" };
// The keys a match reads, in one place: the HUD's keycaps and How to play both say them.
const SKILL_KEYS = ["RMB", "Q", "E", "R"];
const PRESS = 14;          // ticks a press waits for its move: a basic attack's swing is shorter
/* A PHONE PLAYS FULLSCREEN AND SIDEWAYS where the browser lets a page ask
   (Android's Chrome: it also takes the URL bar away, which otherwise came
   and went over the controls). Asked on the Battle press - it must be a
   gesture - and let go when the match is over. Elsewhere (iOS) it quietly
   does nothing and the match asks to be turned instead. */
const immerse = () => {
  if (!touchDevice() || document.fullscreenElement) return;
  try {
    document.documentElement.requestFullscreen?.({ navigationUI: "hide" })
      ?.then(() => screen.orientation?.lock?.("landscape")?.catch?.(() => {}))?.catch?.(() => {});
  } catch { /* not this browser */ }
};
const unimmerse = () => {
  try { screen.orientation?.unlock?.(); } catch { /* not this browser */ }
  if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
};
const UPRIGHT_KEY = "dexora-arena-upright";
// A dragged move reaches this far: a thumb's pull of AIM_PX aims AIM_TILES away (a hazard lands there).
const AIM_PX = 72, AIM_TILES = 6, AIM_DEAD = 14;

/* What each floor's ground does, in the player's words (GROUND is the rule). */
const GROUND_SAYS = {
  indigo: "A plain court: nothing but the fight.",
  moon: "Rocks fall every 25 s - watch for the shadows.",
  seaside: "Water along the top and bottom: only Water and Flying types move freely in it.",
  caldera: "The edge is hot: a second against the wall burns anyone but a Fire type. The basalt wears away.",
  grove: "Tall grass in the corners hides you while you hold your fire.",
  rink: "Ice: anyone but an Ice type keeps sliding when it lets go.",
};
const floorName = (id) => ARENAS.find((a) => a.id === id)?.name ?? id;

const LEVEL_SAYS = {
  easy: "Slow to react, loose aim. Good for learning the ropes.",
  normal: "Dodges about half of what it sees and switches out when low.",
  hard: "Fast hands, sharp aim. Leads its shots, raises a shield, takes the zones.",
};
const MODE_NAME = { ladder: "Arena Ladder", quick: "Quick battle", training: "Training", friends: "Battle a friend" };
// A role in a word and its perks, for the lobby and the tutor (arena.js's roleOf).
const ROLE = {
  brawler: ["Brawler", "Attack-led: runs and jabs faster, hits harder up close, shrugs off shots"],
  blaster: ["Blaster", "Sp. Atk-led: shots fly faster and farther, beams charge sooner"],
};
// What reaches how far: the tutor's filters, and which a role wants.
const REACH = { melee: "close", dash: "close", shot: "range", beam: "range", multi: "range", pulse: "area", field: "area", self: "self" };
const WEATHER_NAME = { rain: "Rain", sun: "Harsh sun", sand: "Sandstorm", snow: "Snow" };
const WEATHER_TIP = { rain: "Water x1.5, Fire x0.5, Fire types slower", sun: "Fire x1.5, Water x0.5",
  sand: "Chips all but Rock, Ground and Steel types", snow: "Chips all but Ice types" };

/* THE ARENA PAGE: half of Battles (BattleSwitch). The game underneath pauses while it is
   open, it takes the modal lock, and a match owns the whole screen through
   `body.fighting` (the bars step aside). Opening it is what the map's
   announcement waits for (ARENA_NEWS_KEY). */
export default function ArenaPage({ engine, box, team, arenaTeam = [], record, ladder = [], money = 0, stats = null, onMode, onClose }) {
  useModalLock();
  useEffect(() => {
    engine?.pause(true);
    return () => engine?.pause(false);
  }, [engine]);
  useEffect(() => { write(ARENA_NEWS_KEY, "done"); }, []);
  const [live, setLive] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("fighting", live);
    if (!live) unimmerse();
    return () => document.body.classList.remove("fighting");
  }, [live]);
  useEffect(() => unimmerse, []);

  const ids = arenaTeam.length ? arenaTeam : team;
  const mons = useMemo(() => ids.map((uid) => box.find((m) => m.uid === uid)).filter((m) => m && !refusal(m)).slice(0, ARENA_TEAM), [box, ids]);
  const [match, setMatch] = useState(null);     // { mode, seed, floor, master }
  const [online, setOnline] = useState(null);   // { role, invite, friend }
  const [editing, setEditing] = useState(false);
  const [howto, setHowto] = useState(false);
  const [tutorFor, setTutorFor] = useState(null);   // a uid
  useEffect(() => { setLive(Boolean(match || online)); }, [match, online]);
  useEffect(() => { loadAnims(); }, []);
  // Escape leaves the page - unless a match, the editor or How to play has it.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !match && !online && !editing && !howto && tutorFor == null) { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [match, online, editing, howto, tutorFor, onClose]);

  const level = mons.length ? Math.round(mons.reduce((n, m) => n + m.level, 0) / mons.length) : 5;
  if (match) {
    return <Match key={match.seed} mons={mons} mode={match.mode} master={match.master} level={level} seed={match.seed} floor={match.floor}
      onWin={(cpu) => (match.master ? engine?.arenaMaster(match.master.id) : engine?.arenaWin(cpu, level)) ?? 0}
      onAgain={() => { const seed = (match.seed * 1103515245 + 12345) | 0; setMatch({ ...match, seed, floor: match.master || match.fixed ? match.floor : pickFloor(match.pick, seed) }); }}
      onExit={() => setMatch(null)} />;
  }
  if (online) return <Online start={online} mons={mons} onExit={() => setOnline(null)} />;
  return (
    <>
      <Lobby mons={mons} level={level} record={record} ladder={ladder} custom={arenaTeam.length > 0} onMode={onMode} onTutor={setTutorFor}
        onStart={(m) => { immerse(); setMatch(m); }} onOnline={(o) => { immerse(); setOnline(o); }} onEdit={() => setEditing(true)} onHowto={() => setHowto(true)} />
      {editing && <TeamEdit box={box} picked={mons} custom={arenaTeam.length > 0}
        onSave={(uids) => { engine?.setArenaTeam(uids); setEditing(false); }} onClose={() => setEditing(false)} />}
      {howto && <HowTo onClose={() => setHowto(false)} />}
      {tutorFor != null && box.some((m) => m.uid === tutorFor) && (
        <MoveTutor engine={engine} mon={box.find((m) => m.uid === tutorFor)} money={money} stats={stats} onClose={() => setTutorFor(null)} />
      )}
    </>
  );
}

const pickFloor = (floor, seed) => (floor === "random" ? ARENAS[Math.abs(seed) % ARENAS.length].id : floor);

/* THE LOBBY: your three on the left, the four ways to fight on the right,
   the floors under them, and one big Battle along the foot. Each mode is a
   tile; the chosen one opens its own panel (the Ladder's ten masters, a
   CPU's difficulty, your friends). */
function Lobby({ mons, level, record, ladder, custom, onMode, onTutor, onStart, onOnline, onEdit, onHowto }) {
  const [mode, setMode0] = useState(() => { const m = pref(MODE_KEY, "ladder"); return MODE_NAME[m] && (m !== "friends" || CLOUD) ? m : "ladder"; });
  const [cpu, setCpu0] = useState(() => pref(LEVEL_KEY, "normal"));
  const [floor, setFloor0] = useState(() => pref(FLOOR_KEY, "random"));
  const setMode = (v) => { setMode0(v); keep(MODE_KEY, v); };
  const setCpu = (v) => { setCpu0(v); keep(LEVEL_KEY, v); };
  const setFloor = (v) => { setFloor0(v); keep(FLOOR_KEY, v); };
  const next = LADDER.find((m) => !ladder.includes(m.id)) ?? LADDER.at(-1);
  const [master, setMaster] = useState(next.id);
  const chosen = masterOf(master) ?? next;
  const paid = record?.day === dayKey() ? record.won : [];
  const best = useMemo(() => {
    let mem = {};
    try { mem = JSON.parse(localStorage.getItem(RECORD_KEY) || "{}") || {}; } catch { /* a convenience */ }
    const grades = Object.entries(mem).filter(([k]) => k !== "streak").map(([, g]) => g).filter((g) => GRADES.includes(g));
    return { grade: grades.sort((a, b) => GRADES.indexOf(a) - GRADES.indexOf(b))[0] ?? null, streak: mem.streak ?? 0 };
  }, []);
  const seed = () => (Date.now() & 0x7fffffff) | 1;
  const ready = mons.length > 0;
  const go = () => {
    if (!ready) { onEdit(); return; }
    if (mode === "ladder") onStart({ mode: chosen.cpu, master: chosen, seed: seed(), floor: chosen.arena });
    else if (mode === "quick" || mode === "training") {
      const s = seed();
      onStart({ mode: mode === "training" ? "dummy" : cpu, seed: s, floor: pickFloor(floor, s), pick: floor });
    }
  };
  const bg = mode === "ladder" ? chosen.arena : floor === "random" ? "indigo" : floor;
  const summary = mode === "ladder" ? `${chosen.name} · Lv ${chosen.level} · ${floorName(chosen.arena)}`
    : mode === "training" ? `A dummy that never hits back · ${floor === "random" ? "Any arena" : floorName(floor)}`
      : mode === "quick" ? `${cpu[0].toUpperCase()}${cpu.slice(1)} CPU · ${floor === "random" ? "Any arena" : floorName(floor)}` : "";
  const prize = mode === "ladder"
    ? (ladder.includes(chosen.id) ? "Practice - its prize is won" : `First win ¥${ladderPay(chosen).toLocaleString()}${chosen.id === "champion" ? " + a card pack" : ""}`)
    : mode === "quick" ? (paid.includes(cpu) ? "Today's prize is won" : `First win today ¥${arenaPay(cpu, level).toLocaleString()}`) : "";

  return (
    <div className="tc-page ag-page" role="dialog" aria-modal="true" aria-label="The Arena" style={{ "--ag-bg": `url(${asset(`arena/${bg}.webp`)})` }}>
      <i className="ag-bg" aria-hidden="true" />
      <div className="ag-wrap">
        {onMode && <BattleSwitch on="arena" onPick={onMode} />}
        <header className="ag-head">
          <div className="ag-brand">
            <span className="ag-mark" aria-hidden="true"><Icon n="arena" size={24} /></span>
            <div>
              <h2>Arena</h2>
              <span>Real-time Pokémon battles</span>
            </div>
          </div>
          <div className="ag-stats">
            <span className="ag-stat"><b>{ladder.length}<u>/{LADDER.length}</u></b><i>Ladder</i></span>
            <span className="ag-stat"><b className={best.grade ? `g-${best.grade}` : ""}>{best.grade ?? "-"}</b><i>Best grade</i></span>
            <span className="ag-stat"><b>{best.streak}</b><i>Win streak</i></span>
            <button type="button" className="ag-help" onClick={onHowto}><Icon n="help" size={18} /><span>How to play</span></button>
          </div>
        </header>

        <div className="ag-grid">
          <section className="ag-team" aria-label="Your team">
            <div className="ag-sec">
              <h3>Your team</h3>
              <button type="button" className="ag-edit" onClick={onEdit}><Icon n="edit" size={16} />Edit</button>
            </div>
            <ol className="ag-mons">
              {Array.from({ length: ARENA_TEAM }, (_, k) => {
                const m = mons[k];
                if (!m) {
                  return (
                    <li key={k} className="ag-mon empty">
                      <button type="button" onClick={onEdit}><Icon n="plus" size={22} /><span>Add a Pokémon</span></button>
                    </li>
                  );
                }
                const f = playerFighter(m);
                const sp = speciesById(m.species);
                return (
                  <li key={m.uid} className="ag-mon">
                    <span className="ag-slot" aria-label={`Slot ${k + 1}`}>{k + 1}</span>
                    <Sprite id={m.species} variant={variantOf(m)} />
                    <button type="button" className="ag-learn" onClick={() => onTutor(m.uid)} aria-label={`Teach ${nameOf(m.species)} moves`}>Moves</button>
                    <div className="ag-mon-text">
                      <b>{nameOf(m.species)}</b>
                      <span>Lv {m.level} · <em className={`ag-role r-${roleOf(f)}`} data-tip={ROLE[roleOf(f)][1]}>{ROLE[roleOf(f)][0]}</em></span>
                      <Types of={sp.types} />
                      <ul className="ag-moves">
                        {f.moves.map((mv) => {
                          const data = moveOf(mv.i), shape = shapeOf(data);
                          return <li key={mv.i} className={`t-${data.t ?? "normal"}${shape ? "" : " off"}`} data-tip={shape ? SHAPE_WORD[shape] : "Not played in the Arena"}>{moveName(mv.i)}</li>;
                        })}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="ag-note">{custom ? "Your Arena team - apart from your League team." : "Your League team's first three. Edit to pick an Arena team of its own."}</p>
          </section>

          <section className="ag-play" aria-label="Choose how to fight">
            <div className="ag-modes" role="radiogroup" aria-label="Mode">
              <ModeTile id="ladder" mode={mode} onPick={setMode} floor={next.arena}
                title="Arena Ladder" says={`${ladder.length >= LADDER.length ? "Every master beaten" : `Next: ${next.name}`}`}>
                <Sprite id={next.team.at(-1)[0]} />
                <span className="ag-pips" aria-label={`${ladder.length} of ${LADDER.length} beaten`}>
                  {LADDER.map((m) => <i key={m.id} className={ladder.includes(m.id) ? "on" : m.id === next.id ? "next" : ""} />)}
                </span>
              </ModeTile>
              <ModeTile id="quick" mode={mode} onPick={setMode} floor="caldera" title="Quick battle" says="A CPU team at your level">
                <span className="ag-vs" aria-hidden="true">VS</span>
              </ModeTile>
              <ModeTile id="training" mode={mode} onPick={setMode} floor="grove" title="Training" says="Practise on a dummy">
                <Icon n="board" size={34} />
              </ModeTile>
              {CLOUD && (
                <ModeTile id="friends" mode={mode} onPick={setMode} floor="seaside" title="Battle a friend" says="Live, online">
                  <Icon n="users" size={34} />
                </ModeTile>
              )}
            </div>

            <div className="ag-panel">
              {mode === "ladder" && <LadderBoard ladder={ladder} chosen={chosen.id} onPick={setMaster} />}
              {mode === "quick" && (
                <div className="ag-levels" role="radiogroup" aria-label="Difficulty">
                  {ARENA_LEVELS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={cpu === c} className={`ag-level${cpu === c ? " on" : ""}`} onClick={() => setCpu(c)}>
                      <b>{c[0].toUpperCase() + c.slice(1)}</b>
                      <span>{LEVEL_SAYS[c]}</span>
                      <em className={paid.includes(c) ? "done" : ""}>{paid.includes(c) ? "Today's prize won" : `First win today ¥${arenaPay(c, level).toLocaleString()}`}</em>
                    </button>
                  ))}
                </div>
              )}
              {mode === "training" && (
                <p className="ag-say">A dummy walks a slow square and never hits back. Try every move, the basic attack's rhythm, rolling through and your ULTI - nothing is at stake.</p>
              )}
              {mode === "friends" && <FriendBattles mons={mons} floor={floor} onStart={onOnline} />}
            </div>

            {mode !== "ladder" && (
              <div className="ag-floors-wrap">
                <h3 className="ag-h">Arena</h3>
                <div className="ag-floors" role="radiogroup" aria-label="Arena">
                  {[{ id: "random", name: "Any arena" }, ...ARENAS].map((a) => (
                    <button key={a.id} type="button" role="radio" aria-checked={floor === a.id} className={`ag-floor${floor === a.id ? " on" : ""}`} onClick={() => setFloor(a.id)}>
                      {a.id === "random" ? <span className="ag-any">?</span> : <img src={asset(`arena/${a.id}.webp`)} alt="" loading="lazy" />}
                      <b>{a.name}</b>
                    </button>
                  ))}
                </div>
                <p className="ag-say">{floor === "random" ? "Each arena has its own ground, cover in its own material, and two zones that open every 30 s."
                  : <><b>{floorName(floor)}</b> {GROUND_SAYS[floor]} Its zones: {ZONE_SAYS[GROUND[floor].zone].toLowerCase()}.</>}</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {mode !== "friends" && (
        <div className="ag-go">
          <div className="ag-go-text">
            <b>{ready ? MODE_NAME[mode] : "Pick your team first"}</b>
            <span>{ready ? summary : "Three Pokémon from your Box fight in the Arena."}</span>
            {ready && prize && <em>{prize}</em>}
          </div>
          <button type="button" className="ag-battle" onClick={go}>
            <Icon n="arena" size={22} />{ready ? "Battle" : "Pick team"}
          </button>
        </div>
      )}
    </div>
  );
}

function ModeTile({ id, mode, onPick, floor, title, says, children }) {
  return (
    <button type="button" role="radio" aria-checked={mode === id} className={`ag-tile${mode === id ? " on" : ""}`} onClick={() => onPick(id)}
      style={{ "--tile": `url(${asset(`arena/${floor}.webp`)})` }}>
      <span className="ag-tile-art" aria-hidden="true">{children}</span>
      <b>{title}</b>
      <span>{says}</span>
    </button>
  );
}

/* THE LADDER, drawn as ten rungs: each master on its own floor with its
   ace, beaten ones ticked, the next lit; a tap chooses whom Battle fights
   (any already beaten, for practice, or the next). */
function LadderBoard({ ladder, chosen, onPick }) {
  const m = masterOf(chosen);
  return (
    <div className="ag-ladder">
      <ol className="ag-rungs">
        {LADDER.map((r, k) => {
          const beat = ladder.includes(r.id), open = ladderOpen(r.id, ladder);
          return (
            <li key={r.id}>
              <button type="button" disabled={!open} aria-pressed={chosen === r.id}
                className={`ag-rung${beat ? " won" : open ? " open" : " shut"}${chosen === r.id ? " on" : ""}${r.id === "champion" ? " champ" : ""}`}
                style={{ "--tile": `url(${asset(`arena/${r.arena}.webp`)})` }} onClick={() => onPick(r.id)}
                aria-label={`${r.name}, level ${r.level}${beat ? ", beaten" : open ? "" : ", locked"}`}>
                <span className="ag-rung-n">{k + 1}</span>
                <Sprite id={r.team.at(-1)[0]} />
                <span className="ag-rung-lv">Lv {r.level}</span>
                {beat && <span className="ag-tick" aria-hidden="true"><Icon n="check" size={12} /></span>}
                {!open && <span className="ag-lock" aria-hidden="true"><Icon n="lock" size={14} /></span>}
              </button>
            </li>
          );
        })}
      </ol>
      {m && (
        <div className="ag-master">
          <div>
            <b>{m.name}</b>
            <span>{floorName(m.arena)} · <i className={`ar-type t-${m.type}`}>{m.type}</i> · {m.cpu === "champion" ? "Champion" : m.cpu[0].toUpperCase() + m.cpu.slice(1)} CPU</span>
          </div>
          <span className="ag-master-team">{m.team.map(([id]) => <Sprite key={id} id={id} />)}</span>
        </div>
      )}
    </div>
  );
}

/* THE ARENA'S OWN THREE (asked for, 2026-10-22): the Box's picker, three at
   most, in fighting order - apart from the League's team, so a pick here
   never reorders that one. "Use my League team" goes back to its first three. */
function TeamEdit({ box, picked, custom, onSave, onClose }) {
  useModalLock();
  const mons = useMemo(() => box.filter((m) => !refusal(m) && !isEvent(m.species)), [box]);
  const [keys, setKeys] = useState(() => picked.map(keyOf));
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, []);
  const uids = keys.map((k) => mons.find((m) => keyOf(m) === k)?.uid).filter((u) => u != null);
  return createPortal(
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="ag-editor" role="dialog" aria-modal="true" aria-label="Arena team" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h3>Arena team</h3>
            <span>Pick up to three. The first one starts the fight; a tap on a picked one takes it out.</span>
          </div>
          <button type="button" className="ar-x" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="ag-editor-body">
          <Picker mons={mons} picked={keys} max={ARENA_TEAM} onChange={setKeys} prefer="high" sort="level" level
            empty="Catch a Pokémon first - the Arena fights with your Box." />
        </div>
        <footer>
          {custom && <button type="button" className="lg-go quiet" onClick={() => onSave([])}>Use my League team</button>}
          <button type="button" className="lg-go" disabled={!uids.length} onClick={() => onSave(uids)}>Save team</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* BATTLE A FRIEND: your accepted friends, each a Challenge; the challenges
   waiting for you, each an Accept. Polled while the lobby shows (no
   realtime subscription: the room is only for a match about to start). */
/* THE ARENA'S MOVE TUTOR (asked for, 2026-10-23: "learn move sets in the
   Arena" - and the Arena's cash sink): the League's own tutor (engine.tutor,
   TUTOR_PRICE a new move), shown the Arena's way - each move by how far it
   reaches (a blow, a shot, a blast) and whether it suits the Pokemon's role.
   Only moves the Arena plays are offered. What it teaches is the League's
   too; online play still sets every move (the Fair format). */
const KINDS = [["all", "All"], ["close", "Close"], ["range", "Ranged"], ["area", "Area"], ["self", "Self"]];
function MoveTutor({ engine, mon, money, stats, onClose }) {
  useModalLock();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, []);
  const taught = mon.moves?.join() ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => movesOf(mon), [mon.uid, mon.species, mon.level, taught]);
  const [draft, setDraft] = useState(now);
  const [slot, setSlot] = useState(0);
  const [kind, setKind] = useState("all");
  const [note, setNote] = useState(null);
  useEffect(() => { setDraft(now); setSlot(0); }, [now]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const can = useMemo(() => learnable(mon.species, mon.level).filter((i) => shapeOf(moveOf(i))), [mon.species, mon.level]);
  const role = roleOf(playerFighter(mon));
  const fits = (i) => REACH[shapeOf(moveOf(i))] === (role === "brawler" ? "close" : "range");
  const price = pricedAt(TUTOR_PRICE, stats);
  const fresh = draft.filter((i) => !now.includes(i)).length, cost = fresh * price;
  const shown = can.filter((i) => kind === "all" || REACH[shapeOf(moveOf(i))] === kind)
    .sort((a, b) => fits(b) - fits(a) || (moveOf(b).p ?? 0) - (moveOf(a).p ?? 0));
  const put = (i) => {
    if (draft.includes(i)) return;
    setDraft((d) => { const next = [...d]; next[Math.min(slot, next.length)] = i; return next.slice(0, 4); });
    setSlot((k) => Math.min(3, k + 1));
    setNote(null);
  };
  const teach = () => {
    const no = engine.tutor(mon.uid, draft.map((i) => MOVES[i].n), now.map((i) => MOVES[i].n));
    setNote(no ? { stale: "Its moves changed - open it again.", money: "Not enough money.", same: "Nothing new to teach." }[no] ?? "Could not teach that." : "Learned!");
  };
  const chip = (i) => {
    const data = moveOf(i), shape = shapeOf(data);
    return <><b>{moveName(i)}</b><i>{SHAPE_WORD[shape]}{data.p ? ` · ${data.p}` : ""}</i></>;
  };
  return createPortal(
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="ag-editor ag-tutor" role="dialog" aria-modal="true" aria-label="Move Tutor" onClick={(e) => e.stopPropagation()}>
        <header>
          <Sprite id={mon.species} variant={variantOf(mon)} alt="" />
          <div>
            <h3>{nameOf(mon.species)} <em className={`ag-role r-${role}`}>{ROLE[role][0]}</em></h3>
            <span>{ROLE[role][1]}. Tap a slot, then a move. ¥{price.toLocaleString()} for each new one - you have ¥{money.toLocaleString()}.</span>
          </div>
          <button type="button" className="ar-x" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="ag-editor-body">
          <ol className="ag-slots" aria-label="Its four moves">
            {[0, 1, 2, 3].map((k) => {
              const i = draft[k];
              return (
                <li key={k}>
                  <button type="button" aria-pressed={slot === k} onClick={() => setSlot(k)}
                    className={`${i != null ? `t-${moveOf(i).t}` : "empty"}${i != null && !now.includes(i) ? " new" : ""}`}>
                    {i != null ? chip(i) : <b>Empty</b>}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="ag-kinds" role="radiogroup" aria-label="Reach">
            {KINDS.map(([id, name]) => <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}>{name}</button>)}
          </div>
          <ul className="ag-learnlist">
            {shown.map((i) => (
              <li key={i}>
                <button type="button" className={`t-${moveOf(i).t}${fits(i) ? " fits" : ""}`} disabled={draft.includes(i)} onClick={() => put(i)}
                  data-tip={fits(i) ? `Suits a ${ROLE[role][0]}` : undefined}>{chip(i)}{fits(i) && <u className="ag-fit">Suits it</u>}</button>
              </li>
            ))}
          </ul>
        </div>
        <footer>
          {note && <span className="ag-tutor-note" role="status">{note}</span>}
          <button type="button" className="lg-go quiet" disabled={!fresh} onClick={() => setDraft(now)}>Undo</button>
          <button type="button" className="lg-go" disabled={!fresh || cost > money} onClick={teach}>
            {fresh ? `Teach ${fresh} · ¥${cost.toLocaleString()}` : "Teach"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

const POLL_MS = 4000;
function FriendBattles({ mons, floor, onStart }) {
  const [friends, setFriends] = useState(null);
  const [invites, setInvites] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const can = CLOUD && signedIn();
  useEffect(() => {
    if (!can) return undefined;
    let live = true;
    myFriends().then((got) => { if (live) setFriends(got.ok ? got.data.filter((f) => f.status === "accepted").map((f) => f.card) : []); });
    const poll = () => {
      if (document.hidden) return;
      arenaInvites().then((got) => { if (live && got.ok) setInvites(got.data.filter((i) => !i.mine && i.status === "open")); });
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, [can]);
  if (!CLOUD) return null;
  const challenge = async (card) => {
    setBusy(true); setMsg("");
    const ground = floor === "random" ? ARENAS[Math.floor(Math.random() * ARENAS.length)].id : floor;
    const got = await arenaChallenge(card.user_id, ground);
    setBusy(false);
    if (!got.ok) setMsg(got.error);
    else if (!got.data) setMsg(`You and ${card.username} are not friends any more.`);
    else onStart({ role: "host", invite: got.data, friend: card });
  };
  const answer = async (inv, yes) => {
    setBusy(true); setMsg("");
    const got = await arenaAnswer(inv.id, yes);
    setBusy(false);
    setInvites((list) => list.filter((i) => i.id !== inv.id));
    if (!yes) return;
    if (!got.ok) setMsg(got.error);
    else if (!got.data) setMsg(`${inv.card.username}'s challenge has gone - it may have been taken back or expired.`);
    else onStart({ role: "guest", invite: got.data, friend: inv.card });
  };
  return (
    <div className="ag-friends">
      <p className="ag-say">Live, both of you at once. The Fair format: your team's species at Lv {FAIR_LEVEL} with their level-up moves. No prize and no rating - just the fight.</p>
      {!can ? <p className="ag-say">Sign in to battle your friends online.</p> : (
        <>
          {invites.map((inv) => (
            <div key={inv.id} className="ar-invite" role="status">
              <span><b>{inv.card.username}</b> challenges you · {floorName(inv.arena)}</span>
              <button type="button" className="lg-go" disabled={busy || !mons.length} onClick={() => answer(inv, true)}>Accept</button>
              <button type="button" className="lg-go quiet" disabled={busy} onClick={() => answer(inv, false)}>Decline</button>
            </div>
          ))}
          {friends == null ? <p className="ag-say">Loading your friends…</p>
            : friends.length ? (
              <ul className="ar-friends">
                {friends.map((c) => (
                  <li key={c.user_id}>
                    <b>{c.username}</b>
                    <button type="button" className="lg-go quiet" disabled={busy || !mons.length} onClick={() => challenge(c)}>Challenge</button>
                  </li>
                ))}
              </ul>
            ) : <p className="ag-say">Add friends on your trainer card to battle them here.</p>}
          {msg && <p className="ar-note" role="alert">{msg}</p>}
        </>
      )}
    </div>
  );
}

/* AN ONLINE MATCH between friends: the link (net.js), the handshake - each
   end's rules print and team - then matches on that link until someone
   leaves. A rematch is a new round on the same link with the next seed. */
const nextSeed = (seed) => (Math.imul(seed, 1103515245) + 12345) | 0;
// A team as the Fair format builds it, hashed: both ends must build the same fighters.
const fairPrint = (ids) => hash(JSON.stringify(fairTeam(ids)));
const fairIds = (ids) => (Array.isArray(ids) ? ids : []).filter((id) => Number.isInteger(id) && speciesById(id) && !isEvent(id)).slice(0, ARENA_TEAM);
const SAYS = {
  timeout: (n, host) => (host ? `${n} didn't answer in time.` : `Could not reach ${n}'s game.`),
  blocked: (n) => `Could not connect to ${n}: your two networks can't reach each other directly. Try another Wi-Fi, or mobile data.`,
  handshake: (n) => `The link to ${n} dropped while it was being set up. Try the challenge again.`,
  offline: () => "Could not reach the server. Check your connection and try again.",
  signin: () => "Sign in to battle your friends.",
  version: (n) => `You and ${n} are playing different versions of the game. Reload the page, both of you, and try again.`,
  team: (n) => `${n}'s team could not be read.`,
  declined: (n) => `${n} declined.`,
  expired: () => "The challenge expired.",
  left: (n) => `${n} left.`,
};
function Online({ start, mons, onExit: done }) {
  const host = start.role === "host", foe = start.friend.username;
  /* Leaving takes a challenge back - here, never in an effect's cleanup,
     which a development build runs once at mount (StrictMode) and which
     cancelled every challenge the moment it was made. */
  const onExit = () => { if (host) arenaCancel(start.invite.id); done(); };
  /* ...and so does leaving any other way (another tab, the Arena page
     closing): a cancel queued at unmount and taken back by a remount, so
     StrictMode's rehearsal unmount cancels nothing. */
  const unmounting = useRef(0);
  useEffect(() => {
    clearTimeout(unmounting.current);
    return () => { if (host) unmounting.current = setTimeout(() => arenaCancel(start.invite.id), 0); };
  }, [host, start]);
  const [phase, setPhase] = useState("connecting");   // connecting | hello | playing | failed
  const [why, setWhy] = useState(null);
  const [round, setRound] = useState(0);
  const [again, setAgain] = useState({ me: false, them: false });
  const [left, setLeft] = useState(120);
  const box = useRef({ link: null, theirs: null, ls: null, early: [], round: 0 });
  // The team as it stood when the challenge was made: a Box change mid-match must not rebuild the link.
  const [mine] = useState(() => {
    const ids = fairIds(mons.map((m) => m.species));
    return { ids, shiny: ids.map((id) => variantOf(mons.find((m) => m.species === id)) === "shiny") };
  });
  useEffect(() => {
    let live = true;
    const b = box.current;
    const fail = (w) => { if (live) { setWhy(w); setPhase("failed"); } };
    const c = connect({ room: start.invite.room, host });
    // The challenger watches for a decline while it waits.
    const poll = host ? setInterval(async () => {
      const got = await arenaInvites();
      if (!got.ok || b.link) return;
      const it = got.data.find((i) => i.id === start.invite.id);
      // Accepted: the link is coming, and a late poll must not call it expired.
      if (it?.status === "accepted") clearInterval(poll);
      else if (!it || it.status === "declined") { c.cancel(); fail(it ? "declined" : "expired"); }
    }, POLL_MS) : 0;
    c.then((res) => {
      clearInterval(poll);
      if (!live) { res.link?.close(); return; }
      if (!res.ok) { if (res.why !== "cancelled") fail(res.why); return; }
      const link = res.link;
      b.link = link;
      setPhase("hello");
      link.onclose = () => { if (live) { setWhy("left"); setPhase((p) => (p === "playing" ? p : "failed")); } };
      link.listen((m) => {
        if (m.t === "hello") {
          const ids = fairIds(m.team);
          if (!ids.length) { link.close(); fail("team"); return; }
          // The same rules AND the same two teams built here as there: data a print never plays is caught now, not as a desync.
          if (m.print !== rulesPrint() || m.fair !== fairPrint(ids)) { link.close(); fail("version"); return; }
          b.theirs = { ids, shiny: ids.map((_, k) => Boolean(m.shiny?.[k])) };
          setPhase("playing");
        } else if (m.t === "again") setAgain((a) => ({ ...a, them: true }));
        else if (m.t === "bye") { setWhy("left"); setPhase((p) => (p === "playing" ? p : "failed")); link.close(); }
        else if (m.t === "in" || m.t === "hash") {
          /* This round's to its lockstep; anything before its lockstep listens
             is KEPT - this round's too. Each tick's input is sent once, so one
             dropped before the match attached froze it for good. */
          if (b.ls && m.r === b.round) b.ls.hear(m);
          else if (m.r >= b.round) b.early.push(m);
        }
      });
      link.send({ t: "hello", print: rulesPrint(), fair: fairPrint(mine.ids), team: mine.ids, shiny: mine.shiny });
    });
    /* A page closed mid-match says so on its way out: unannounced, the other
       end waited out its stall clock (12 s) or the browser's own, far longer. */
    const bye = () => b.link?.send({ t: "bye" });
    addEventListener("pagehide", bye);
    return () => {
      live = false; clearInterval(poll); c.cancel();
      removeEventListener("pagehide", bye);
      if (b.link) { b.link.send({ t: "bye" }); b.link.close(); }
    };
  }, [start, host, mine]);
  // The challenger's clock while it waits.
  useEffect(() => {
    if (phase !== "connecting" || !host) return undefined;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [phase, host]);
  // Both asked for a rematch: the next round, the next seed.
  useEffect(() => {
    if (again.me && again.them) { setAgain({ me: false, them: false }); setRound((r) => r + 1); }
  }, [again]);

  // One object a round: the match's loop restarts whenever it changes.
  const online = useMemo(() => {
    const b = box.current;
    if (phase !== "playing" || !b.theirs) return null;
    const sides = host ? [mine, b.theirs] : [b.theirs, mine];
    const me = host ? 0 : 1;
    return {
      link: b.link, me, round, foe,
      teams: sides.map((t) => fairTeam(t.ids)),
      looks: sides.map((t) => t.ids.map((id, k) => ({ id, shiny: t.shiny[k] }))),
      names: sides.map((t, k) => [k === me ? "You" : foe, nameOf(t.ids[0])]),
      /* This round's early messages are heard and still kept (StrictMode's
         rehearsal attaches a lockstep it throws away); older rounds' go. */
      attach(ls) { b.ls = ls; b.round = round; b.early = b.early.filter((m) => m.r >= round); for (const m of b.early) if (m.r === round) ls.hear(m); },
    };
  }, [phase, round, host, mine, foe]);
  if (online) {
    let seed = start.invite.seed;
    for (let k = 0; k < round; k++) seed = nextSeed(seed);
    return <Match key={round} mons={mons} mode="online" level={FAIR_LEVEL} seed={seed} floor={start.invite.arena} online={online}
      rematch={{ asked: again.me, offered: again.them, gone: why === "left" }}
      onWin={() => 0} onAgain={() => { box.current.link.send({ t: "again" }); setAgain((a) => ({ ...a, me: true })); }} onExit={onExit} />;
  }
  return (
    <div className="tc-page ag-page" role="dialog" aria-modal="true" aria-label="Online match" style={{ "--ag-bg": `url(${asset(`arena/${start.invite.arena}.webp`)})` }}>
      <i className="ag-bg" aria-hidden="true" />
      <div className="ag-wait">
        <span className="ag-kicker">Online · {floorName(start.invite.arena)}</span>
        {phase === "failed" ? (
          <>
            <h2>No match</h2>
            <p>{(SAYS[why] ?? SAYS.offline)(foe, host)}</p>
          </>
        ) : (
          <>
            <h2>{host && phase === "connecting" ? `Waiting for ${foe}` : `Connecting to ${foe}`}</h2>
            <p>{host && phase === "connecting"
              ? `Your challenge is waiting in ${foe}'s Arena. It expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}.`
              : "Linking your two games…"}</p>
            <span className="ar-spin" aria-hidden="true" />
          </>
        )}
        <button type="button" className="lg-go quiet" onClick={onExit}>{phase === "failed" ? "Back to the Arena" : "Cancel"}</button>
      </div>
    </div>
  );
}

/* HOW TO PLAY: every control on every device, from the same constants the
   match reads, and the sprites' credits (CC BY-NC 4.0 asks for them). */
function HowTo({ onClose }) {
  useModalLock();
  const [credits, setCredits] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape" && !credits) { e.stopPropagation(); close.current(); } };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [credits]);
  const row = (keys, what) => <li><span className="ag-keys">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span><span>{what}</span></li>;
  return createPortal(
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="ag-howto" role="dialog" aria-modal="true" aria-label="How to play" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>How to play</h3>
          <button type="button" className="ar-x" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="ag-howto-body">
          <section>
            <h4>Keyboard and mouse</h4>
            <ul>
              {row(["W", "A", "S", "D"], "Move")}
              {row(["Mouse"], "Aim")}
              {row(["LMB"], "Basic attack - hold it to keep attacking")}
              {row(SKILL_KEYS, "Your four moves")}
              {row(["Space"], "Dodge: you cannot be hit while you roll")}
              {row(["F"], "ULTI, when the meter is full")}
              {row(["G"], "Use the X item you are holding")}
              {row(["1", "2", "3"], "Send out that Pokémon (Tab: the next one)")}
              {row(["Esc"], "Pause")}
            </ul>
          </section>
          <section>
            <h4>Touch</h4>
            <ul>
              <li>The left thumb moves. The big button attacks - hold it; the four around it are your moves. Attacks aim at the foe by themselves.</li>
              <li>Tap a Pokémon at the top left to send it out. A held X item shows in its slot beside Dodge - tap to use it.</li>
            </ul>
          </section>
          <section>
            <h4>Controller</h4>
            <ul>
              {row(["RT"], "Basic attack (hold)")}
              {row(["A", "B", "X", "Y"], "Your four moves")}
              {row(["RB"], "Dodge")}
              {row(["LT"], "ULTI")}
              {row(["LB"], "Next Pokémon")}
              {row(["D-pad up"], "Use your held item")}
            </ul>
          </section>
          <section>
            <h4>The fight</h4>
            <ul>
              <li><b>The basic attack</b> never runs out and every third in a row hits harder. A fighter whose Attack is higher jabs up close; one whose Sp. Atk is higher throws a bolt.</li>
              <li><b>Moves</b> hit with the League's own damage - types, STAB and all - and each has a cooldown and its PP.</li>
              <li><b>Every attack shows on the ground</b> before it lands: a line, an arc or a ring. Roll through it at the last moment - a <b>perfect dodge</b>.</li>
              <li><b>ULTI</b> fills as you land hits, take them, dodge perfectly and hold a zone. Full, it throws the foe off you, powers you up for {SURGE_T / TPS} s and looses your Pokémon's signature: a storm of strikes, a blast all round, a huge cannon or a barrage - Pikachu calls down Thunder, Charizard Blast Burn. Every strike shows on the ground first: roll out of it.</li>
              <li><b>Brawlers and Blasters</b>: a Pokémon whose Attack is higher is a Brawler - it runs and jabs faster, hits harder with blows and dashes and takes less from shots. One whose Sp. Atk is higher is a Blaster - its shots fly faster and farther and its beams charge sooner. Teach either the moves that suit it (Moves, on each team card).</li>
              <li><b>Double Team</b> makes two copies either side of its user that move with it. A hit that reaches a copy first pops it - "Miss!" - and the foe cannot tell which is real.</li>
              <li><b>Weather</b>, one a match: rain powers Water, weakens Fire and slows Fire types; harsh sun the other way round; a sandstorm chips all but Rock, Ground and Steel types, snow all but Ice.</li>
              <li><b>Type combos</b>: Water on a burned Pokémon puts the burn out in a cloud of steam that hides whoever stands in it. Water soaks, and Electric on a soaked Pokémon hits half again as hard.</li>
              <li><b>Mid-match</b>: a legendary may fly over and drop a Full Restore in the middle - half your HP, any status cured, half an ULTI. And the lights may go out: only what glows is seen, and the foe only up close.</li>
              <li><b>Sudden death</b>: out of time with as many Pokémon standing on each side, everyone drops to 1 HP for {SUDDEN_T / TPS} more seconds. The next hit wins.</li>
              <li><b>Power-ups</b> drop in pairs, one on each half: a Potion, a Full Heal or a Shiny Stone works when you touch it; an X Attack, X Speed or X Defense is held until you use it.</li>
              <li><b>Clutch</b>: when both Pokémon are nearly down and one winds up, time slows. Make it count.</li>
              <li><b>Statuses</b> tick in real time: burn and poison hurt every 2 s, paralysis slows you, sleep and freeze hold you still.</li>
            </ul>
          </section>
          <p className="ag-say">The Arena's Pokémon are drawn by the artists of the PMD Sprite Repository (CC BY-NC 4.0). <button type="button" className="ar-link" onClick={() => setCredits(true)}>Sprite credits</button></p>
        </div>
      </div>
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>,
    document.body,
  );
}

/* WHO DREW THE ARENA'S SPRITES (CC BY-NC 4.0 asks for it): every artist, and
   a search for who drew a given Pokemon. credits.json is fetched only when
   this opens (`npm run pmd` writes it). */
function Credits({ onClose }) {
  useModalLock();
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  // The parent's arrow is new every render (the lobby polls): read it through a ref.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let live = true;
    fetch(asset(`arena/pmd/credits.json?v=${PMD_REV}`)).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      .then((got) => { if (live) setData(got); });
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
    addEventListener("keydown", key, true);
    return () => { live = false; removeEventListener("keydown", key, true); };
  }, []);
  const artists = useMemo(() => [...new Set(Object.values(data ?? {}).flat())].sort((a, b) => a.localeCompare(b)), [data]);
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!data || t.length < 2) return [];
    return Object.entries(data).map(([id, who]) => [Number(id), who])
      .filter(([id]) => nameOf(id)?.toLowerCase().includes(t)).slice(0, 24);
  }, [data, q]);
  return createPortal(
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="ar-credits" role="dialog" aria-modal="true" aria-label="Sprite credits" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Sprite credits</h3>
          <button type="button" className="ar-x" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <p>The Arena's Pokémon are from the <b>PMD Sprite Repository</b> (sprites.pmdcollab.org), shared under CC BY-NC 4.0. The original Mystery Dungeon sprites belong to Nintendo, Creatures, Game Freak and Spike Chunsoft.</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who drew… (a Pokémon's name)" aria-label="Find a Pokémon" />
        <div className="ar-credits-body">
          {data == null ? <p className="ev-quiet">Loading…</p> : q.trim().length >= 2 ? (
            found.length ? (
              <ul className="ar-credit-list">
                {found.map(([id, who]) => <li key={id}><b>{nameOf(id)}</b><span>{who.join(", ") || "Unknown"}</span></li>)}
              </ul>
            ) : <p className="ev-quiet">No Arena sprite by that name.</p>
          ) : (
            <p className="ar-artists">{artists.join(" · ")}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const LEVEL_NAME = { dummy: "Training", easy: "Easy", normal: "Normal", hard: "Hard" };

/* A MATCH: the loop, the input, the HUD. */
function Match({ mons, mode, master, level, seed, floor, online = null, rematch = null, onWin, onAgain, onExit }) {
  const me = online?.me ?? 0;
  const [net, setNet] = useState(null);         // an online match cut short: "left", "lost", "desync"
  useEffect(() => { if (rematch?.gone) setNet("left"); }, [rematch?.gone]);
  const canvas = useRef(null);
  const [view, setView] = useState(null);
  const [paused, setPaused] = useState(false);
  const [touch] = useState(touchDevice);
  const [prize, setPrize] = useState(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  // The prize is the parent's, held in a ref: a fresh callback each render
  // would restart the match loop (and a paid prize re-renders the parent).
  const win = useRef(onWin);
  win.current = onWin;
  /* `basic` is HELD (a mouse button, a key, a thumb, a trigger) and read
     every tick; a move, a roll, a switch and a surge are presses, held a
     few ticks until the match can take them. */
  const input = useRef({ keys: new Set(), mouse: null, fire: null, basic: { mouse: false, touch: false, pad: false }, dodge: 0, swap: -1, surge: 0, use: 0, stick: [0, 0], pad: [],
    aim: null });
  // The dragged move's arrow on the court and its Cancel, moved by the loop (never a render).
  const aimEl = useRef(null);
  const cancelEl = useRef(null);
  /* UPRIGHT ON A PHONE the court plays small: before the first count the
     match asks to be turned (paused until then, offline), and "Play upright"
     is remembered on the device. Online nothing waits: a line says it. */
  const [turn, setTurn] = useState(() => touch && !online && pref(UPRIGHT_KEY, "") !== "1" && matchMedia("(orientation: portrait)").matches);
  const turnRef = useRef(turn);
  turnRef.current = turn;
  useEffect(() => {
    if (!turn) return undefined;
    const mq = matchMedia("(orientation: portrait)");
    const on = () => { if (!mq.matches) setTurn(false); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [turn]);
  const cpu = online ? null : master ? master.cpu : mode;

  /* THE MATCH IS BUILT ONCE, at mount (reported 2026-10-23: "the battle
     suddenly restarts in the middle of the match"). Its teams were a memo
     over the Box, and the Box is a new array whenever the save moves - a
     prize paid, a walk notice - so a new match was built and the loop
     restarted on it. A rematch and an online round remount (`key`). */
  const [{ teams, looks, s, names }] = useState(() => {
    const teams = online ? online.teams : [
      mons.map((m) => playerFighter(m)),
      master ? masterTeam(master) : cpuTeam(seed, level, Math.max(1, mons.length)),
    ];
    return {
      teams,
      looks: online ? online.looks : [
        mons.map((m) => ({ id: m.species, shiny: variantOf(m) === "shiny" })),
        teams[1].map((f) => ({ id: f.id, shiny: false })),
      ],
      s: newMatch({ teams, cpu: [null, online ? null : cpu], seed, arena: floor, intro: INTRO }),
      // Who fights, for the VS card.
      names: online ? online.names : [["You", nameOf(teams[0][0]?.id)],
        [master ? master.name : `CPU · ${LEVEL_NAME[mode] ?? "Training"}`, nameOf(teams[1][0]?.id)]],
    };
  });

  useEffect(() => {
    const cv = canvas.current;
    const r = createRenderer(cv, looks, floor, { names, me, moves: s.sides.flatMap((sd) => sd.team.flatMap((f) => f.kit.map((m) => m.i))),
      ults: s.sides.flatMap((sd) => sd.team.map((f) => ({ id: f.id, type: ultOf(f).type }))) });
    // Online: the match steps only with both inputs for a tick (arena.js's lockstep).
    const ls = online ? lockstep(online.link, me, online.round) : null;
    if (ls) online.attach(ls);
    let lastStep = performance.now(), cut = false;
    const end = (why) => { if (!cut) { cut = true; setNet(why); } };
    const onResize = () => r.resize();
    addEventListener("resize", onResize);
    // A phone's URL bar coming and going resizes only the visual viewport.
    visualViewport?.addEventListener("resize", onResize);
    let raf = 0, last = performance.now(), acc = 0, lastHud = 0, paid = false, shown = false;
    const step = 1000 / TPS;
    const inp = input.current;

    // A controller, read once a frame: sticks past a dead zone, buttons on their press, the trigger while held.
    const pad = () => {
      const gp = navigator.getGamepads?.()?.find(Boolean);
      if (!gp) { inp.basic.pad = false; return null; }
      const dz = (v) => (Math.abs(v) < 0.25 ? 0 : v);
      const was = inp.pad, now = gp.buttons.map((b) => b.pressed);
      const pressed = (i) => now[i] && !was[i];
      inp.pad = now;
      for (let k = 0; k < 4; k++) if (pressed(k)) inp.fire = { k, until: s.t + PRESS };
      if (pressed(5)) inp.dodge = s.t + 7;
      if (pressed(6)) inp.surge = s.t + 7;
      if (pressed(4) || pressed(15)) inp.swap = nextAlive(s, me, 1);
      if (pressed(14)) inp.swap = nextAlive(s, me, -1);
      if (pressed(12)) inp.use = s.t + 7;
      if (pressed(9)) setPaused((p) => !p);
      inp.basic.pad = Boolean(now[7]);
      return { mx: dz(gp.axes[0] ?? 0), my: dz(gp.axes[1] ?? 0), ax: dz(gp.axes[2] ?? 0), ay: dz(gp.axes[3] ?? 0) };
    };

    const build = () => {
      const mine = activeOf(s, me), foe = activeOf(s, 1 - me);
      const k = inp.keys;
      let mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      let my = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
      if (inp.stick[0] || inp.stick[1]) [mx, my] = inp.stick;
      let ax = 0, ay = 0;
      const gp = pad();
      if (gp && (gp.mx || gp.my)) { mx = gp.mx; my = gp.my; }
      if (gp && (gp.ax || gp.ay)) { ax = gp.ax * 5; ay = gp.ay * 5; }
      else if (mine && touch) {
        /* A THUMB CANNOT AIM: touch attacks go at the foe by themselves -
           never one hidden in tall grass, which is still where it was seen. */
        if (foe && !foe.hidden) { ax = foe.x - mine.x; ay = foe.y - mine.y; }
      } else if (mine && inp.mouse) {
        // The aim in TILES, so a hazard lands where the cursor is.
        const [px, py] = r.toScreen(mine.x, mine.y), tile = r.tile();
        ax = (inp.mouse[0] - px) / tile; ay = (inp.mouse[1] - py) / tile;
      }
      // A move dragged to aim goes where the thumb pulled.
      if (inp.fire?.aim && inp.fire.until > s.t) [ax, ay] = inp.fire.aim;
      // A press is held for a few ticks until the move or roll can take it.
      const fire = inp.fire && inp.fire.until > s.t ? inp.fire.k : -1;
      if (mine?.act && inp.fire && mine.act.k === inp.fire.k) inp.fire = null;
      const basic = inp.basic.mouse || inp.basic.touch || inp.basic.pad || k.has("j");
      const dodge = inp.dodge > s.t;
      if (mine?.dodge) inp.dodge = 0;
      const swap = inp.swap;
      inp.swap = -1;
      const surge = inp.surge > s.t;
      if (mine?.surge) inp.surge = 0;
      const use = inp.use > s.t;
      if (!s.sides[me].held) inp.use = 0;
      return { mx, my, ax, ay, fire, basic, dodge, swap, surge, use };
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      let dt = Math.min(250, now - last);
      last = now;
      if ((pausedRef.current || turnRef.current) && !ls) return;      // the picture holds as it was
      if (ls) {
        /* Online: the match steps with the wall clock at both ends (a hit-stop
           here would leave the other end waiting), one extra tick when the
           other end is ahead, and not at all without its input. */
        r.rate(dt, true);
        if (!s.over && !cut) {
          acc = Math.min(acc + dt, step * 8);
          let n = Math.floor(acc / step) + (ls.behind() ? 1 : 0);
          while (n-- > 0 && !s.over) {
            ls.feed(build);
            if (!ls.ready()) break;
            ls.step(s); r.take(s.ev, s);
            acc = Math.max(0, acc - step);
            lastStep = now;
          }
          if (ls.desync >= 0) end("desync");
          else if (now - lastStep > STALL_MS) end("lost");
        }
      } else {
        // Hit-stop and slow motion: the match steps at the picture's own rate.
        dt *= r.rate(dt);
        if (s.over) dt = 0;
        acc += dt;
        while (acc >= step) {
          tick(s, [build(), null]);
          r.take(s.ev, s);
          acc -= step;
          if (s.over) break;
        }
      }
      r.draw(s, Math.min(1, acc / step), now);
      // The dragged move's arrow, from your Pokemon toward the pull.
      const el = aimEl.current, a = inp.aim, at = activeOf(s, me);
      if (el) {
        if (a?.on && at) {
          const [px, py] = r.toScreen(at.x, at.y), len = Math.min(1, Math.hypot(a.dx, a.dy) / AIM_PX) * AIM_TILES * r.tile();
          el.style.transform = `translate(${px}px, ${py}px) rotate(${Math.atan2(a.dy, a.dx)}rad)`;
          el.style.width = `${len}px`;
          el.hidden = false;
        } else el.hidden = true;
      }
      if (s.over && !paid) {
        paid = true;
        setPrize(!online && s.winner === 0 && cpu !== "dummy" ? win.current(cpu) : 0);
      }
      // The result card waits for the ending to play.
      const ended = s.over && r.done();
      if (now - lastHud > 90 || (ended && !shown)) { lastHud = now; shown = ended; setView({ ...snapshot(s, me), over: ended }); }
    };
    raf = requestAnimationFrame(frame);
    // Online there is no pause: hidden, the other end waits (and gives up at STALL_MS).
    const onHide = () => { if (document.hidden && !ls) setPaused(true); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
      visualViewport?.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [s, looks, touch, floor, cpu, names, me, online]);

  // Keyboard and mouse.
  useEffect(() => {
    const inp = input.current;
    const press = (k) => { inp.fire = { k, until: s.t + PRESS }; };
    const down = (e) => {
      const key = e.key.toLowerCase();
      if (key === "escape") { e.preventDefault(); setPaused((p) => !p); return; }
      if (key === "tab") { e.preventDefault(); inp.swap = nextAlive(s, me, e.shiftKey ? -1 : 1); return; }
      // 1-3 send out that Pokemon: the party bar shows the numbers.
      if (/^[1-6]$/.test(e.key) && !e.repeat) { e.preventDefault(); inp.swap = Number(e.key) - 1; return; }
      if (key === " " || key === "shift") { e.preventDefault(); inp.dodge = s.t + 7; return; }
      if (key === "f") { e.preventDefault(); inp.surge = s.t + 7; return; }
      if (key === "g") { e.preventDefault(); inp.use = s.t + 7; return; }
      const skill = ["q", "e", "r"].indexOf(key);
      if (skill >= 0) { e.preventDefault(); press(skill + 1); return; }
      if (["w", "a", "s", "d", "j", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) { e.preventDefault(); inp.keys.add(key); }
    };
    const up = (e) => inp.keys.delete(e.key.toLowerCase());
    // The basic attack is held: a mouse button let go anywhere ends it, and so does losing the window.
    const mouseUp = (e) => { if (e.button === 0) inp.basic.mouse = false; };
    const blur = () => { inp.keys.clear(); inp.basic.mouse = false; inp.basic.touch = false; };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("pointerup", mouseUp);
    addEventListener("blur", blur);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("pointerup", mouseUp); removeEventListener("blur", blur); };
  }, [s, me]);

  const onMouseMove = (e) => {
    const b = canvas.current.getBoundingClientRect();
    input.current.mouse = [e.clientX - b.left, e.clientY - b.top];
  };
  const onMouseDown = (e) => {
    if (touch || e.pointerType === "touch") return;
    onMouseMove(e);
    if (e.button === 0) input.current.basic.mouse = true;
    if (e.button === 2) input.current.fire = { k: 0, until: s.t + PRESS };
  };
  // A thumb on a button: held for the basic attack, pressed for the rest.
  const hold = (on) => (e) => { e.preventDefault(); input.current.basic.touch = on; };
  const tap = (fn) => (e) => { e.preventDefault(); fn(); };
  /* A MOVE ON TOUCH, as a MOBA's: a tap throws it at the foe; a drag aims
     it (the arrow on the court shows where) and letting go throws it; let go
     over Cancel and it is not thrown. Window pointer events, no capture. */
  const aimStart = (k) => (e) => {
    e.preventDefault();
    input.current.aim = { k, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, on: false };
    if (cancelEl.current) cancelEl.current.hidden = false;
  };
  useEffect(() => {
    if (!touch) return undefined;
    const inp = input.current;
    const move = (e) => {
      const a = inp.aim;
      if (!a || e.pointerId !== a.id) return;
      a.dx = e.clientX - a.x0; a.dy = e.clientY - a.y0;
      a.on = Math.hypot(a.dx, a.dy) > AIM_DEAD;
      const c = cancelEl.current;
      if (c) { const b = c.getBoundingClientRect(); c.classList.toggle("hot", e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom); }
    };
    const up = (e) => {
      const a = inp.aim;
      if (!a || e.pointerId !== a.id) return;
      const c = cancelEl.current, cancelled = c?.classList.contains("hot");
      if (c) { c.hidden = true; c.classList.remove("hot"); }
      inp.aim = null;
      if (cancelled || e.type === "pointercancel") return;
      const k = Math.min(1, Math.hypot(a.dx, a.dy) / AIM_PX) * AIM_TILES / (Math.hypot(a.dx, a.dy) || 1);
      inp.fire = { k: a.k, until: s.t + PRESS, aim: a.on ? [a.dx * k, a.dy * k] : null };
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
  }, [touch, s]);

  const over = view?.over;
  const grade = useMemo(() => (over ? gradeOf(view) : null), [over]);
  /* WHAT THIS DEVICE REMEMBERS (never the save - a pride, not a prize): the
     best grade a mode has seen, and wins in a row against a CPU. Read and
     written once, when the result comes up. */
  const record = useMemo(() => {
    if (!over || !grade) return {};
    const key = online ? "online" : master ? `ladder:${master.id}` : mode;
    let mem = {};
    try { mem = JSON.parse(localStorage.getItem(RECORD_KEY) || "{}") || {}; } catch { /* a convenience */ }
    const best = !mem[key] || GRADES.indexOf(grade.letter) < GRADES.indexOf(mem[key]);
    if (best) mem[key] = grade.letter;
    const streak = online || cpu === "dummy" ? 0 : view.won ? (mem.streak ?? 0) + 1 : 0;
    if (!online && cpu !== "dummy") mem.streak = streak;
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(mem)); } catch { /* a convenience */ }
    return { best: best && view.won, streak };
  }, [over, grade]);
  /* PORTALLED TO THE BODY: a match owns the whole screen, over the page and
     its bars (`body.fighting`). */
  return createPortal(
    <div className={`ar-match${touch ? " touch" : ""}`}>
      <canvas ref={canvas} className="ar-canvas" onPointerMove={onMouseMove} onPointerDown={onMouseDown}
        onContextMenu={(e) => e.preventDefault()} aria-label="Arena" />
      {view && (
        <div className={`ar-hud${view.intro ? " intro" : ""}${view.over ? " over" : ""}`}>
          <Plate f={view.sides[0]} meter={view.meter[0]} who={names[me][0]} mine />
          <div className={`ah-clock${view.left <= FINAL_T && !view.over ? " final" : ""}${view.left <= 10 * TPS && !view.over ? " urgent" : ""}${view.sudden ? " sudden" : ""}`}>
            <b>{clock(view.left)}</b>
            <button type="button" onClick={() => setPaused(true)} aria-label="Pause"><Icon n="menu" size={16} /></button>
            {view.weather !== "clear" && <i className={`ah-weather w-${view.weather}`} data-tip={WEATHER_TIP[view.weather]}>{WEATHER_NAME[view.weather]}</i>}
            {view.dark && <i className="ah-weather w-dark">Lights out</i>}
          </div>
          <Plate f={view.sides[1]} meter={view.meter[1]} who={names[1 - me][0]} />

          <div className="ah-party" role="group" aria-label="Your team">
            {view.party.map((p, k) => (
              <button key={k} type="button" className={`ah-mon${p.active ? " on" : ""}${p.hp <= 0 ? " down" : ""}`}
                disabled={p.active || p.hp <= 0} style={{ "--hp": p.hp / p.max, "--cd": p.active || p.hp <= 0 ? 0 : view.swapCd }}
                onPointerDown={tap(() => { input.current.swap = k; })} aria-label={`Send out ${nameOf(p.id)}, ${p.hp} HP`}>
                <Sprite id={p.id} eager />
                <i className="ah-mon-hp" aria-hidden="true"><i /></i>
                {!touch && <kbd>{k + 1}</kbd>}
              </button>
            ))}
          </div>

          <div className="ah-skills">
            {view.kit.map((m, k) => {
              // Out of every damaging move: the empty buttons throw Struggle.
              const struggle = view.struggle && m.pp <= 0;
              return (
                <button key={k} type="button" className={`ah-skill k${k} t-${struggle ? "normal" : m.type}${(struggle ? view.struggleReady : m.ready) ? "" : " wait"}`}
                  style={{ "--cd": struggle ? view.struggleCd : m.cd }} disabled={m.pp <= 0 && !struggle}
                  onPointerDown={touch ? aimStart(k) : tap(() => { input.current.fire = { k, until: s.t + PRESS }; })}
                  aria-label={struggle ? "Struggle" : `${m.name}, ${m.pp} PP`}>
                  <b>{struggle ? "Struggle" : m.name}</b>
                  <span>{struggle ? "No PP" : `${m.pp}/${m.max}`}</span>
                  {!touch && <kbd>{SKILL_KEYS[k]}</kbd>}
                </button>
              );
            })}
            <button type="button" className={`ah-basic${view.basic.ready ? "" : " wait"}${view.basic.boost ? " boost" : ""}`} style={{ "--cd": view.basic.cd }}
              onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerCancel={hold(false)} onPointerLeave={hold(false)}
              aria-label="Basic attack - hold">
              <Icon n="arena" size={touch ? 30 : 24} />
              <b>{view.basic.jab ? "Jab" : "Bolt"}</b>
              {!touch && <kbd>LMB</kbd>}
            </button>
            {/* A HELD POWER-UP (arena.js PICKUPS): its slot, empty until one is picked up. */}
            <button type="button" className={`ah-item${view.held ? " full" : ""}`} disabled={!view.held}
              onPointerDown={tap(() => { input.current.use = s.t + 7; })}
              aria-label={view.held ? `Use ${PICKUPS[view.held].name}` : "No item held"} data-tip={view.held ? PICKUPS[view.held].says : "Pick up an X item on the floor"}>
              {view.held ? <img src={asset(`items/${view.held}.png`)} alt="" /> : <b>Item</b>}
              {!touch && <kbd>G</kbd>}
            </button>
            <button type="button" className={`ah-dodge${view.dodge ? "" : " wait"}`} style={{ "--cd": view.dodgeCd }}
              onPointerDown={tap(() => { input.current.dodge = s.t + 7; })} aria-label="Dodge">
              <b>Dodge</b>{!touch && <kbd>Space</kbd>}
            </button>
            <button type="button" className={`ah-surge${view.meter[0] >= 1 ? " full" : ""}${view.surging ? " on" : ""}`}
              style={{ "--m": view.surging ? 1 : view.meter[0] }} disabled={view.meter[0] < 1}
              onPointerDown={tap(() => { input.current.surge = s.t + 7; })} aria-label={view.meter[0] >= 1 ? "ULTI - ready" : `ULTI ${Math.floor(view.meter[0] * 100)}%`}>
              <b>ULTI</b><span>{view.surging ? "!" : view.meter[0] >= 1 ? "Ready" : `${Math.floor(view.meter[0] * 100)}%`}</span>
              {!touch && <kbd>F</kbd>}
            </button>
          </div>
          {touch && <Stick input={input} />}
          {touch && <i className="ah-aim" ref={aimEl} hidden aria-hidden="true" />}
          {touch && <span className="ah-cancel" ref={cancelEl} hidden>Cancel</span>}
          {touch && online && <p className="ar-turn">Turn your phone sideways for a bigger arena</p>}
        </div>
      )}
      {turn && (
        <div className="ar-pause ah-turn" role="dialog" aria-label="Turn your phone">
          <div className="ar-card">
            <span className="ah-phone" aria-hidden="true"><i /></span>
            <h3>Turn your phone sideways</h3>
            <p>The Arena plays best in landscape: a wider court, and room for both thumbs.</p>
            <button type="button" className="lg-go quiet" onClick={() => { keep(UPRIGHT_KEY, "1"); setTurn(false); }}>Play upright</button>
          </div>
        </div>
      )}
      {paused && !over && !net && (
        <div className="ar-pause" role="dialog" aria-label={online ? "Leave the match?" : "Paused"}>
          <div className="ar-card">
            <h3>{online ? "Leave the match?" : "Paused"}</h3>
            {online && <p>The match keeps going while you decide.</p>}
            <button type="button" className="lg-go" onClick={() => setPaused(false)}>{online ? "Keep playing" : "Resume"}</button>
            <button type="button" className="lg-go quiet" onClick={onExit}>{online ? "Leave" : "Leave the match"}</button>
          </div>
        </div>
      )}
      {net && !over && (
        <div className="ar-pause" role="dialog" aria-label="Match ended">
          <div className="ar-card">
            <span className="lg-kicker">Online</span>
            <h3>{net === "left" ? `${online.foe} left the match` : net === "lost" ? "Connection lost" : "Out of sync"}</h3>
            <p>{net === "left" ? "Nobody wins a match that was left." : net === "lost"
              ? `Nothing has come from ${online.foe}'s game for ${STALL_MS / 1000} seconds.`
              : "Your two games stopped agreeing on what happened, so the match was stopped. Reload the page, both of you, and try again."}</p>
            <button type="button" className="lg-go" onClick={onExit}>Back to the Arena</button>
          </div>
        </div>
      )}
      {over && (
        <div className="ar-pause ar-end" role="dialog" aria-label="Result">
          <div className={`ar-card ar-result ${view.won ? "won" : view.lost ? "lost" : "drew"}`}>
            <div className="ar-result-head">
              <h3>{view.won ? "You win!" : view.lost ? "You lost" : "A draw"}</h3>
              <span className="ar-why">{online ? `Online · ${view.why === "time" ? "Time" : "Knockout"}` : view.why === "time" ? "Time" : "Knockout"}</span>
              <b className={`ar-grade g-${grade.letter}`} aria-label={`Grade ${grade.letter}`}>{grade.letter}</b>
            </div>
            <dl className="ar-stats">
              <div><dt>Knocked out</dt><dd>{view.ko[1]} / {view.sides[1].size}</dd></div>
              <div><dt>Damage</dt><dd>{view.stats.dealt.toLocaleString()}</dd></div>
              <div><dt>Best combo</dt><dd>{view.stats.best}</dd></div>
              <div><dt>Perfect dodges</dt><dd>{view.stats.perfect}</dd></div>
              <div><dt>ULTIs</dt><dd>{view.stats.surges}</dd></div>
              <div><dt>Time</dt><dd>{clock(view.t)}</dd></div>
            </dl>
            {(record.best || record.streak > 1) && (
              <p className="ar-record">
                {record.best && <span>New best grade{online ? " online" : master ? ` against ${master.name}` : ""}!</span>}
                {record.streak > 1 && <span>{record.streak} wins in a row</span>}
              </p>
            )}
            {online && <p className="ar-prize done">A friendly match: no prize, no rating.</p>}
            {master && view.won && prize?.first && <p className="ar-prize">{master.name} beaten! ¥{prize.pay.toLocaleString()}{prize.pack ? " and a card pack in My Packs" : ""}</p>}
            {master && view.won && prize && !prize.first && <p className="ar-prize done">Practice: {master.name}'s prize was won before.</p>}
            {!master && prize > 0 && <p className="ar-prize">First win today: ¥{prize.toLocaleString()}</p>}
            {!master && !online && prize === 0 && view.won && cpu !== "dummy" && <p className="ar-prize done">Today's prize for this level is already won.</p>}
            {rematch?.gone && <p className="ar-note">{online.foe} has left.</p>}
            <div className="ar-end-go">
              <button type="button" className="lg-go quiet" onClick={onExit}>Back to the Arena</button>
              {!rematch?.gone && (
                <button type="button" className="lg-go" disabled={rematch?.asked} onClick={onAgain}>
                  {!online ? "Again" : rematch.asked ? `Waiting for ${online.foe}…` : rematch.offered ? `${online.foe} wants a rematch - accept` : "Rematch"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

const STALL_MS = 12000;
/* THE GRADE: how the match was won, not only whether. A win is half of it;
   the rest is HP kept, the best run of hits, perfect dodges and a quick
   knockout - so an S asks for a clean, fast, flashy win, and a close loss
   can still earn a C. */
const GRADES = ["S", "A", "B", "C", "D"];
const RECORD_KEY = "dexora-arena-record";
function gradeOf(v) {
  const pts = (v.won ? 45 : v.lost ? 0 : 20) + v.hpShare * 25 + Math.min(10, v.stats.best * 2) + Math.min(10, v.stats.perfect * 3)
    + (v.won && v.why === "knockout" ? (v.t < 90 * TPS ? 10 : v.t < 150 * TPS ? 5 : 0) : 0);
  return { letter: pts >= 88 ? "S" : pts >= 72 ? "A" : pts >= 55 ? "B" : pts >= 35 ? "C" : "D", pts };
}
// The next Pokemon still standing, forward or back round the team.
const nextAlive = (s, me, way = 1) => {
  const sd = s.sides[me], n = sd.team.length;
  for (let k = 1; k < n; k++) {
    const i = (sd.active + way * k + n * k) % n;
    if (sd.team[i].hp > 0) return i;
  }
  return -1;
};

// What the HUD shows, read off the match a few times a second, from `me`'s side.
function snapshot(s, me) {
  const side = (n) => {
    const sd = s.sides[n], f = sd.team[sd.active];
    return { id: f.id, level: f.level, hp: f.hp, max: f.max, left: sd.team.filter((x) => x.hp > 0).length, size: sd.team.length,
      status: f.status, stages: f.stages.map((v, k) => [k, v]).filter(([k, v]) => k > 0 && v) };
  };
  const mine = s.sides[me], f0 = mine.team[mine.active];
  return {
    t: s.t, left: s.sudden ? LIMIT + SUDDEN_T - s.t : LIMIT - s.t, sudden: Boolean(s.sudden), weather: s.weather, dark: s.dark > 0, over: s.over, won: s.over && s.winner === me, lost: s.over && s.winner === 1 - me, why: s.why, intro: s.intro > 0,
    meter: [me, 1 - me].map((k) => s.sides[k].meter / SURGE_MAX), surging: f0.surge > 0,
    sides: [side(me), side(1 - me)],
    party: mine.team.map((f, k) => ({ id: f.id, hp: f.hp, max: f.max, active: k === mine.active })),
    swapCd: mine.swapCd / SWAP_CD,
    stats: { ...mine.stats }, struggle: spent(f0),
    struggleReady: !(f0.struggle?.cd > 0), struggleCd: f0.struggle?.cd ? f0.struggle.cd / cooldownOf(moveOf(STRUGGLE)) : 0,
    hpShare: mine.team.reduce((n, f) => n + f.hp, 0) / Math.max(1, mine.team.reduce((n, f) => n + f.max, 0)),
    kit: f0.kit.map((m) => {
      const data = moveOf(m.i);
      return { name: moveName(m.i), type: data.t ?? "normal", pp: m.pp, max: Math.max(m.pp, Math.ceil((data.pp ?? 10) / 2), 3),
        ready: m.cd === 0, cd: m.cd ? m.cd / cooldownOf(data) : 0, shape: shapeOf(data) };
    }),
    // The next basic attack is the third in a row: the button says so.
    basic: { ready: f0.basic.cd === 0, cd: f0.basic.cd / basicCd(f0), jab: basicShape(f0) === "melee", boost: f0.basicN % 3 === 2 && s.t - f0.basicT < TPS },
    dodge: f0.dodgeCd === 0, dodgeCd: f0.dodgeCd ? f0.dodgeCd / DODGE_CD : 0,
    held: mine.held,
    ko: [me, 1 - me].map((k) => s.sides[k].team.filter((f) => f.hp <= 0).length),
  };
}

/* A SIDE'S PLATE: its Pokemon's face, name and level, HP with the chunk a
   hit took trailing behind it, statuses and stat changes, who is left, and
   the Surge meter. */
function Plate({ f, meter, who, mine }) {
  return (
    <div className={`ah-plate${mine ? " mine" : ""}${f.hp > 0 && f.hp / f.max <= 0.25 ? " low" : ""}`}>
      <span className="ah-face"><Sprite id={f.id} eager /></span>
      <div className="ah-plate-body">
        <div className="ah-plate-top"><b>{nameOf(f.id)}</b><span>Lv {f.level}</span><em>{who}</em></div>
        <i className="ar-hp">
          <i className="ar-hp-lag" style={{ transform: `scaleX(${Math.max(0, f.hp / f.max)})` }} />
          <i style={{ transform: `scaleX(${Math.max(0, f.hp / f.max)})` }} />
        </i>
        <div className="ah-plate-low">
          <span>{f.hp} / {f.max}</span>
          <span className="ar-tags">
            {f.status >= 0 && <em className={`ar-st st-${f.status}`}>{STATUS_TAG[f.status]}</em>}
            {f.stages.map(([k, v]) => <em key={k} className={v > 0 ? "up" : "down"}>{STAT[k]}{v > 0 ? "▲" : "▼"}{Math.abs(v) > 1 ? 2 : ""}</em>)}
          </span>
          <span className="ah-left" aria-label={`${f.left} of ${f.size} left`}>{Array.from({ length: f.size }, (_, k) => <i key={k} className={k < f.left ? "on" : ""} />)}</span>
        </div>
        <i className={`ar-meter${meter >= 1 ? " full" : ""}`}><i style={{ transform: `scaleX(${meter})` }} /></i>
      </div>
    </div>
  );
}

/* A MOBA'S STICK, FIXED (asked for, 2026-10-23: "sticky, so it won't
   interrupt the battle like tapping to switch Pokemon"): it stays in the
   bottom-left corner, only a touch that starts ON it steers, and that
   thumb keeps it wherever it drags until it lets go. The left half of the
   screen floated it under any touch once, and took the party's taps. */
const STICK_R = 48;
function Stick({ input }) {
  const base = useRef(null), knob = useRef(null), held = useRef(null);   // { id, cx, cy }
  const [on, setOn] = useState(false);
  useEffect(() => {
    const put = (dx, dy) => {
      const l = Math.hypot(dx, dy), k = l > 8 ? Math.min(1, l / STICK_R) / l : 0;
      input.current.stick = [dx * k, dy * k];
      const c = l > STICK_R ? STICK_R / l : 1;
      if (knob.current) knob.current.style.transform = `translate(${dx * c}px, ${dy * c}px)`;
    };
    const move = (e) => { const h = held.current; if (h && e.pointerId === h.id) put(e.clientX - h.cx, e.clientY - h.cy); };
    const up = (e) => {
      if (!held.current || e.pointerId !== held.current.id) return;
      held.current = null; setOn(false); put(0, 0);
    };
    const down = (e) => {
      e.preventDefault();
      const b = base.current.getBoundingClientRect();
      held.current = { id: e.pointerId, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
      setOn(true); move(e);
    };
    const el = base.current;
    el.addEventListener("pointerdown", down);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      input.current.stick = [0, 0];
    };
  }, [input]);
  return <div ref={base} className={`ar-stick${on ? " on" : ""}`} aria-hidden="true"><i ref={knob} /></div>;
}
