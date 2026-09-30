/* THE FIGHT: one League battle, played a beat at a time.

   The rules are battle.js's `step`, computed here and handed to the engine
   (`battleStep`, a `stepped()` - the collection does not move); the engine
   never imports the rules. Each turn's log is played back as BEATS - a line
   of text, the move's type effect on its target, the hit, and the health bar
   falling to what that event left (`after`, battle.js) - so a bar drops with
   the blow that caused it, not with the end of the turn.

   A tap, Space or Enter hurries a beat. Everything that moves animates only
   transform and opacity; `prefers-reduced-motion` keeps the words and drops
   the motion. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOVES } from "../../data/moves.js";
import { TYPES } from "../../data/types.js";
import { step, newBattle, effectiveness, mulberry32, canUse, itemOn, STRUGGLE } from "../../game/battle.js";
import { HEALS } from "../../game/items.js";
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { useModalLock } from "../modal.js";
import Sprite, { backUrl, VariantFx, ItemIcon } from "../Sprite.jsx";
import RankBadge from "../RankBadge.jsx";
import RankUp from "../RankUp.jsx";
import { RANKS, rankOf, promotion } from "../../game/ranked.js";
import Confirm from "../Confirm.jsx";
import { loadAnims, preload, hasAnim, play as playAnim, SPEEDS } from "./moveAnim.js";

const STATUS = [["PAR", "paralysed"], ["BRN", "burned"], ["PSN", "poisoned"], ["SLP", "put to sleep"], ["FRZ", "frozen solid"]];
const STAT = [null, "Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed", "accuracy", "evasiveness"];
const nameOf = (id) => label(speciesById(id));
/* "thunder-shock" -> "Thunder Shock"; "u-turn" keeps its hyphen, as the games write it. */
export const moveName = (i) => (i === STRUGGLE ? "Struggle"
  : MOVES[i].n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(MOVES[i].n.startsWith("u-") ? "-" : " "));
const moveType = (i) => (i === STRUGGLE ? "normal" : MOVES[i].t);
const moveSlug = (i) => (i === STRUGGLE ? "struggle" : MOVES[i].n);

/* MOVE ANIMATIONS (docs/battles.md, Art, phase 7): full, quick or off, per
   device. Off where the device asks for reduced motion, until chosen. */
const ANIM_KEY = "dexora-anim";
const ANIM_MODES = ["full", "quick", "off"];
const ANIM_SAYS = { full: "Full", quick: "Quick", off: "Off" };
const ANIM_MARK = { full: "✦", quick: "»", off: "✧" };   // the state alone on a narrow screen
function readAnimMode() {
  try {
    const v = localStorage.getItem(ANIM_KEY);
    if (ANIM_MODES.includes(v)) return v;
  } catch { /* a preference */ }
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "off" : "full";
}

/* THE AREA A FIGHT STANDS IN, by the opponent's type: the encounter scene's
   own sky and floor (`.battle[data-area]`), so a League fight is drawn in the
   same world as a wild one. */
const AREA = {
  water: "pond", grass: "woods", bug: "woods", fire: "ember", rock: "ridge", ground: "desert",
  fighting: "cinder", steel: "power", electric: "power", ice: "frost", ghost: "tower",
  dark: "tower", psychic: "tower", poison: "mansion", dragon: "ridge", normal: "meadow",
  flying: "safari", fairy: "meadow",
};
const areaFor = (type) => AREA[type] ?? "meadow";

const BEAT = 1050;          // a line of text and its motion
// A ranked turn the server refused, in words (handler.js's codes).
const RANKED_SAYS = {
  stale: "That turn was already taken - picking up where the battle stands.",
  none: "This battle is over.",
  illegal: "That move can't be used right now.",
  version: "A new version of Dexora is out - reload the page to keep battling.",
  offline: "Could not reach the server. Try again.",
  server: "Something went wrong on the server. Try again.",
};
/* The engine's reasons for refusing a battle (`battleBegin`), in words. The
   page offers only what the engine allows, so these are for a Box that
   changed under it - a trade landing while the team was being picked. */
const REFUSED = {
  shut: "This battle isn't open yet.",
  team: "Your team changed while you were choosing it. Pick it again.",
  locked: "One of your team is in a trade and can't battle.",
  level: "One of your team is over this battle's level cap.",
  legend: "One of your legendaries is over its limit for this battle.",
  fee: "You need the entry fee for this battle.",
};
const hpClass = (f) => (f <= 0.2 ? "low" : f <= 0.5 ? "mid" : "");

/* THE LINES A TURN SAYS, and what each changes on screen. `foe` names the
   other side the way the games do ("The foe's Onix"). */
function beatsOf(log, battle, foeName) {
  const who = (side, slot) => {
    const f = battle.sides[side].team[slot ?? battle.sides[side].active];
    return side === 1 ? `The foe's ${nameOf(f.id)}` : nameOf(f.id);
  };
  const out = [];
  for (const ev of log) {
    const after = ev.after;
    if (ev.sent != null) {
      const f = battle.sides[ev.side].team[ev.sent];
      out.push({ text: ev.side === 1 ? `${foeName} sent out ${nameOf(f.id)}!` : `Go, ${nameOf(f.id)}!`, in: ev.side, after });
      continue;
    }
    if (ev.fainted != null) {
      out.push({ text: `${who(ev.side, ev.fainted)} fainted!`, faint: ev.side, after });
      continue;
    }
    if (ev.item != null) {
      const h = HEALS.find((x) => x.id === ev.item);
      const f = battle.sides[ev.side].team[ev.target];
      out.push({ text: `You used ${/^[AEIOUX]/.test(h.name) ? "an" : "a"} ${h.name} on ${nameOf(f.id)}!`, after });
      out.push({ text: h.stage ? `${nameOf(f.id)}'s ${STAT[h.stage[0]]} rose sharply!`
        : `${nameOf(f.id)} ${h.revive ? "is back on its feet!" : h.heal && h.cure ? "was fully restored!" : h.cure ? "was cured!" : "regained health!"}` });
      continue;
    }
    if (ev.residual) {
      out.push({ text: `${who(ev.side)} is hurt by its ${ev.status === 1 ? "burn" : "poison"}!`, hit: ev.side, after });
      continue;
    }
    if (ev.move == null) continue;
    const me = who(ev.side), them = who(1 - ev.side);
    if (ev.asleep) { out.push({ text: `${me} is fast asleep.`, after }); continue; }
    if (ev.frozen) { out.push({ text: `${me} is frozen solid!`, after }); continue; }
    if (ev.flinched) { out.push({ text: `${me} flinched!`, after }); continue; }
    if (ev.paralysed) { out.push({ text: `${me} is paralysed! It can't move!`, after }); continue; }
    if (ev.woke) out.push({ text: `${me} woke up!` });
    if (ev.thawed) out.push({ text: `${me} thawed out!` });
    const type = moveType(ev.move);
    const hits = ev.dmg != null;
    out.push({
      text: `${me} used ${moveName(ev.move)}!`, lunge: ev.side,
      fx: hits || ev.status != null ? { type, at: 1 - ev.side } : null,
      hit: hits && ev.dmg > 0 ? 1 - ev.side : null, after,
      // The move's own animation, where it has one; a miss plays none, as in the games.
      move: ev.miss ? null : { slug: moveSlug(ev.move), side: ev.side },
    });
    if (ev.miss) { out.push({ text: `${me}'s attack missed!` }); continue; }
    if (hits && ev.hits > 1) out.push({ text: `Hit ${ev.hits} times!` });
    if (ev.crit) out.push({ text: "A critical hit!" });
    if (hits && ev.eff === 0) out.push({ text: `It doesn't affect ${them}...` });
    else if (hits && ev.eff > 1) out.push({ text: "It's super effective!" });
    else if (hits && ev.eff < 1) out.push({ text: "It's not very effective..." });
    if (ev.healed) out.push({ text: `${me} regained health!` });
    if (ev.status != null) out.push({ text: `${them} was ${STATUS[ev.status][1]}!` });
    if (ev.stages) {
      for (const [s, c] of ev.stages.sg) {
        const whose = who(ev.stages.side);
        out.push({ text: `${whose}'s ${STAT[s]} ${c > 0 ? "rose" : "fell"}${Math.abs(c) > 1 ? " sharply" : ""}!` });
      }
    }
  }
  return out;
}

function HpBox({ f, shown, side, level, team, statusAt }) {
  const frac = Math.max(0, shown.hp / f.max);
  const st = statusAt >= 0 ? STATUS[statusAt][0] : null;
  return (
    <div className={`ft-hp ${side ? "foe" : "me"}`}>
      <div className="ft-hp-top">
        <b>{nameOf(f.id)}</b>
        {st && <span className={`ft-st st-${st.toLowerCase()}`}>{st}</span>}
        <i>Lv {level}</i>
      </div>
      <div className="ft-bar" role="meter" aria-label={`${nameOf(f.id)} health`}
        aria-valuemin={0} aria-valuemax={f.max} aria-valuenow={shown.hp}>
        <span className={`ft-fill ${hpClass(frac)}`} style={{ transform: `scaleX(${frac})` }} />
      </div>
      <div className="ft-hp-bot">
        {/* The party as Poke Balls, as the games draw it: a fainted one greyed. */}
        <span className="ft-pips" aria-label={`${team.filter((x) => x.hp > 0).length} of ${team.length} able to fight`}>
          {team.map((x, k) => <i key={k} className={x.hp > 0 ? "" : "out"} />)}
        </span>
        {!side && <em>{shown.hp}/{f.max}</em>}
      </div>
    </div>
  );
}

/* A Pokemon on the field: the foe from the front, yours from behind (its
   front, flipped, where a tier has no back art). Keyed by slot so a send-out
   remounts it and plays its entrance. */
function Mon({ f, mon, side, anim }) {
  const tier = mon?.tier ?? null;
  const back = side === 0 ? backUrl(f.id, tier) : null;
  return (
    <div className={`ft-mon ${side ? "foe" : "me"} ${anim}`}>
      <span className="ft-base" aria-hidden="true" />
      {side === 0 && back ? (
        <span className="sprite-fx ft-sprite">
          <img className={tier ? `sprite-${tier}` : ""} src={back} alt={nameOf(f.id)} />
          <VariantFx id={f.id} variant={tier} art={back} />
        </span>
      ) : (
        <Sprite id={f.id} variant={tier} fx eager className={`ft-sprite${side === 0 ? " flip" : ""}`} alt={nameOf(f.id)} />
      )}
    </div>
  );
}

/* `practice` is a friend's defense team (docs/ranked.md): ranked's rules, so
   no Bag, and nothing handed to the engine - the page passes no engine, and
   nothing is judged, paid or kept. `foeMons` are the foe's box entries when
   they have a look to show (a friend's Shiny), else null.

   `remote` is a RANKED battle (6b): the server referees it, so the page holds
   only the VIEW it is sent (its own side, and of the defender only what has
   been sent out) and asks the server for every turn - `remote.turn(action)`
   answers with the turn's log and the next view, and the beats play from
   those as from a local turn. `{id, view, deadline, resumed, turn, forfeit,
   resync}`; a resumed battle opens where it stands, without the opening. */
export default function Fight({ opponent, foeTeam, myTeam, myMons, foeMons = null, practice = false, remote = null, badge = null, nextLabel = null, ai, onDone, engine }) {
  useModalLock();
  const rng = useMemo(() => mulberry32((Date.now() ^ 0x5eed) >>> 0), []);
  const foeName = `${opponent.cls ? `${opponent.cls} ` : ""}${opponent.name}`;
  const start = useMemo(() => remote?.view ?? newBattle([myTeam, foeTeam], [null, ai]), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [b, setB] = useState(start);
  // What the screen shows: each side's active slot, its HP and status.
  const [view, setView] = useState(() => [0, 1].map((s) => {
    const f = start.sides[s].team[start.sides[s].active];
    return { slot: start.sides[s].active, hp: f.hp, status: f.status };
  }));
  // A ranked turn is a round trip: nothing more is sent until it is back.
  const [waiting, setWaiting] = useState(false);
  const [note, setNote] = useState(null);
  const [deadline, setDeadline] = useState(remote?.deadline ?? null);
  const [left, setLeft] = useState(null);     // seconds on the current decision
  const [rated, setRated] = useState(null);   // what the ladder did with a finished ranked battle
  // A new rank is a ceremony over the result card, once (RankUp.jsx).
  const promo = useMemo(() => (remote && rated?.rated ? promotion(rated) : null), [remote, rated]);
  const [cheered, setCheered] = useState(false);
  const [beat, setBeat] = useState(null);      // the one being played
  const queue = useRef([]);
  const [panel, setPanel] = useState("moves"); // moves | switch | forced | bag | use
  const [using, setUsing] = useState(null);    // the item whose target is being chosen
  const [ask, setAsk] = useState(false);
  const [over, setOver] = useState(null);      // "won" | "lost"
  // Whether each side has sent its Pokemon out yet: the trainer stands in the
  // foe's place until then, and a side's health box arrives with its Pokemon.
  const [out, setOut] = useState(() => (remote?.resumed ? [true, true] : [false, false]));
  // A Pokemon falls on its own "fainted!" line, not the moment its HP reads 0,
  // and stands again when the next one is sent out.
  const [down, setDown] = useState([false, false]);
  const ended = useRef(false);
  const timer = useRef(0);
  // The scene's animation layers, the one running, and the chosen speed (read by `next`, a stable callback).
  const sceneRef = useRef(null), canvasRef = useRef(null), bgRef = useRef(null), tintRef = useRef(null), flashRef = useRef(null);
  const running = useRef(null);
  const [animMode, setAnimModeState] = useState(readAnimMode);
  const animRef = useRef(animMode);
  const setAnimMode = (m) => {
    animRef.current = m;
    setAnimModeState(m);
    try { localStorage.setItem(ANIM_KEY, m); } catch { /* a preference */ }
  };
  // What the engine paid for the result (`battleEnd`), for the result card.
  const [paid, setPaid] = useState(null);
  // Why the engine refused the battle, if it did (`battleBegin`).
  const [refused, setRefused] = useState(null);

  /* The engine holds the battle while it runs, and judges it: it may refuse
     one the page offered (a team changed under it), and it alone pays the
     win. Leaving any way at all ends it. */
  useEffect(() => {
    const no = engine?.battleBegin(start, { id: opponent.id, uids: myMons.map((m) => m.uid) }) ?? null;
    setRefused(no);
    ended.current = Boolean(no);
    return () => { if (!ended.current) engine?.battleEnd(); };
  }, [engine, start]);   // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    setPaid(engine?.battleEnd() ?? null);
  }, [engine]);

  /* PLAY THE QUEUE: one beat, then the next after BEAT ms or a tap. A beat
     carrying `after` moves the bars to it as it starts - except a move with
     its own animation, whose bar falls at the IMPACT (the first hit on the
     target), and whose beat lasts as long as the animation does. */
  const next = useCallback(() => {
    clearTimeout(timer.current);
    const nb = queue.current.shift();
    if (!nb) { setBeat(null); return; }
    const scene = sceneRef.current;
    if (nb.move && animRef.current !== "off" && hasAnim(nb.move.slug) && scene) {
      setBeat({ ...nb, fx: null, lunge: null, hit: null, key: Math.random() });
      const after = nb.after;
      running.current = playAnim({
        slug: nb.move.slug, attacker: nb.move.side, speed: SPEEDS[animRef.current],
        stage: { scene, canvas: canvasRef.current, bg: bgRef.current, tint: tintRef.current, flash: flashRef.current,
          mons: [scene.querySelector(".ft-mon.me .ft-sprite"), scene.querySelector(".ft-mon.foe .ft-sprite")] },
        onImpact: () => { if (after) setView(after.map((a) => ({ ...a }))); },
        onDone: () => { running.current = null; timer.current = setTimeout(next, 240); },
      });
      return;
    }
    if (nb.after) setView(nb.after.map((a) => ({ ...a })));
    setBeat({ ...nb, key: Math.random() });
    timer.current = setTimeout(next, nb.wait ?? BEAT);
  }, []);
  // A tap hurries: an animation finishes at once (its bar falls), a line moves on.
  const hurry = useCallback(() => (running.current ? running.current.skip() : next()), [next]);
  useEffect(() => () => {
    const r = running.current;
    running.current = null;
    clearTimeout(timer.current);
    if (r) r.skip();
    clearTimeout(timer.current);
  }, []);
  // Every move either side can use, fetched as the battle opens so no turn waits on the network.
  useEffect(() => {
    if (animRef.current === "off") { loadAnims(); return; }
    const slugs = start.sides.flatMap((s) => s.team.flatMap((f) => (f.moves ?? []).map((m) => moveSlug(m.i))));
    preload([...new Set(slugs)]);
  }, [start]);

  // The opening: the trainer steps up, then both sides send out. A resumed
  // ranked battle is already under way.
  useEffect(() => {
    if (remote?.resumed) return;
    queue.current = [
      { text: `${foeName} wants to battle!`, wait: 1400 },
      { text: `${foeName} sent out ${nameOf(start.sides[1].team[start.sides[1].active].id)}!`, in: 1 },
      { text: `Go, ${nameOf(start.sides[0].team[start.sides[0].active].id)}!`, in: 0 },
    ];
    next();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /* THE DECISION'S CLOCK (ranked): the server plays the AI's choice for a turn
     sent after its deadline, so the page shows how long is left. */
  useEffect(() => {
    if (!deadline) return undefined;
    const tick = () => setLeft(Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  useEffect(() => {
    if (beat?.in != null && !out[beat.in]) setOut((o) => o.map((v, s) => v || s === beat.in));
    if (beat?.in != null) setDown((d) => d.map((v, s) => (s === beat.in ? false : v)));
    if (beat?.faint != null) setDown((d) => d.map((v, s) => (s === beat.faint ? true : v)));
  }, [beat, out]);

  const busy = beat !== null || waiting;
  const bag = engine?.state?.bag ?? {};
  const kit = HEALS.filter((h) => (bag[h.id] ?? 0) > 0);
  const me = b.sides[0].team[view[0].slot];
  const foe = b.sides[1].team[view[1].slot];

  // A ranked battle out of step with the server (another tab took a turn):
  // pick it up where the server has it.
  const resync = useCallback(async () => {
    const got = await remote.resync();
    if (!got.ok || got.data?.none) return;
    const v = got.data.view;
    setB(v);
    setView([0, 1].map((s) => ({ slot: v.sides[s].active, hp: v.sides[s].team[v.sides[s].active].hp, status: v.sides[s].team[v.sides[s].active].status })));
    setDeadline(got.data.deadline);
  }, [remote]);

  const play = useCallback(async (action) => {
    if (busy || over) return;
    let nb, auto = null;
    if (remote) {
      setWaiting(true); setNote(null);
      const got = await remote.turn(action);
      setWaiting(false);
      if (!got.ok) {
        setNote(got.error);
        if (got.error === "stale") await resync();
        return;
      }
      nb = { ...got.data.view, log: got.data.log };
      auto = got.data.auto;
      if (got.data.result) setRated(got.data.result);
      setDeadline(got.data.deadline);
    } else {
      nb = step(b, action, rng);
      if (nb.turn === b.turn && action?.item != null) return;   // an item that would do nothing
      // The engine spends an item here, and refuses a turn using one you do not hold.
      if (engine && engine.battleStep(nb)) return;
    }
    setB(nb);
    setUsing(null);
    setPanel("moves");
    const beats = beatsOf(nb.log, nb, foeName);
    if (auto) beats.unshift({ text: "Time ran out - your turn was played for you.", wait: 1300 });
    if (nb.over >= 0) {
      beats.push(nb.over === 0
        ? { text: `You defeated ${foeName}!`, wait: 1500, end: "won" }
        : { text: `You were defeated by ${foeName}...`, wait: 1500, end: "lost" });
    }
    queue.current = beats;
    next();
  }, [b, busy, over, rng, engine, foeName, next, remote, resync]);

  // The last beat ends the fight; a fainted Pokemon of yours asks who is next.
  useEffect(() => {
    if (busy) return;
    if (b.over >= 0 && !over) { finish(); setOver(b.over === 0 ? "won" : "lost"); }
    else if (b.need[0]) setPanel("forced");
  }, [busy, b, over, finish]);

  // Keys: 1-4 a move, S the team, Space/Enter hurry, Escape asks to forfeit.
  useEffect(() => {
    const onKey = (e) => {
      if (ask) return;
      if (e.key === "Escape") { e.preventDefault(); if (over) onDone(over); else setAsk(true); return; }
      if (busy && (e.key === " " || e.key === "Enter")) { e.preventDefault(); hurry(); return; }
      if (busy || over) return;
      const k = Number(e.key) - 1;
      if (panel === "moves" && k >= 0 && k < me.moves.length) { e.preventDefault(); play({ move: k }); }
      if (panel === "moves" && e.key.toLowerCase() === "s") { e.preventDefault(); setPanel("switch"); }
      if (panel === "moves" && !practice && e.key.toLowerCase() === "b") { e.preventDefault(); setPanel("bag"); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [ask, busy, over, panel, me, play, hurry, onDone, practice]);

  const anim = (side) => [
    beat?.in === side ? "in" : "",
    beat?.lunge === side ? "lunge" : "",
    beat?.hit === side ? "hit" : "",
    down[side] ? "down" : "",
  ].join(" ").trim();
  const area = areaFor(opponent.type ?? TYPES[start.sides[1].team[start.sides[1].active].types[0]]);
  // A ranked view carries each Pokemon's look (its tier) on the fighter itself.
  const foeLook = remote ? b.sides[1].team : foeMons;

  if (refused) {
    return (
      <div className="ft ft-refused" role="alertdialog" aria-modal="true" aria-label="Battle refused">
        <div className="ft-result lost">
          <div className="ft-res-head">
            <b className="ft-res-title">Not this time</b>
            <span className="ft-res-sub">{REFUSED[refused] ?? REFUSED.team}</span>
          </div>
          <div className="ft-result-go">
            <button type="button" className="lg-go" onClick={() => onDone("refused")}>Back to the League</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ft" role="dialog" aria-modal="true" aria-label={`Battle against ${foeName}`}>
      <div className="ft-top">
        <button type="button" className="tc-home" onClick={() => (over ? onDone(over) : setAsk(true))}>
          <span aria-hidden="true">‹</span> {over ? "League" : "Forfeit"}
        </button>
        <div className="ft-vs">
          <img src={new URL(`trainers/${opponent.pic}.png`, document.baseURI).href} alt="" />
          <span><i>vs</i> <b>{foeName}</b>{opponent.rating != null && <em className="ft-opp-rating"> {opponent.rating.toLocaleString("en-US")}</em>}</span>
        </div>
        <button type="button" className="ft-anim-mode" aria-label={`Move animations: ${ANIM_SAYS[animMode]}`}
          data-tip="Move animations: full, quick or off"
          onClick={() => setAnimMode(ANIM_MODES[(ANIM_MODES.indexOf(animMode) + 1) % ANIM_MODES.length])}>
          <i aria-hidden="true">{ANIM_MARK[animMode]}</i><span>{ANIM_SAYS[animMode]}</span>
        </button>
        <span className={`ft-turn${left !== null && left <= 10 && !over ? " hurry" : ""}`}>
          {b.turn ? `Turn ${b.turn}` : ""}
          {remote && left !== null && !over && <i> · {left > 0 ? `${left}s` : "time's up"}</i>}
        </span>
      </div>

      <div className="ft-stage" onClick={beat ? hurry : undefined}>
        <div className="battle ft-scene" data-area={area} data-phase="day" ref={sceneRef}
          style={{ "--ground": `url(${new URL(`battle/${area}.png`, document.baseURI).href})` }}>
          <div className="battle-sky" />
          <div className="battle-ground" />
          {/* A move's background (Shadow Ball's, Psychic's) and its tint: over the ground, under the mons. */}
          <div className="ft-anim-bg" ref={bgRef} aria-hidden="true" />
          <div className="ft-anim-tint" ref={tintRef} aria-hidden="true" />
          {out[1] ? (
            <Mon key={`f${view[1].slot}`} f={foe} side={1} mon={foeLook?.[view[1].slot] ?? null} anim={anim(1)} />
          ) : (
            <img className="ft-coach" src={new URL(`trainers/${opponent.pic}.png`, document.baseURI).href} alt={foeName} />
          )}
          {out[1] && <HpBox f={foe} shown={view[1]} side={1} level={foe.level}
            team={b.sides[1].team} statusAt={view[1].status} />}
          {out[0] && <Mon key={`m${view[0].slot}`} f={me} side={0} mon={myMons[view[0].slot]} anim={anim(0)} />}
          {out[0] && <HpBox f={me} shown={view[0]} side={0} level={me.level}
            team={b.sides[0].team} statusAt={view[0].status} />}
          {/* EVERY SEND-OUT IS THROWN: a Poke Ball arcs in from the thrower's
              side, spins, bursts open, and the Pokemon comes out of the light
              (`.ft-mon.in` waits for it). Trainers throw Poke Balls; a box
              entry does not remember the ball it was caught in. */}
          {beat?.in != null && (
            <span key={`ball${beat.key}`} className={`ball ft-ball ${beat.in ? "foe" : "me"}`} aria-hidden="true"
              style={{ backgroundImage: `url(${new URL("items/throw/poke-ball.png", document.baseURI).href})` }} />
          )}
          {beat?.fx && (
            <span key={beat.key} className={`ft-fx t-${beat.fx.type} at-${beat.fx.at ? "foe" : "me"}`} aria-hidden="true">
              <b /><i /><i /><i /><i /><i /><i />
            </span>
          )}
          {/* A move's sprites, over the mons and under the health boxes, and its flash over them. */}
          <canvas className="ft-anim" ref={canvasRef} aria-hidden="true" />
          <div className="ft-anim-flash" ref={flashRef} aria-hidden="true" />
        </div>
      </div>

      <div className="ft-panel">
        <p className={`ft-msg${busy ? " live" : ""}`} aria-live="polite" onClick={beat ? hurry : undefined}>
          {beat?.text ?? (waiting ? "…" : over ? (over === "won" ? `You defeated ${foeName}!` : `${foeName} won this time.`)
            : panel === "forced" ? "Who will you send out next?" : `What will ${nameOf(me.id)} do?`)}
          {busy && !waiting && <span className="ft-more" aria-hidden="true">▼</span>}
        </p>
        {note && <p className="ft-note" role="alert">{RANKED_SAYS[note] ?? RANKED_SAYS.offline}</p>}

        {over ? (
          /* THE RESULT, in one band: what happened and who is still standing on
             the left, what it won in chips beside it, the next step on the
             right. It stacks on a phone. */
          <div className={`ft-result ${over}`}>
            <div className="ft-res-head">
              <b className="ft-res-title">{over === "won" ? "Victory!" : "Defeated"}</b>
              <span className="ft-res-sub">{remote
                ? `${b.turn} turns`
                : practice
                ? `${b.turn} turns · practice, nothing is saved or rated`
                : over === "won"
                  ? `${b.turn} turns · ${b.sides[0].team.filter((f) => f.hp > 0).length} of ${b.sides[0].team.length} still standing`
                  : "Nothing is lost - raise your team with Rare Candy and try again."}</span>
              <ul className="ft-res-team" aria-label="Your team">
                {b.sides[0].team.map((f, k) => (
                  <li key={k} className={f.hp > 0 ? "" : "out"}>
                    <Sprite id={f.id} variant={myMons[k]?.tier ?? null} alt={`${nameOf(f.id)}${f.hp > 0 ? "" : " (fainted)"}`} />
                  </li>
                ))}
              </ul>
            </div>
            {(remote && rated?.rated) || (over === "won" && paid) ? (
              <ul className="ft-loot">
                {remote && rated?.rated && (
                  <li className="ft-rated">
                    <b className={rated.delta >= 0 ? "up" : "down"}>{rated.delta >= 0 ? "+" : ""}{rated.delta}</b>
                    <RankBadge rating={rated.rating} games={rated.games} withRating />
                  </li>
                )}
                {over === "won" && paid?.first && badge && (
                  <li>
                    <img src={new URL(`badges/${badge.id}.png`, document.baseURI).href} alt="" />
                    <span><i>NEW BADGE</i><b>{badge.name}</b></span>
                  </li>
                )}
                {over === "won" && paid?.gift && (
                  <li className="gift">
                    <Sprite id={paid.gift.species} variant={paid.gift.tier} alt="" />
                    <span><i>JOINS YOUR BOX · LV {paid.gift.level}</i><b>{nameOf(paid.gift.species)}{paid.gift.tier ? `, ${paid.gift.tier[0].toUpperCase()}${paid.gift.tier.slice(1)}` : ""}</b></span>
                  </li>
                )}
                {over === "won" && paid?.master && (
                  <li>
                    <img src={new URL("items/master-ball.png", document.baseURI).href} alt="" />
                    <span><i>HARD MODE CLEARED</i><b>A Master Ball</b></span>
                  </li>
                )}
                {over === "won" && paid?.charm && (
                  <li>
                    <span className="ft-coin" aria-hidden="true">✦</span>
                    <span><i>REGION CHARM</i><b>Rare forms ×{paid.charm.toFixed(2)}</b></span>
                  </li>
                )}
                {over === "won" && paid && (paid.pay > 0 ? (
                  <li className="pay">
                    <span className="ft-coin" aria-hidden="true">¥</span>
                    <span><i>{paid.fee ? `PRIZE + ENTRY BACK` : "PRIZE"}</i><b>+¥{(paid.pay + (paid.fee ?? 0)).toLocaleString("en-US")}</b></span>
                  </li>
                ) : paid.fee ? (
                  <li className="pay">
                    <span className="ft-coin" aria-hidden="true">¥</span>
                    <span><i>ENTRY BACK</i><b>+¥{paid.fee.toLocaleString("en-US")}</b></span>
                  </li>
                ) : (
                  <li className="none"><span><i>PRIZE</i><b>Refills as you walk</b></span></li>
                ))}
              </ul>
            ) : null}
            <div className="ft-result-go">
              {/* THE NEXT BATTLE in this gym (or run), once this one is won. */}
              {over === "won" && nextLabel && (
                <button type="button" className="lg-go" onClick={() => onDone(over, "next")}>
                  Next: {nextLabel}
                </button>
              )}
              <button type="button" className={`lg-go${over === "won" && nextLabel ? " quiet" : ""}`} onClick={() => onDone(over, "again")}>
                {remote ? "Find another" : practice ? "Another team" : over === "won" ? "Rematch" : "Try again"}
              </button>
              <button type="button" className="lg-go quiet" onClick={() => onDone(over)}>Back to the League</button>
            </div>
          </div>
        ) : panel === "moves" ? (
          <div className="ft-cmds">
            <div className="ft-moves" role="group" aria-label="Moves">
              {me.moves.map((m, k) => {
                const mv = MOVES[m.i];
                const x = mv.p ? effectiveness(mv.t, foe.types) : null;
                return (
                  <button key={m.i} type="button" className={`ft-move t-${mv.t}`} disabled={busy || m.pp <= 0}
                    onClick={() => play({ move: k })}
                    aria-label={`${moveName(m.i)}, ${mv.t}, ${m.pp} of ${mv.pp} PP${x != null && x !== 1 ? `, ${x === 0 ? "no effect" : x > 1 ? "super effective" : "not very effective"}` : ""}`}>
                    <b>{moveName(m.i)}</b>
                    <span className="ft-move-meta">
                      <i>{mv.t.toUpperCase()}</i>
                      {x != null && x !== 1 && <em className={x === 0 ? "none" : x > 1 ? "up" : "down"}>{x === 0 ? "NO EFFECT" : x > 1 ? "SUPER" : "WEAK"}</em>}
                      <u>PP {m.pp}/{mv.pp}</u>
                    </span>
                    <kbd aria-hidden="true">{k + 1}</kbd>
                  </button>
                );
              })}
              {!me.moves.some((m) => m.pp > 0) && (
                <button type="button" className="ft-move t-normal" disabled={busy} onClick={() => play({ move: 0 })}>
                  <b>Struggle</b><span className="ft-move-meta"><i>NO PP LEFT</i></span>
                </button>
              )}
            </div>
            <div className="ft-side">
              <button type="button" className="ft-team-btn" disabled={busy} onClick={() => setPanel("switch")}>
                <span aria-hidden="true">⇄</span> Pokémon <kbd aria-hidden="true">S</kbd>
              </button>
              {!practice && (
                <button type="button" className="ft-team-btn" disabled={busy} onClick={() => setPanel("bag")}>
                  <span aria-hidden="true">✚</span> Bag <kbd aria-hidden="true">B</kbd>
                </button>
              )}
            </div>
          </div>
        ) : panel === "bag" ? (
          /* THE BATTLE SHELF: what you hold, each greyed when it would do
             nothing for anyone on your team (`canUse`). Using one costs the
             turn, as a switch does. */
          <div className="ft-switch ft-bag">
            {kit.length ? (
              <ul>
                {kit.map((h) => {
                  const any = itemOn(h.id) === "active" ? canUse(b.sides[0].team[view[0].slot], h.id)
                    : b.sides[0].team.some((f) => canUse(f, h.id));
                  return (
                    <li key={h.id}>
                      <button type="button" disabled={busy || !any}
                        onClick={() => (itemOn(h.id) === "active" ? play({ item: h.id, target: view[0].slot })
                          : (setUsing(h.id), setPanel("use")))}
                        aria-label={`${h.name}, ${bag[h.id]} left: ${h.blurb}`}>
                        <ItemIcon item={h} />
                        <span className="ft-sw-name"><b>{h.name}</b><i>×{bag[h.id]}</i></span>
                        <em>{any ? h.blurb : h.stage ? "It can't go any higher" : h.revive ? "Nobody has fainted" : h.cure && !h.heal ? "Nobody has a status" : "Everyone is at full health"}</em>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ft-empty">No Potions, Full Heals or Revives. The Shop sells them on its Battle shelf.</p>
            )}
            <button type="button" className="ft-team-btn" onClick={() => setPanel("moves")}>
              <span aria-hidden="true">‹</span> Back to moves
            </button>
          </div>
        ) : panel === "use" ? (
          <div className="ft-switch">
            <p className="ft-empty">Use the {HEALS.find((h) => h.id === using)?.name} on which Pokémon?</p>
            <ul>
              {b.sides[0].team.map((f, k) => {
                const ok = canUse(f, using);
                return (
                  <li key={k}>
                    <button type="button" disabled={busy || !ok} onClick={() => play({ item: using, target: k })}
                      aria-label={`${nameOf(f.id)}, Lv ${f.level}, ${f.hp} of ${f.max} HP${f.hp <= 0 ? ", fainted" : ""}`}>
                      <Sprite id={f.id} variant={myMons[k]?.tier ?? null} alt="" />
                      <span className="ft-sw-name"><b>{nameOf(f.id)}</b><i>Lv {f.level}</i></span>
                      <span className="ft-bar small"><span className={`ft-fill ${hpClass(f.hp / f.max)}`} style={{ transform: `scaleX(${Math.max(0, f.hp / f.max)})` }} /></span>
                      <em>{f.hp <= 0 ? "FAINTED" : f.status >= 0 ? `${STATUS[f.status][0]} · ${f.hp}/${f.max}` : `${f.hp}/${f.max}`}</em>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="ft-team-btn" onClick={() => setPanel("bag")}>
              <span aria-hidden="true">‹</span> Back to the bag
            </button>
          </div>
        ) : (
          <div className="ft-switch">
            <ul>
              {b.sides[0].team.map((f, k) => {
                const here = k === view[0].slot;
                const out = f.hp <= 0;
                return (
                  <li key={k}>
                    <button type="button" disabled={busy || here || out}
                      onClick={() => play({ swap: k })}
                      aria-label={`${nameOf(f.id)}, Lv ${f.level}, ${f.hp} of ${f.max} HP${here ? ", in battle" : out ? ", fainted" : ""}`}>
                      <Sprite id={f.id} variant={myMons[k]?.tier ?? null} alt="" />
                      <span className="ft-sw-name"><b>{nameOf(f.id)}</b><i>Lv {f.level}</i></span>
                      <span className="ft-bar small"><span className={`ft-fill ${hpClass(f.hp / f.max)}`} style={{ transform: `scaleX(${Math.max(0, f.hp / f.max)})` }} /></span>
                      <em>{here ? "IN BATTLE" : out ? "FAINTED" : `${f.hp}/${f.max}`}</em>
                    </button>
                  </li>
                );
              })}
            </ul>
            {panel === "switch" && (
              <button type="button" className="ft-team-btn" onClick={() => setPanel("moves")}>
                <span aria-hidden="true">‹</span> Back to moves
              </button>
            )}
          </div>
        )}
      </div>

      {ask && (
        <Confirm
          title="Forfeit this battle?"
          lines={[["Opponent", foeName], ["You lose", remote ? "this battle - it counts as a loss" : practice ? "nothing - it's practice" : "nothing - try again any time"]]}
          confirmLabel="FORFEIT"
          tone="warn"
          onCancel={() => setAsk(false)}
          onConfirm={async () => {
            setAsk(false);
            /* A ranked forfeit is a rated loss: stay for the result card, which
               says what it cost - leaving at once took the points unseen. */
            if (remote) {
              const got = await remote.forfeit();
              if (got?.ok && got.data?.result) setRated(got.data.result);
              finish();
              queue.current = [];
              setBeat(null);
              setOver("lost");
              return;
            }
            finish();
            onDone("forfeit");
          }}
        />
      )}
      {promo && !cheered && (
        <RankUp set="battle" ranks={RANKS} from={promo.from} to={promo.to}
          kicker={promo.from == null ? "Placement complete" : "Rank up"}
          detail={`Rating ${rated.rating.toLocaleString("en-US")}${rankOf(rated.rating, rated.games).division
            ? ` · ${RANKS[promo.to].name} ${rankOf(rated.rating, rated.games).division}` : ""}`}
          onDone={() => setCheered(true)} />
      )}
    </div>
  );
}
