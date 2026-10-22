/* THE ARENA (the Arena plan, phases 0 and 1): real-time battles, a tab of
   the League page. game/arena.js is the rules; render.js draws them; this is
   the lobby, the controls and the HUD.

   THE LOOP LIVES OUTSIDE REACT, like the map's: requestAnimationFrame steps
   the match in whole ticks (`TPS`) from accumulated time and draws between
   them; React hears a snapshot a few times a second, for the HUD alone. It
   stops the moment the page is hidden - a loop nobody can see is not free.

   A match never touches your Pokemon. A win against a CPU pays once a level a
   day (`engine.arenaWin`, priced like a road trainer in road.js); a master of
   the Arena Ladder (ladder.js) pays its first win once (`engine.arenaMaster`,
   which also judges the order).

   ONLINE (phase 3): a FRIEND is challenged from the lobby (db/arena.sql), the
   two browsers link up (net.js) and play one match in lockstep (arena.js) in
   the Fair format - each side's species at Lv 50 - unranked and unpaid. The
   challenger is side 0; each end draws itself as `me`. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { newMatch, tick, cpuTeam, masterTeam, fairTeam, lockstep, rulesPrint, activeOf, TPS, LIMIT, INTRO, SURGE_MAX, SURGE_T, FAIR_LEVEL,
  FINAL_T, spent,
  cooldownOf, DODGE_CD, ARENAS, shapeOf, GROUND, ZONE_SAYS } from "../../../game/arena.js";
import { CLOUD, signedIn, myFriends, arenaChallenge, arenaInvites, arenaAnswer, arenaCancel } from "../../../net/cloud.js";
import { isEvent } from "../../../data/dex.js";
import { connect } from "./net.js";
import { LADDER, masterOf, ladderOpen, ladderPay } from "../../../game/ladder.js";
import { playerFighter, moveOf, STRUGGLE, refusal } from "../../../game/battle.js";
import { MOVES } from "../../../data/moves.js";
import { speciesById } from "../../../game/biomes.js";
import { variantOf } from "../../../game/items.js";
import { label } from "../../../game/map.js";
import { ARENA_LEVELS, arenaPay } from "../../../game/road.js";
import { dayKey, hash } from "../../../game/daily.js";
import { createRenderer } from "./render.js";
import { loadAnims } from "../moveAnim.js";
import Sprite from "../../Sprite.jsx";
import { useModalLock, useDismiss } from "../../modal.js";
import { PMD_REV } from "../../../data/pmd.js";

const TEAM = 3;
const nameOf = (id) => label(speciesById(id));
const moveName = (i) => (i === STRUGGLE ? "Struggle" : MOVES[i].n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "));
const touchDevice = () => matchMedia("(hover: none) and (pointer: coarse)").matches;
const clock = (ticks) => { const s = Math.max(0, Math.ceil(ticks / TPS)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const asset = (p) => new URL(p, document.baseURI).href;
const ARENA_KEY = "dexora-arena-floor";
const readFloor = () => { try { return localStorage.getItem(ARENA_KEY) || "random"; } catch { return "random"; } };
const keepFloor = (id) => { try { localStorage.setItem(ARENA_KEY, id); } catch { /* a preference */ } };
const STATUS_TAG = ["PAR", "BRN", "PSN", "SLP", "FRZ"];
const STAT = ["", "Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];
const SHAPE_WORD = { shot: "Shot", beam: "Beam", melee: "Blow", dash: "Dash", pulse: "Pulse", field: "Trap", self: "Self", multi: "Burst" };

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

const MODES = [
  { id: "dummy", name: "Training", says: "A dummy that never hits back. Learn your four moves.", cpu: "dummy" },
  { id: "easy", name: "Quick battle · Easy", says: "A CPU team at your team's level. Slow to react.", cpu: "easy" },
  { id: "normal", name: "Quick battle · Normal", says: "Dodges about half of what it sees, switches when low.", cpu: "normal" },
  { id: "hard", name: "Quick battle · Hard", says: "Fast hands, sharp aim, leads its shots, raises a shield.", cpu: "hard" },
];

export default function Arena({ engine, box, team, record, ladder = [], onLive }) {
  const mons = useMemo(() => team.map((uid) => box.find((m) => m.uid === uid)).filter((m) => m && !refusal(m)).slice(0, TEAM), [box, team]);
  const [match, setMatch] = useState(null);     // { mode, seed, floor }
  const [online, setOnline] = useState(null);   // { role, invite, friend }
  const [floor, setFloor] = useState(readFloor);
  useEffect(() => { onLive?.(Boolean(match || online)); }, [match, online, onLive]);
  useEffect(() => () => onLive?.(false), [onLive]);
  useEffect(() => { loadAnims(); }, []);
  const level = mons.length ? Math.round(mons.reduce((n, m) => n + m.level, 0) / mons.length) : 5;
  const paid = record?.day === dayKey() ? record.won : [];

  const pickFloor = (seed) => (floor === "random" ? ARENAS[Math.abs(seed) % ARENAS.length].id : floor);
  if (match) {
    return <Match key={match.seed} mons={mons} mode={match.mode} master={match.master} level={level} seed={match.seed} floor={match.floor}
      onWin={(cpu) => (match.master ? engine?.arenaMaster(match.master.id) : engine?.arenaWin(cpu, level)) ?? 0}
      onAgain={() => { const seed = (match.seed * 1103515245 + 12345) | 0; setMatch({ ...match, seed, floor: match.master ? match.floor : pickFloor(seed) }); }}
      onExit={() => setMatch(null)} />;
  }
  if (online) return <Online start={online} mons={mons} onExit={() => setOnline(null)} />;
  const start = (mode) => { const seed = (Date.now() & 0x7fffffff) | 1; setMatch({ mode, seed, floor: pickFloor(seed) }); };
  const challenge = (m) => setMatch({ mode: m.cpu, master: m, seed: (Date.now() & 0x7fffffff) | 1, floor: m.arena });
  const shown = floor === "random" ? null : floor;
  const choose = (id) => { setFloor(id); keepFloor(id); };
  return (
    <div className="ar-lobby">
      <section className="lg-hero ar-hero">
        <span className="lg-kicker">Real-time battles</span>
        <h2>The Arena</h2>
        <p>Move, aim, dodge and switch as it happens. Your first three Team Pokémon fight with their League moves; a hit is the League's own damage. Nothing here changes your Pokémon.</p>
      </section>
      <h3 className="lg-section">Your team</h3>
      {mons.length ? (
        <div className="ar-team">
          {mons.map((m) => (
            <div key={m.uid} className="ar-mon">
              <Sprite id={m.species} variant={variantOf(m)} />
              <b>{nameOf(m.species)}</b>
              <span>Lv {m.level}</span>
              <ul>{playerFighter(m).moves.map((mv) => {
                const shape = shapeOf(moveOf(mv.i));
                return <li key={mv.i} className={shape ? "" : "off"} data-tip={shape ? SHAPE_WORD[shape] : "Not played in the Arena"}>{moveName(mv.i)}</li>;
              })}</ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="ev-quiet">Pick a team on the Team tab first - the Arena takes its first three.</p>
      )}
      <h3 className="lg-section">Arena</h3>
      <div className="ar-floors" role="radiogroup" aria-label="Arena">
        {[{ id: "random", name: "Any arena" }, ...ARENAS].map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={floor === a.id} className={`ar-floor${floor === a.id ? " on" : ""}`} onClick={() => choose(a.id)}>
            {a.id === "random" ? <span className="ar-floor-any">?</span> : <img src={asset(`arena/${a.id}.webp`)} alt="" loading="lazy" />}
            <b>{a.name}</b>
          </button>
        ))}
      </div>
      <p className="ar-ground">{shown ? <><b>{floorName(shown)}</b> {GROUND_SAYS[shown]} Its zones: {ZONE_SAYS[GROUND[shown].zone].toLowerCase()}.</>
        : "Each arena has its own ground, cover in its own material, and two zones that open every 30 s."}</p>
      <h3 className="lg-section">Arena Ladder</h3>
      <ol className="ar-ladder">
        {LADDER.map((m, k) => {
          const beat = ladder.includes(m.id), open = ladderOpen(m.id, ladder);
          return (
            <li key={m.id} className={beat ? "won" : open ? "next" : "shut"}>
              <button type="button" disabled={!open || !mons.length} onClick={() => challenge(m)}>
                <span className="ar-rung">{k + 1}</span>
                <span className="ar-who"><b>{m.name}</b><em>{floorName(m.arena)} · Lv {m.level}</em></span>
                <span className={`ar-type t-${m.type}`}>{m.type}</span>
                <span className="ar-pay">{beat ? "Beaten" : open ? `¥${ladderPay(m).toLocaleString()}${m.id === "champion" ? " + a pack" : ""}` : "Locked"}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <FriendBattles mons={mons} floor={floor} onStart={setOnline} />
      <h3 className="lg-section">Quick battle</h3>
      <div className="ar-modes">
        {MODES.map((md) => {
          const pays = ARENA_LEVELS.includes(md.cpu);
          const done = paid.includes(md.cpu);
          return (
            <button key={md.id} type="button" className="ar-mode" disabled={!mons.length} onClick={() => start(md.id)}>
              <b>{md.name}</b>
              <span>{md.says}</span>
              {pays && <em className={done ? "done" : ""}>{done ? "Today's prize won" : `First win today ¥${arenaPay(md.cpu, level).toLocaleString()}`}</em>}
            </button>
          );
        })}
      </div>
      <Help />
    </div>
  );
}

/* BATTLE A FRIEND: your accepted friends, each a Challenge; the challenges
   waiting for you, each an Accept. Polled while the lobby shows (no
   realtime subscription: the room is only for a match about to start). */
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
    <>
      <h3 className="lg-section">Battle a friend</h3>
      <p className="ar-ground">Live, both of you at once. The Fair format: your team's species at Lv {FAIR_LEVEL} with their level-up moves. No prize and no rating - just the fight.</p>
      {!can ? <p className="ev-quiet">Sign in to battle your friends online.</p> : (
        <>
          {invites.map((inv) => (
            <div key={inv.id} className="ar-invite" role="status">
              <span><b>{inv.card.username}</b> challenges you · {floorName(inv.arena)}</span>
              <button type="button" className="lg-go" disabled={busy || !mons.length} onClick={() => answer(inv, true)}>Accept</button>
              <button type="button" className="lg-go quiet" disabled={busy} onClick={() => answer(inv, false)}>Decline</button>
            </div>
          ))}
          {friends == null ? <p className="ev-quiet">Loading your friends…</p>
            : friends.length ? (
              <ul className="ar-friends">
                {friends.map((c) => (
                  <li key={c.user_id}>
                    <b>{c.username}</b>
                    <button type="button" className="lg-go quiet" disabled={busy || !mons.length} onClick={() => challenge(c)}>Challenge</button>
                  </li>
                ))}
              </ul>
            ) : <p className="ev-quiet">Add friends on your trainer card to battle them here.</p>}
          {msg && <p className="ar-note" role="alert">{msg}</p>}
        </>
      )}
    </>
  );
}

/* AN ONLINE MATCH between friends: the link (net.js), the handshake - each
   end's rules print and team - then matches on that link until someone
   leaves. A rematch is a new round on the same link with the next seed. */
const nextSeed = (seed) => (Math.imul(seed, 1103515245) + 12345) | 0;
// A team as the Fair format builds it, hashed: both ends must build the same fighters.
const fairPrint = (ids) => hash(JSON.stringify(fairTeam(ids)));
const fairIds = (ids) => (Array.isArray(ids) ? ids : []).filter((id) => Number.isInteger(id) && speciesById(id) && !isEvent(id)).slice(0, TEAM);
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
  /* ...and so does leaving any other way (another League tab, the Arena page
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
    <div className="ar-lobby">
      <section className="lg-hero ar-hero ar-waiting">
        <span className="lg-kicker">Online · {floorName(start.invite.arena)}</span>
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
      </section>
    </div>
  );
}

function Help() {
  const [credits, setCredits] = useState(false);
  return (
    <details className="ar-help">
      <summary>Controls and moves</summary>
      <ul>
        <li><b>Move</b> WASD or the arrows · <b>Aim</b> the mouse · <b>Moves</b> left click, right click, Q and E (or 1-4)</li>
        <li><b>Dodge</b> Space: you cannot be hit while you roll · <b>Switch</b> Tab, or Shift + 1-3 · <b>Pause</b> Esc</li>
        <li><b>Surge</b> F: landing hits, taking them, rolling through an attack at the last moment (a <b>perfect dodge</b>) and taking a zone fill your meter. Full, it throws the foe off you and powers up your blows for {SURGE_T / TPS} s - even while you are staggered.</li>
        <li><b>Controller</b>: left stick moves, right stick aims, A B X Y attack, RB dodges, LT surges, LB switches, Start pauses</li>
        <li><b>On a phone</b>: the left thumb moves, the buttons attack in the direction you face</li>
        <li>Every attack shows on the ground before it lands: a line for a shot or a beam, an arc for a blow, a ring for a pulse. Roll through it.</li>
        <li>Statuses tick in real time: burn and poison hurt every 2 s, paralysis slows you, sleep and freeze hold you still. Stat changes wear off after 10 s.</li>
        <li>The Arena's Pokémon are drawn by the artists of the PMD Sprite Repository (CC BY-NC 4.0). <button type="button" className="ar-link" onClick={() => setCredits(true)}>Sprite credits</button></li>
      </ul>
      {credits && <Credits onClose={() => setCredits(false)} />}
    </details>
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
  const input = useRef({ keys: new Set(), mouse: null, fire: null, dodge: 0, swap: -1, surge: 0, stick: [0, 0], pad: [] });
  const cpu = online ? null : master ? master.cpu : MODES.find((m) => m.id === mode).cpu;

  const teams = useMemo(() => online ? online.teams : [
    mons.map((m) => playerFighter(m)),
    master ? masterTeam(master) : cpuTeam(seed, level, Math.max(1, mons.length)),
  ], [mons, seed, level, master, online]);
  const looks = useMemo(() => online ? online.looks : [
    mons.map((m) => ({ id: m.species, shiny: variantOf(m) === "shiny" })),
    teams[1].map((f) => ({ id: f.id, shiny: false })),
  ], [mons, teams, online]);
  const s = useMemo(() => newMatch({ teams, cpu: [null, online ? null : cpu], seed, arena: floor, intro: INTRO }), [teams, cpu, seed, floor, online]);
  // Who fights, for the VS card.
  const names = useMemo(() => online ? online.names : [["You", nameOf(teams[0][0]?.id)],
    [master ? master.name : `CPU · ${MODES.find((m) => m.id === mode)?.name.split("· ")[1] ?? "Training"}`, nameOf(teams[1][0]?.id)]], [teams, master, mode, online]);

  useEffect(() => {
    const cv = canvas.current;
    const r = createRenderer(cv, looks, floor, { names, me });
    // Online: the match steps only with both inputs for a tick (arena.js's lockstep).
    const ls = online ? lockstep(online.link, me, online.round) : null;
    if (ls) online.attach(ls);
    let lastStep = performance.now(), cut = false;
    const end = (why) => { if (!cut) { cut = true; setNet(why); } };
    const onResize = () => r.resize();
    addEventListener("resize", onResize);
    let raf = 0, last = performance.now(), acc = 0, lastHud = 0, paid = false, shown = false;
    const step = 1000 / TPS;
    const inp = input.current;

    // A controller, read once a frame: sticks past a dead zone, buttons on their press.
    const pad = () => {
      const gp = navigator.getGamepads?.()?.find(Boolean);
      if (!gp) return null;
      const dz = (v) => (Math.abs(v) < 0.25 ? 0 : v);
      const was = inp.pad, now = gp.buttons.map((b) => b.pressed);
      const pressed = (i) => now[i] && !was[i];
      inp.pad = now;
      for (let k = 0; k < 4; k++) if (pressed(k)) inp.fire = { k, until: s.t + 7 };
      if (pressed(5) || pressed(7)) inp.dodge = s.t + 7;
      if (pressed(6)) inp.surge = s.t + 7;
      if (pressed(4)) inp.swap = nextAlive(s, me);
      if (pressed(9)) setPaused((p) => !p);
      return { mx: dz(gp.axes[0] ?? 0), my: dz(gp.axes[1] ?? 0), ax: dz(gp.axes[2] ?? 0), ay: dz(gp.axes[3] ?? 0) };
    };

    const build = () => {
      const mine = activeOf(s, me);
      const k = inp.keys;
      let mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      let my = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
      if (inp.stick[0] || inp.stick[1]) [mx, my] = inp.stick;
      let ax = 0, ay = 0;
      const gp = pad();
      if (gp && (gp.mx || gp.my)) { mx = gp.mx; my = gp.my; }
      if (gp && (gp.ax || gp.ay)) { ax = gp.ax * 5; ay = gp.ay * 5; }
      else if (mine && inp.mouse && !touch) {
        // The aim in TILES, so a hazard lands where the cursor is.
        const [px, py] = r.toScreen(mine.x, mine.y), tile = r.tile();
        ax = (inp.mouse[0] - px) / tile; ay = (inp.mouse[1] - py) / tile;
      }
      // A press is held for a few ticks until the move or roll can take it.
      const fire = inp.fire && inp.fire.until > s.t ? inp.fire.k : -1;
      if (mine?.act && inp.fire && mine.act.k === inp.fire.k) inp.fire = null;
      const dodge = inp.dodge > s.t;
      if (mine?.dodge) inp.dodge = 0;
      const swap = inp.swap;
      inp.swap = -1;
      const surge = inp.surge > s.t;
      if (mine?.surge) inp.surge = 0;
      return { mx, my, ax, ay, fire, dodge, swap, surge };
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      let dt = Math.min(250, now - last);
      last = now;
      if (pausedRef.current && !ls) return;      // the picture holds as it was
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
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [s, looks, touch, floor, cpu, names, me, online]);

  // Keyboard and mouse.
  useEffect(() => {
    const inp = input.current;
    const press = (k) => { inp.fire = { k, until: s.t + 7 }; };
    const down = (e) => {
      const key = e.key.toLowerCase();
      if (key === "escape") { e.preventDefault(); setPaused((p) => !p); return; }
      if (key === "tab") { e.preventDefault(); inp.swap = nextAlive(s, me); return; }
      if (e.shiftKey && /^[1-3]$/.test(e.key)) { e.preventDefault(); inp.swap = Number(e.key) - 1; return; }
      if (key === " ") { e.preventDefault(); inp.dodge = s.t + 7; return; }
      if (key === "f") { e.preventDefault(); inp.surge = s.t + 7; return; }
      if (/^[1-4]$/.test(key)) { e.preventDefault(); press(Number(key) - 1); return; }
      if (key === "q") { e.preventDefault(); press(2); return; }
      if (key === "e") { e.preventDefault(); press(3); return; }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) { e.preventDefault(); inp.keys.add(key); }
    };
    const up = (e) => inp.keys.delete(e.key.toLowerCase());
    const blur = () => inp.keys.clear();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, [s, me]);

  const onMouseMove = (e) => {
    const b = canvas.current.getBoundingClientRect();
    input.current.mouse = [e.clientX - b.left, e.clientY - b.top];
  };
  const onMouseDown = (e) => {
    if (touch || e.pointerType === "touch") return;
    onMouseMove(e);
    if (e.button === 0) input.current.fire = { k: 0, until: s.t + 7 };
    if (e.button === 2) input.current.fire = { k: 1, until: s.t + 7 };
  };

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
  /* PORTALLED TO THE BODY: the League page's `.tc-main` isolates, so a match
     drawn inside it sat under the page's own pinned header and tab strip. */
  return createPortal(
    <div className="ar-match">
      <canvas ref={canvas} className="ar-canvas" onPointerMove={onMouseMove} onPointerDown={onMouseDown}
        onContextMenu={(e) => e.preventDefault()} aria-label="Arena" />
      {view && (
        <div className={`ar-hud${view.intro ? " intro" : ""}`}>
          <Bar f={view.sides[0]} meter={view.meter[0]} mine />
          <div className={`ar-clock${view.left <= FINAL_T && !view.over ? " final" : ""}${view.left <= 10 * TPS && !view.over ? " urgent" : ""}`}>
            <b>{clock(view.left)}</b>
            <button type="button" onClick={() => setPaused(true)} aria-label="Pause">Pause</button>
          </div>
          <Bar f={view.sides[1]} meter={view.meter[1]} />
          <div className="ar-party">
            {view.party.map((p, k) => (
              <button key={k} type="button" className={`ar-slot${p.active ? " on" : ""}${p.hp <= 0 ? " down" : ""}`}
                disabled={p.active || p.hp <= 0} onClick={() => { input.current.swap = k; }}>
                <b>{nameOf(p.id)}</b><span>{p.hp} HP</span>
              </button>
            ))}
          </div>
          <div className="ar-moves">
            {view.kit.map((m, k) => {
              // Out of every damaging move: the empty buttons throw Struggle.
              const struggle = view.struggle && m.pp <= 0;
              return (
              <button key={k} type="button" className={`ar-move t-${struggle ? "normal" : m.type}${(struggle ? view.struggleReady : m.ready) ? "" : " wait"}`}
                style={{ "--cd": struggle ? view.struggleCd : m.cd }} disabled={m.pp <= 0 && !struggle}
                onPointerDown={(e) => { e.preventDefault(); input.current.fire = { k, until: s.t + 7 }; }}>
                {struggle ? <><b>Struggle</b><span>No PP left · Blow</span></> : <><b>{m.name}</b><span>{m.pp} / {m.max} PP · {SHAPE_WORD[m.shape]}</span></>}
                <kbd>{touch ? "" : ["LMB", "RMB", "Q", "E"][k]}</kbd>
              </button>
              );
            })}
            <button type="button" className={`ar-move ar-dodge${view.dodge ? "" : " wait"}`} style={{ "--cd": view.dodgeCd }}
              onPointerDown={(e) => { e.preventDefault(); input.current.dodge = s.t + 7; }}>
              <b>Dodge</b><kbd>{touch ? "" : "Space"}</kbd>
            </button>
            <button type="button" className={`ar-move ar-surge${view.meter[0] >= 1 ? " full" : " wait"}${view.surging ? " on" : ""}`}
              style={{ "--cd": view.surging ? 0 : 1 - view.meter[0] }} disabled={view.meter[0] < 1}
              onPointerDown={(e) => { e.preventDefault(); input.current.surge = s.t + 7; }}>
              <b>Surge</b><span>{view.surging ? "Surging!" : view.meter[0] >= 1 ? "Ready" : `${Math.floor(view.meter[0] * 100)}%`}</span><kbd>{touch ? "" : "F"}</kbd>
            </button>
          </div>
          {touch && <Stick input={input} />}
          {touch && <p className="ar-turn">Turn your phone sideways for a bigger arena</p>}
        </div>
      )}
      {paused && !over && !net && (
        <div className="ar-pause" role="dialog" aria-label={online ? "Leave the match?" : "Paused"}>
          <div className="ar-card">
            <h3>{online ? "Leave the match?" : "Paused"}</h3>
            {online && <p>The match keeps going while you decide.</p>}
            <button type="button" className="lg-go" onClick={() => setPaused(false)}>{online ? "Keep playing" : "Resume"}</button>
            <button type="button" className="lg-go quiet" onClick={onExit}>{online ? "Leave" : "Leave the Arena"}</button>
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
        <div className="ar-pause" role="dialog" aria-label="Result">
          <div className="ar-card">
            <span className="lg-kicker">{online ? `Online · ${view.why === "time" ? "Time" : "Knockout"}` : view.why === "time" ? "Time" : "Knockout"}</span>
            <div className="ar-result-head">
              <h3>{view.won ? "You win!" : view.lost ? "You lost" : "A draw"}</h3>
              <b className={`ar-grade g-${grade.letter}`} aria-label={`Grade ${grade.letter}`}>{grade.letter}</b>
            </div>
            <dl className="ar-stats">
              <div><dt>Knocked out</dt><dd>{view.ko[1]} / {view.sides[1].size}</dd></div>
              <div><dt>Damage</dt><dd>{view.stats.dealt.toLocaleString()}</dd></div>
              <div><dt>Best combo</dt><dd>{view.stats.best}</dd></div>
              <div><dt>Perfect dodges</dt><dd>{view.stats.perfect}</dd></div>
              <div><dt>Surges</dt><dd>{view.stats.surges}</dd></div>
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
            {!rematch?.gone && (
              <button type="button" className="lg-go" disabled={rematch?.asked} onClick={onAgain}>
                {!online ? "Again" : rematch.asked ? `Waiting for ${online.foe}…` : rematch.offered ? `${online.foe} wants a rematch - accept` : "Rematch"}
              </button>
            )}
            {rematch?.gone && <p className="ar-note">{online.foe} has left.</p>}
            <button type="button" className="lg-go quiet" onClick={onExit}>Back to the Arena</button>
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
const nextAlive = (s, me) => {
  const sd = s.sides[me];
  for (let k = 1; k < sd.team.length; k++) {
    const i = (sd.active + k) % sd.team.length;
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
    t: s.t, left: LIMIT - s.t, over: s.over, won: s.over && s.winner === me, lost: s.over && s.winner === 1 - me, why: s.why, intro: s.intro > 0,
    meter: [me, 1 - me].map((k) => s.sides[k].meter / SURGE_MAX), surging: f0.surge > 0,
    sides: [side(me), side(1 - me)],
    party: mine.team.map((f, k) => ({ id: f.id, hp: f.hp, active: k === mine.active })),
    stats: { ...mine.stats }, struggle: spent(f0),
    struggleReady: !(f0.struggle?.cd > 0), struggleCd: f0.struggle?.cd ? f0.struggle.cd / cooldownOf(moveOf(STRUGGLE)) : 0,
    hpShare: mine.team.reduce((n, f) => n + f.hp, 0) / Math.max(1, mine.team.reduce((n, f) => n + f.max, 0)),
    kit: f0.kit.map((m) => {
      const data = moveOf(m.i);
      return { name: moveName(m.i), type: data.t ?? "normal", pp: m.pp, max: Math.max(m.pp, Math.ceil((data.pp ?? 10) / 2), 3),
        ready: m.cd === 0, cd: m.cd ? m.cd / cooldownOf(data) : 0, shape: shapeOf(data) };
    }),
    dodge: f0.dodgeCd === 0, dodgeCd: f0.dodgeCd ? f0.dodgeCd / DODGE_CD : 0,
    ko: [me, 1 - me].map((k) => s.sides[k].team.filter((f) => f.hp <= 0).length),
  };
}

function Bar({ f, meter, mine }) {
  return (
    <div className={`ar-bar${mine ? " mine" : ""}`}>
      <div className="ar-bar-top"><b>{nameOf(f.id)}</b><span>Lv {f.level}</span></div>
      <i className="ar-hp">
        <i className="ar-hp-lag" style={{ transform: `scaleX(${Math.max(0, f.hp / f.max)})` }} />
        <i style={{ transform: `scaleX(${Math.max(0, f.hp / f.max)})` }} />
      </i>
      <i className={`ar-meter${meter >= 1 ? " full" : ""}`}><i style={{ transform: `scaleX(${meter})` }} /></i>
      <div className="ar-bar-low">
        <span>{f.hp} / {f.max} HP</span>
        <span className="ar-tags">
          {f.status >= 0 && <em className={`ar-st st-${f.status}`}>{STATUS_TAG[f.status]}</em>}
          {f.stages.map(([k, v]) => <em key={k} className={v > 0 ? "up" : "down"}>{STAT[k]}{v > 0 ? "▲" : "▼"}{Math.abs(v) > 1 ? 2 : ""}</em>)}
          <span>{"●".repeat(f.left)}{"○".repeat(f.size - f.left)}</span>
        </span>
      </div>
    </div>
  );
}

/* THE THUMB STICK (touch): it appears where the left thumb lands and reads
   how far and which way it is pulled. Window pointer events, no capture. */
function Stick({ input }) {
  const [at, setAt] = useState(null);     // [x, y, dx, dy]
  const id = useRef(null);
  useEffect(() => {
    const move = (e) => {
      if (e.pointerId !== id.current) return;
      setAt((a) => {
        if (!a) return a;
        const dx = e.clientX - a[0], dy = e.clientY - a[1], l = Math.hypot(dx, dy);
        const k = l > 8 ? Math.min(1, l / 48) / l : 0;
        input.current.stick = [dx * k, dy * k];
        return [a[0], a[1], dx, dy];
      });
    };
    const up = (e) => {
      if (e.pointerId !== id.current) return;
      id.current = null; setAt(null); input.current.stick = [0, 0];
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
  }, [input]);
  return (
    <div className="ar-stickzone" onPointerDown={(e) => { id.current = e.pointerId; setAt([e.clientX, e.clientY, 0, 0]); }}>
      {at && (
        <span className="ar-stick" style={{ left: at[0], top: at[1] }}>
          <i style={{ transform: `translate(${Math.max(-48, Math.min(48, at[2]))}px, ${Math.max(-48, Math.min(48, at[3]))}px)` }} />
        </span>
      )}
    </div>
  );
}
