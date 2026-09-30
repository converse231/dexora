/* THE POKEMON LEAGUE (docs/battles.md): every region's gyms, their trainers,
   its Elite Four and Champion - a page, never the map, loaded on demand (App
   imports it lazily), so a player who never battles never downloads the
   rules, the rosters or the moves. Only this folder imports them (asserted).

   THE TRADE CENTER'S SHAPE, on purpose: one scroll, the header and the
   region strip pinned, the modal lock, `#/league` so the browser's Back
   leaves, and ONE back button in the corner that peels a stacked view
   (choosing a team) before it leaves. The fight covers the page.

   While it is open the game underneath is paused (`engine.pause`): no walk,
   no redraw of a map nobody can see, and every timer shifted on the way out. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEAGUES } from "../../data/leagues.js";
import {
  opponent, playerFighter, rankedFighter, refusal, effectiveness, AI_FOR, hardParty, learnable, movesOf,
} from "../../game/battle.js";
import {
  teamSize, REMATCH_CAP_STEP, isOpen, hardOpen, hardCleared, charmOf, giftOf, feeFor, CHARM_MAX, REGIONS,
} from "../../game/league.js";
import { MOVES } from "../../data/moves.js";
import { HEALS, TUTOR_PRICE, CANDY_PRICE } from "../../game/items.js";
import { pricedAt } from "../../game/trainer.js";
import { ShopShelf } from "../Shop.jsx";
import { REMATCH_STEPS } from "../../data/gymtune.js";
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { variantOf } from "../../game/items.js";
import { hash } from "../../game/daily.js";
import { useModalLock } from "../modal.js";
import Sprite from "../Sprite.jsx";
import Types from "../Types.jsx";
import Picker, { keyOf } from "../trade/Picker.jsx";
import Fight, { moveName } from "./Fight.jsx";
import { standing, tuneOf, trainerName } from "./progress.js";
import Ranked from "./Ranked.jsx";
import { CHAR_PIC } from "../../game/ranked.js";
import { rankedStep } from "../../net/cloud.js";

/* The Ranked tab sits first in the region strip under its own id, which is
   not a region's; the strip remembers it like one. */
const RANKED = "ranked";
// The League's shop and Train tab (phase 8) sit beside it, under ids no region has.
const SHOP = "shop", TRAIN = "train";

const asset = (path) => new URL(path, document.baseURI).href;
const REGION_KEY = "dexora-league-region";
const readRegion = () => { try { return localStorage.getItem(REGION_KEY); } catch { return null; } };
const writeRegion = (id) => { try { localStorage.setItem(REGION_KEY, id); } catch { /* a preference */ } };

/* An opponent as it will fight: the fighters `opponent()` builds, the one
   definition, at its level NOW - a rematch win raises it (league.js). */
const teamOf = (o, beaten) => opponent(o.party, tuneOf(o, beaten).top, (slot) => hash(`${o.id}:${slot}`));
const sizeOf = (o) => teamSize(o.id, o.party.length);
const yen = (n) => `¥${n.toLocaleString("en-US")}`;
const badgeWord = (r) => (r.id === "alola" ? "Z-Crystals" : "badges");

function Lock() {
  return (
    <svg className="lg-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
    </svg>
  );
}

/* A PARTY IN A ROW: the Pokemon as they will fight, each with its level. */
function Party({ team, small = false }) {
  return (
    <ul className={`lg-party${small ? " small" : ""}`} aria-label="Their team">
      {team.map((f, k) => (
        <li key={k}>
          <Sprite id={f.id} alt={label(speciesById(f.id))} />
          <i>Lv {f.level}</i>
        </li>
      ))}
    </ul>
  );
}

/* WHO, as every card heads it: the portrait on its type's ground, the
   role, the name, the facts and the stamp. */
function Head({ o, kind, region, order, tune, stamp, hard = false }) {
  const champ = kind === "champion";
  return (
    <div className="lg-card-head">
      <div className="lg-portrait">
        <img src={asset(`trainers/${o.pic}.png`)} alt="" loading="lazy" />
      </div>
      <div className="lg-who">
        <span className="lg-kicker">
          {kind === "leader" ? (region.id === "alola" ? `Grand trial ${order}` : `Gym ${order}`)
            : champ ? "Champion" : `League · ${order}`}{hard ? " · Hard" : ""}
        </span>
        <h4>{o.name}</h4>
        <div className="lg-facts">
          {o.type && kind === "leader" && <Types of={[o.type]} />}
          <span className="lg-cap" data-tip="The highest level you may bring">Lv {tune.cap} cap</span>
          {tune.top > 100 && <span className="lg-trained" data-tip="Trained past Lv 100: its stats run higher than its level says">TRAINED</span>}
        </div>
        {kind === "leader" && (
          <span className="lg-badge">
            {/* A hard opponent's badge is its gym's (`base`): the art is keyed on the gym id. */}
            <img src={asset(`badges/${o.base?.id ?? o.id}.png`)} alt="" loading="lazy" />{o.badge}
          </span>
        )}
      </div>
      <span className={`lg-stamp ${stamp}`}>
        {stamp === "won" ? "BEATEN" : stamp === "open" ? "OPEN" : <><Lock />LOCKED</>}
      </span>
    </div>
  );
}

/* ONE LEAGUE OPPONENT: an Elite Four member or the Champion. */
function Card({ o, kind, st, region, onBattle, order, beaten, steps }) {
  const tune = tuneOf(o, beaten, steps);
  const team = useMemo(() => teamOf(o, beaten), [o, beaten]);
  return (
    <article className={`lg-card t-${o.type ?? "normal"}${kind === "champion" ? " champ" : ""}${st.won ? " won" : ""}${st.open ? "" : " shut"}`}>
      <Head o={o} kind={kind} region={region} order={order} tune={tune} stamp={st.won ? "won" : st.open ? "open" : ""} />
      <Party team={team} />
      <div className="lg-card-go">
        {st.open ? (
          <span className="lg-go-row">
            <button type="button" className="lg-go" onClick={() => onBattle(o, kind)}>
              {st.won ? "Rematch" : "Battle"}
            </button>
            <Prize tune={tune} won={st.won} />
          </span>
        ) : <p className="lg-why"><Lock />{st.why}</p>}
      </div>
    </article>
  );
}

/* A GYM IS A PATH (docs/battles.md, *Order in a region*, rev 5): its
   trainers in the roster's order, then its leader, each opening when the one
   before is beaten - you walk through a gym to its leader, as in the games.
   The path is drawn as steps; under it, the STAGE shows whoever is next (or
   the step you tap: anyone beaten can be fought again). */
function GymCard({ g, st, region, order, beaten, steps, onBattle }) {
  const tune = tuneOf(g, beaten, steps);
  const path = useMemo(() => [
    ...g.trainers.map((t, k) => ({ o: t, kind: "trainer", st: st.trainers[k] })),
    { o: g, kind: "leader", st },
  ], [g, st]);
  const next = path.findIndex((p) => p.st.open && !p.st.won);
  const [sel, setSel] = useState(null);
  const at = sel ?? (next >= 0 ? next : path.length - 1);
  const done = st.trainers.filter((t) => t.won).length;
  return (
    <article className={`lg-card lg-gym t-${g.type ?? "normal"}${st.won ? " won" : ""}${st.reached ? "" : " shut"}`}>
      <Head o={g} kind="leader" region={region} order={order} tune={tune} stamp={st.won ? "won" : st.reached ? "open" : ""} />
      {path.length > 1 && (
        <div className="lg-path-wrap">
          <span className="lg-kicker">Gym trainers · {done}/{g.trainers.length}</span>
          <ol className="lg-path" aria-label={`${g.name}'s gym, in order`}>
            {path.map((p, k) => {
              const name = p.kind === "leader" ? `Leader ${g.name}` : trainerName(p.o);
              const state = p.st.won ? "beaten" : p.st.open ? "next" : "locked";
              return (
                <li key={p.o.id} className={`${state}${p.kind === "leader" ? " lead" : ""}`}>
                  <button type="button" aria-pressed={k === at} onClick={() => setSel(k)}
                    aria-label={`${name}, ${state}`} data-tip={name}>
                    <img src={asset(`trainers/${p.o.pic}.png`)} alt="" loading="lazy" />
                    {p.kind === "leader" && <img className="lg-step-badge" src={asset(`badges/${g.id}.png`)} alt="" loading="lazy" />}
                    {p.st.won && p.kind !== "leader" && <b className="lg-step-won" aria-hidden="true">✓</b>}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <Stage p={path[at]} next={at === next} leader={g} beaten={beaten} steps={steps} onBattle={onBattle} />
    </article>
  );
}

/* THE STAGE: one step of a gym - who, their team, what a win pays, and the
   button (or what opens it). */
function Stage({ p, next, leader, beaten, steps, onBattle }) {
  const tune = tuneOf(p.o, beaten, steps);
  const team = useMemo(() => teamOf(p.o, beaten), [p.o, beaten]);
  const lead = p.kind === "leader";
  return (
    <div className={`lg-stage${lead ? " lead" : ""}`}>
      <div className="lg-stage-who">
        <span className="lg-kicker">{p.st.won ? (lead ? "Beaten" : "Beaten · no prize again") : next ? "Next up" : "Locked"}</span>
        <b>{lead ? `Leader ${leader.name}` : trainerName(p.o)}</b>
      </div>
      <Party team={team} small={!lead} />
      <div className="lg-card-go">
        {p.st.open ? (
          <span className="lg-go-row">
            <button type="button" className={`lg-go${lead ? "" : " small"}`} onClick={() => onBattle(p.o, p.kind)}>
              {p.st.won ? (lead ? "Rematch" : "Again") : "Battle"}
            </button>
            {lead ? <Prize tune={tune} won={p.st.won} />
              : !p.st.won && <span className="lg-prize">Prize <b>{yen(tune.pay)}</b></span>}
          </span>
        ) : <p className="lg-why"><Lock />{p.st.why}</p>}
      </div>
    </div>
  );
}

/* WHAT A WIN PAYS, the engine's own answer (`payFor`): the prize before the
   first win, then the rematch's share of it, refilling as you walk - drawn
   as a meter, because "come back later" needs to say how much later. */
function Prize({ tune, won }) {
  if (!won) return <span className="lg-prize" data-tip="Paid once, for the first win">Prize <b>{yen(tune.pay)}</b></span>;
  const left = Math.ceil((1 - tune.clock) * REMATCH_STEPS);
  return (
    <span className="lg-prize" data-tip={tune.clock >= 1
      ? `Ready: a rematch win pays in full, and raises the cap by ${REMATCH_CAP_STEP}`
      : `Refills as you walk: full in ${left.toLocaleString("en-US")} steps`}>
      <span className="lg-clock" role="meter" aria-label="Rematch prize" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(tune.clock * 100)}>
        <i style={{ transform: `scaleX(${tune.clock})` }} />
      </span>
      <b>{yen(tune.pay)}</b>
    </span>
  );
}

/* ---------------------------------------------------------------- phase 8 */

/* A HARD-MODE OPPONENT (docs/battles.md, phase 8): the same trainer on its
   strongest team, every member at Lv 100, under its own id. */
const hardOf = (o) => ({ ...o, id: `${o.id}:hard`, party: hardParty(o.hard), base: o });
// A League member's type is its ace's, where the roster names none.
const leagueOf = (p) => ({ ...p, type: p.type ?? speciesById(p.party.at(-1)[0]).types[0] });

/* EVERY SEQUENCE AN OPPONENT STANDS IN: each gym's path (its trainers, then
   its leader), the League run, and the hard run - `{ o, kind }` in order. */
function sequencesOf(r) {
  return [
    ...r.gyms.map((g) => [...g.trainers.map((t) => ({ o: t, kind: "trainer" })), { o: g, kind: "leader" }]),
    r.league.map((p) => ({ o: leagueOf(p), kind: p.champion ? "champion" : "league" })),
    [...r.gyms.map((g) => ({ o: hardOf(g), kind: "hard" })),
      ...r.league.map((p) => ({ o: { ...hardOf(p), type: leagueOf(p).type }, kind: "hard" }))],
  ];
}
/* THE NEXT BATTLE after `id` in its own sequence: the first one open and not
   yet beaten after it - the gym's next trainer, then its leader. Null at the
   end of the gym (or run), or when the next door is not open yet. */
export function nextAfter(id, beaten) {
  for (const r of LEAGUES) {
    for (const seq of sequencesOf(r)) {
      const k = seq.findIndex((x) => x.o.id === id);
      if (k >= 0) return seq.slice(k + 1).find((x) => isOpen(x.o.id, beaten) && !beaten[x.o.id]) ?? null;
    }
  }
  return null;
}
const tierWord = (t) => (t ? t[0].toUpperCase() + t.slice(1) : "");

/* WHAT HARD MODE GIVES, shown whether or not it is open yet - a locked door
   with the prize written on it is a goal. */
function HardRewards({ region, run, beaten, open }) {
  const done = run.filter((h) => beaten[h.o.id]).length;
  const cleared = hardCleared(region.id, beaten);
  const charm = charmOf(beaten);
  return (
    <section className="lg-hard-rewards">
      <div className="lg-hard-top">
        <span className="lg-kicker">Hard mode · every Pokémon Lv 100</span>
        <b>{open ? `${done} of ${run.length} beaten` : `Clear ${region.name} to open it`}</b>
      </div>
      <ul>
        <li>
          <img src={asset("items/master-ball.png")} alt="" />
          <span><i>{cleared ? "WON" : "CLEAR ALL " + run.length}</i><b>A Master Ball</b></span>
        </li>
        <li>
          <span className="lg-charm" aria-hidden="true">✦</span>
          <span><i>{cleared ? "WON" : "AND"}</i><b>Region Charm: rare forms ×{(1 + CHARM_MAX / REGIONS.length).toFixed(2)}</b></span>
        </li>
        <li>
          <span className="lg-charm" aria-hidden="true">★</span>
          <span><i>EVERY FIRST WIN</i><b>Their signature Pokémon, Shiny</b></span>
        </li>
      </ul>
      {charm > 1 && <p className="lg-hard-note">Your charms so far: rare forms ×{charm.toFixed(2)} everywhere.</p>}
    </section>
  );
}

/* ONE HARD OPPONENT: who, their Lv 100 team, the signature Pokemon a first
   win gives, and the fee that a win gives back. */
function HardCard({ h, st, region, order, beaten, steps, money, onBattle }) {
  const { o, kind } = h;
  const tune = tuneOf(o, beaten, steps);
  const team = useMemo(() => teamOf(o, beaten), [o, beaten]);
  const gift = giftOf(o.id);
  const fee = feeFor(o.id);
  return (
    <article className={`lg-card lg-hardcard${kind === "champion" ? " champ" : ""}${st.won ? " won" : ""}${st.open ? "" : " shut"}`}>
      <Head o={o} kind={kind} region={region} order={order} tune={tune} hard
        stamp={st.won ? "won" : st.open ? "open" : ""} />
      <Party team={team} />
      <p className="lg-from">Their team from {o.base.hardFrom === "first battle" ? "their first battle" : o.base.hardFrom}</p>
      <div className="lg-card-go">
        {st.open ? (
          <span className="lg-go-row">
            <button type="button" className="lg-go" disabled={fee > money} onClick={() => onBattle(o, "hard")}>
              {st.won ? "Rematch" : "Battle"}
            </button>
            <span className="lg-prize" data-tip="Paid for each try and given back with the win">Entry <b>{yen(fee)}</b></span>
            {!st.won && <span className="lg-prize">Prize <b>{yen(tune.pay)}</b></span>}
          </span>
        ) : <p className="lg-why"><Lock />{st.why}</p>}
        {gift && (
          <span className={`lg-gift${st.won ? " given" : ""}`} data-tip={st.won ? "Given on your first win" : "Yours on the first win"}>
            <Sprite id={gift.species} variant={gift.tier} alt="" />
            <span><i>{st.won ? "GIVEN" : "FIRST WIN"}</i><b>{label(speciesById(gift.species))}{gift.tier ? `, ${tierWord(gift.tier)}` : ""}</b></span>
          </span>
        )}
      </div>
    </article>
  );
}

function HardView({ region, beaten, steps, money, onBattle }) {
  const open = hardOpen(region.id, beaten);
  const run = useMemo(() => [
    ...region.gyms.map((g, k) => ({ o: hardOf(g), kind: "leader", order: k + 1 })),
    ...region.league.map((p, k) => ({
      o: { ...hardOf(p), type: leagueOf(p).type }, kind: p.champion ? "champion" : "league", order: k + 1,
    })),
  ], [region]);
  const say = (h, k) => (!open ? `Clear ${region.name} first: every gym, its trainers and its League.`
    : `Beat ${run[k - 1]?.o.name} on hard first.`);
  return (
    <>
      <HardRewards region={region} run={run} beaten={beaten} open={open} />
      <div className="lg-list">
        {run.map((h, k) => (
          <HardCard key={h.o.id} h={h} region={region} order={h.order} beaten={beaten} steps={steps} money={money}
            st={{ open: isOpen(h.o.id, beaten), won: Boolean(beaten[h.o.id]), why: say(h, k) }}
            onBattle={onBattle} />
        ))}
      </div>
    </>
  );
}

/* THE LEAGUE'S SHOP (phase 8): the Battle shelf, sold where battles are. */
function BattleShop({ money, bag, level, stats, onBuy }) {
  return (
    <section className="lg-shop">
      <div className="lg-shop-head">
        <div>
          <span className="lg-kicker">Battle shelf</span>
          <h4>Items for League battles</h4>
          <p>Used from the Bag in a battle, in place of a move. X items boost the Pokémon that is out.</p>
        </div>
        <b className="lg-wallet">{yen(money)}</b>
      </div>
      <ShopShelf items={HEALS} money={money} bag={bag} level={level} stats={stats} onBuy={onBuy} first={HEALS[0].id} />
    </section>
  );
}

/* TRAIN (phase 8): choose a Pokemon, then RAISE it - Rare Candy bought and
   spent here, so a team for a cap or for ranked's Lv 100 is one page away -
   and TEACH it: tap one of its four moves, tap a move its line learns by its
   level to put there, and pay for each new one. Moves are League battles
   only - ranked's format sets every move.

   Read fresh from the Box every render: the engine raises a level IN PLACE,
   so a memoised copy showed the old level after every candy. */
function Train({ engine, box, money, stats, candy }) {
  const mons = box.map((m) => ({ ...m, tier: variantOf(m) }));
  const [picked, setPicked] = useState([]);
  const mon = mons.find((m) => keyOf(m) === picked[0]) ?? null;
  const taught = mon?.moves?.join() ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => (mon ? movesOf(mon) : []), [mon?.uid, mon?.species, mon?.level, taught]);
  const [draft, setDraft] = useState([]);
  const [slot, setSlot] = useState(0);
  const [q, setQ] = useState("");
  const [note, setNote] = useState(null);
  useEffect(() => { setDraft(now); setSlot(0); setNote(null); }, [now]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const can = useMemo(() => (mon ? learnable(mon.species, mon.level) : []), [mon?.species, mon?.level]);
  const candyPrice = pricedAt(CANDY_PRICE, stats);
  const toTop = mon ? Math.max(0, 100 - mon.level) : 0;
  const raise = (n) => engine.levelUp(mon.uid, Math.min(n, toTop, candy));
  const lacking = Math.max(0, toTop - candy);
  const price = pricedAt(TUTOR_PRICE, stats);
  const fresh = draft.filter((i) => !now.includes(i)).length;
  const cost = fresh * price;
  const put = (i) => {
    setDraft((d) => {
      const next = [...d];
      if (next.includes(i)) return d;
      next[Math.min(slot, next.length)] = i;
      return next.slice(0, 4);
    });
    setSlot((s) => Math.min(3, s + 1));
  };
  const teach = () => {
    const no = engine.tutor(mon.uid, draft.map((i) => MOVES[i].n), now.map((i) => MOVES[i].n));
    setNote(no ? { stale: "That Pokémon's moves changed - pick it again.", money: "Not enough money.", same: "Nothing new to teach." }[no] ?? "Could not teach that." : "Learned!");
  };
  const shown = can.filter((i) => !q || moveName(i).toLowerCase().includes(q.toLowerCase()) || MOVES[i].t.includes(q.toLowerCase()));
  return (
    <div className="lg-pick lg-tutor">
      <section className="rk-edit-head">
        <span className="lg-kicker">Train</span>
        <h4>Raise a Pokémon and teach it moves</h4>
        <p className="lg-tutor-lede">Rare Candy raises it a level each ({yen(candyPrice)} a candy). The Move Tutor teaches any move its evolution line learns by its level, {yen(price)} for each new one - League battles only; ranked sets every move.</p>
      </section>
      {!mon ? (
        <Picker mons={mons} picked={picked} max={1} onChange={setPicked} prefer="high" sort="level" level
          empty="Your Box is empty - catch some Pokémon first." />
      ) : (
        <>
          <section className="lg-tutor-mon">
            <Sprite id={mon.species} variant={mon.tier} alt="" />
            <div>
              <b>{label(speciesById(mon.species))}</b>
              <i>Lv {mon.level} · {can.length} moves it can learn</i>
            </div>
            <button type="button" className="tp-quiet" onClick={() => setPicked([])}>Another Pokémon</button>
          </section>
          <section className="lg-raise" aria-label="Raise its level">
            <div className="lg-raise-top">
              <span className="lg-kicker">Level</span>
              <b>Lv {mon.level}</b>
              <i>{toTop ? `${toTop} to Lv 100` : "Lv 100 - ready for ranked"}</i>
              <span className="lg-candy"><img src={asset("items/rare-candy.png")} alt="" />{candy.toLocaleString("en-US")}</span>
            </div>
            {toTop > 0 && (
              <div className="lg-raise-go">
                {[1, 10].map((n) => (
                  <button key={n} type="button" className="lg-go small quiet" disabled={!candy}
                    onClick={() => raise(n)}>+{Math.min(n, toTop)} Lv</button>
                ))}
                <button type="button" className="lg-go small" disabled={!candy} onClick={() => raise(toTop)}>
                  {candy >= toTop ? "To Lv 100" : `+${candy} Lv`}
                </button>
                {lacking > 0 && (
                  <button type="button" className="lg-go small quiet" disabled={money < candyPrice * lacking}
                    data-tip={`${lacking} Rare Candy for ${yen(candyPrice * lacking)}`}
                    onClick={() => engine.buyCandy(lacking)}>
                    Buy {lacking} candy · {yen(candyPrice * lacking)}
                  </button>
                )}
              </div>
            )}
          </section>
          <span className="lg-kicker lg-moves-head">Moves</span>
          <ol className="lg-slots" aria-label="Its four moves">
            {[0, 1, 2, 3].map((k) => {
              const i = draft[k];
              return (
                <li key={k}>
                  <button type="button" aria-pressed={slot === k} onClick={() => setSlot(k)}
                    className={`ft-move ${i != null ? `t-${MOVES[i].t}` : "empty"}${i != null && !now.includes(i) ? " new" : ""}`}>
                    <b>{i != null ? moveName(i) : "Empty"}</b>
                    {i != null && <span className="ft-move-meta"><i>{MOVES[i].t.toUpperCase()}</i><u>{MOVES[i].p ? `POW ${MOVES[i].p}` : "STATUS"}</u></span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="lg-tutor-go">
            <span className="lg-prize">{fresh ? <>{fresh} new · <b>{yen(cost)}</b></> : "Tap a slot, then a move"}</span>
            <button type="button" className="lg-go" disabled={!fresh || cost > money} onClick={teach}>Teach</button>
            <button type="button" className="lg-go quiet" disabled={!fresh} onClick={() => setDraft(now)}>Undo</button>
          </div>
          {note && <p className="lg-refused" role="status">{note}</p>}
          <input className="lg-tutor-q" type="search" placeholder="Search moves or a type" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Search moves" />
          <ul className="lg-learn">
            {shown.map((i) => (
              <li key={i}>
                <button type="button" className={`ft-move t-${MOVES[i].t}`} disabled={draft.includes(i)} onClick={() => put(i)}>
                  <b>{moveName(i)}</b>
                  <span className="ft-move-meta"><i>{MOVES[i].t.toUpperCase()}</i><u>{MOVES[i].p ? `POW ${MOVES[i].p}` : "STATUS"}{MOVES[i].a ? ` · ${MOVES[i].a}%` : ""}</u></span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* CHOOSING A TEAM: who may come (and, for everyone else, why not), picked
   with the Trade Center's picker - a tap takes your highest level of that
   Pokemon - and one pinned button to go. */
function TeamPick({ o, kind, box, last, beaten, steps, onFight }) {
  const tune = tuneOf(o, beaten, steps);
  const size = sizeOf(o);
  const theirs = useMemo(() => teamOf(o, beaten), [o, beaten]);
  const mons = useMemo(() => box.map((m) => ({ ...m, tier: variantOf(m) })), [box]);
  const ok = useMemo(() => mons.filter((m) => !refusal(m, tune.cap)), [mons, tune.cap]);
  const why = useMemo(() => {
    const n = { level: 0, legend: 0, locked: 0 };
    for (const m of mons) { const r = refusal(m, tune.cap); if (r) n[r]++; }
    return n;
  }, [mons, tune.cap]);
  const byKey = useMemo(() => new Map(ok.map((m) => [keyOf(m), m])), [ok]);
  /* The last team you took, as much of it as may come to this one - found by
     uid, then keyed as the Picker keys it (a Pokemon registered for trading
     is keyed by its server id: `keyOf({uid})` missed every one of those). */
  const [picked, setPicked] = useState(() => last.map((uid) => ok.find((m) => m.uid === uid)).filter(Boolean)
    .map(keyOf).slice(0, size));
  const team = picked.map((k) => byKey.get(k)).filter(Boolean);

  /* ONE TAP FOR A SENSIBLE TEAM: your highest levels, one of each species,
     favouring what hits their ace's types - the reference player the League
     is tuned against does the same. */
  const suggest = () => {
    const ace = theirs.reduce((a, f) => (f.level > a.level ? f : a), theirs[0]);
    // A type that hits their ace is worth a few levels; one of each species.
    const hits = (m) => speciesById(m.species).types.some((t) => effectiveness(t, ace.types) > 1);
    const score = (m) => m.level + (hits(m) ? 4 : 0);
    const seen = new Set();
    const best = [...ok].sort((a, b) => score(b) - score(a))
      .filter((m) => (seen.has(m.species) ? false : seen.add(m.species)));
    setPicked(best.slice(0, size).map(keyOf));
  };

  const cap = tune.cap;
  const refusedCount = why.level + why.legend + why.locked;
  return (
    <div className="lg-pick">
      <section className="lg-foe">
        <img className="lg-foe-pic" src={asset(`trainers/${o.pic}.png`)} alt="" />
        <div className="lg-foe-who">
          <span className="lg-kicker">{kind === "trainer" ? o.cls : kind === "hard" ? "Hard mode · Lv 100" : kind === "champion" ? "Champion" : kind === "league" ? "Elite Four" : "Leader"}</span>
          <h4>{o.name}</h4>
          <Party team={theirs} small />
        </div>
      </section>

      <ul className="lg-rules">
        <li><b>{size}</b> Pokémon at most</li>
        {kind !== "trainer" && <li>Up to <b>Lv {cap}</b></li>}
        {kind !== "trainer" && <li>Legendaries: a lower limit, <b>by strength</b></li>}
        <li>{tune.wins ? "Rematch" : "Prize"} <b>{yen(tune.pay)}</b></li>
        {feeFor(o.id) > 0 && <li>Entry <b>{yen(feeFor(o.id))}</b>, back on a win</li>}
      </ul>

      <div className="lg-pick-head">
        <h4>Your team</h4>
        {ok.length > 0 && <button type="button" className="tp-quiet" onClick={suggest}>Suggest a team</button>}
      </div>
      <Picker
        mons={ok}
        picked={picked}
        max={size}
        onChange={setPicked}
        prefer="high"
        sort="level"
        level
        empty={box.length
          ? `None of your Pokémon may enter: this fight takes Lv ${cap} and under. Catch a fresh one, or raise a young one with Rare Candy.`
          : "Your Box is empty - catch some Pokémon first."}
      />
      {refusedCount > 0 && (
        <p className="lg-refused">
          Not allowed here:{" "}
          {[why.level && `${why.level} over Lv ${cap}`,
            why.legend && `${why.legend} legendar${why.legend > 1 ? "ies" : "y"} over its limit`,
            why.locked && `${why.locked} in a trade`].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="lg-dock">
        <span className="lg-dock-team" aria-label="Your team">
          {Array.from({ length: size }, (_, k) => (
            <i key={k} className={team[k] ? "on" : ""}>
              {team[k] && <Sprite id={team[k].species} variant={team[k].tier} alt="" />}
            </i>
          ))}
        </span>
        <button type="button" className="lg-go big" disabled={!team.length} onClick={() => onFight(team)}>
          Battle!
        </button>
      </div>
    </div>
  );
}

export default function League({
  engine, box = [], beaten = {}, steps = 0, team = [], signedIn = false, onClose,
  money = 0, bag = {}, level = 1, stats = null, candy = 0,
}) {
  useModalLock();
  const page = useRef(null);
  const head = useRef(null);
  const st = useMemo(() => standing(beaten), [beaten]);
  const firstOpen = () => {
    const saved = readRegion();
    if ([RANKED, SHOP, TRAIN].includes(saved)) return saved;
    if (saved && st[LEAGUES.findIndex((r) => r.id === saved)]?.open) return saved;
    const k = st.findIndex((s) => s.open && !s.cleared);
    return LEAGUES[k >= 0 ? k : 0].id;
  };
  const [regionId, setRegionId] = useState(firstOpen);
  const [pick, setPick] = useState(null);    // { o, kind }
  const [fight, setFight] = useState(null);  // { o, kind, team, n }
  const [editing, setEditing] = useState(null);   // the defense team slot being edited
  const [nonce, setNonce] = useState(0);          // a ranked battle closed: the Ranked tab reloads its standing
  const ranked = regionId === RANKED, shop = regionId === SHOP, train = regionId === TRAIN;
  // Normal or hard: one switch for every region, remembered while the page is open.
  const [hard, setHard] = useState(false);
  const ri = LEAGUES.findIndex((r) => r.id === regionId);
  const region = LEAGUES[ri], rs = st[ri];
  const sub = pick || (ranked && editing);       // a stacked view the one Back peels

  // The game underneath stops while this covers it.
  useEffect(() => {
    engine?.pause(true);
    return () => engine?.pause(false);
  }, [engine]);

  const back = useCallback(() => {
    if (fight) return;                  // the fight has its own Escape (forfeit)
    if (pick) setPick(null);
    else if (ranked && editing) setEditing(null);
    else onClose();
  }, [fight, pick, ranked, editing, onClose]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !fight) { e.preventDefault(); back(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [back, fight]);

  // The browser's Back leaves the page (App watches the hash).
  useEffect(() => {
    if (!location.hash.startsWith("#/league")) history.pushState({ lg: 1 }, "", "#/league");
  }, []);
  useEffect(() => { page.current?.scrollTo(0, 0); }, [regionId, pick, editing]);
  useEffect(() => {
    const ro = new ResizeObserver(() => page.current?.style.setProperty("--tc-head-h", `${head.current.offsetHeight}px`));
    ro.observe(head.current);
    return () => ro.disconnect();
  }, []);
  // Keep the chosen region's tab in view in the strip.
  const strip = useRef(null);
  useEffect(() => {
    strip.current?.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [regionId]);

  const choose = (id) => { setRegionId(id); writeRegion(id); };
  const totalBadges = st.reduce((n, s) => n + s.badges, 0);

  /* THE NEXT BATTLE, straight from the result card: the same team, re-read
     from the Box, when all of it may enter; else its team pick, which starts
     from that team. */
  const upNext = fight && !fight.remote && fight.kind !== "practice" ? nextAfter(fight.o.id, beaten) : null;
  const goNext = () => {
    const nx = upNext;
    const mons = fight.mons.map((m) => box.find((x) => x.uid === m.uid)).filter(Boolean)
      .map((m) => ({ ...m, tier: variantOf(m) }));
    const cap = tuneOf(nx.o, beaten, steps).cap;
    const fits = mons.length && mons.length === fight.mons.length && mons.length <= sizeOf(nx.o)
      && mons.every((m) => !refusal(m, cap));
    setFight(null);
    if (fits && (nx.kind !== "hard" || feeFor(nx.o.id) <= money)) {
      setPick(null);
      setFight({ o: nx.o, kind: nx.kind, n: fight.n + 1, mine: mons.map(playerFighter), mons, foe: teamOf(nx.o, beaten) });
    } else setPick({ o: nx.o, kind: nx.kind });
  };

  const startFight = (team) => {
    const { o, kind } = pick;
    setFight({
      o, kind, n: (fight?.n ?? 0) + 1,
      mine: team.map(playerFighter),
      mons: team,
      foe: teamOf(o, beaten),
    });
  };
  /* A PRACTICE BATTLE (Ranked.jsx): both teams in ranked's format - species at
     the format's level, IVs and moves, whatever the box says - against the
     CPU at its hardest. */
  /* A RANKED BATTLE (6b): refereed on the server, so the fight holds only the
     view it is sent and asks the server for every turn. */
  const startRanked = (data, again) => setFight({
    o: { id: `ranked:${data.id}`, name: data.opponent.username,
      pic: data.opponent.pic ?? CHAR_PIC[data.opponent.char] ?? CHAR_PIC.red, rating: data.opponent.rating },
    kind: "ranked", n: (fight?.n ?? 0) + 1, again,
    mons: data.mine,
    remote: {
      id: data.id, view: data.view, deadline: data.deadline, resumed: Boolean(data.resumed),
      turn: (action) => rankedStep({ op: "turn", id: data.id, action }),
      forfeit: () => rankedStep({ op: "forfeit", id: data.id }),
      resync: () => rankedStep({ op: "resume" }),
    },
  });
  const startPractice = ({ o, mons, foe, again }) => setFight({
    o, kind: "practice", n: (fight?.n ?? 0) + 1, again,
    mine: mons.map((m) => rankedFighter(m.species, m.uid)),
    mons,
    foe: foe.map((m) => rankedFighter(m.species, m.uid)),
    foeMons: foe,
  });

  return (
    <div className="tc-page evcard lg-page" role="dialog" aria-modal="true" aria-label="Pokémon League" ref={page}>
      <header className="tc-head" ref={head}>
        <div className="tc-bar">
          <button type="button" className="tc-home" onClick={sub ? back : onClose}
            aria-label={sub ? "Back to the League" : "Back to the game"}>
            <span aria-hidden="true">‹</span> {sub ? "Back" : "Game"}
          </button>
          <div className="tc-titles">
            <h3>Pokémon League</h3>
            <span>{totalBadges} badge{totalBadges === 1 ? "" : "s"} · {st.filter((s) => s.cleared).length} of {LEAGUES.length} regions cleared</span>
          </div>
        </div>
        {!sub && (
          <nav className="lg-strip-wrap" aria-label="Regions">
            <div className="lg-strip" ref={strip} role="tablist">
              <button type="button" role="tab" aria-selected={ranked}
                className={`rk-tab${ranked ? " on" : ""}`} onClick={() => choose(RANKED)}>
                <b>Ranked</b>
                <em>Teams</em>
              </button>
              <button type="button" role="tab" aria-selected={shop}
                className={`rk-tab${shop ? " on" : ""}`} onClick={() => choose(SHOP)}>
                <b>Shop</b>
                <em>{yen(money)}</em>
              </button>
              <button type="button" role="tab" aria-selected={train}
                className={`rk-tab${train ? " on" : ""}`} onClick={() => choose(TRAIN)}>
                <b>Train</b>
                <em>Levels · moves</em>
              </button>
              {LEAGUES.map((r, k) => (
                <button key={r.id} type="button" role="tab" aria-selected={r.id === regionId}
                  className={`${r.id === regionId ? "on" : ""}${st[k].open ? "" : " shut"}${st[k].cleared ? " done" : ""}`}
                  onClick={() => choose(r.id)}>
                  <b>{r.name}</b>
                  <em>{st[k].open ? `${st[k].badges}/${r.gyms.length}` : <Lock />}</em>
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="hp-body tc-main lg-main">
        {pick ? (
          <TeamPick o={pick.o} kind={pick.kind} box={box} last={team} beaten={beaten} steps={steps} onFight={startFight} />
        ) : shop ? (
          <BattleShop money={money} bag={bag} level={level} stats={stats} onBuy={(id, n) => engine.buy(id, n)} />
        ) : train ? (
          <Train engine={engine} box={box} money={money} stats={stats} candy={candy} />
        ) : ranked ? (
          <Ranked box={box} signedIn={signedIn} editing={editing} setEditing={setEditing}
            onPractice={startPractice} onRanked={startRanked} nonce={nonce} onDefense={engine.setDefense}
            onTrain={() => { setEditing(null); choose(TRAIN); }} />
        ) : (
          <>
            <section className={`lg-hero${rs.open ? "" : " shut"}`}>
              <span className="lg-kicker">Pokémon {region.game}</span>
              <div className="lg-hero-title">
                <h2>{region.name}</h2>
                <ol className="lg-case" aria-label={`${region.name} ${badgeWord(region)}`}>
                  {region.gyms.map((g, k) => (
                    <li key={g.id} className={rs.gyms[k].won ? "won" : ""} data-tip={g.badge}>
                      <img src={asset(`badges/${g.id}.png`)} alt={`${g.badge}${rs.gyms[k].won ? "" : " (not won)"}`} loading="lazy" />
                    </li>
                  ))}
                </ol>
              </div>
              <p>{rs.open
                ? rs.cleared ? `Cleared - every ${badgeWord(region).slice(0, -1).toLowerCase()} and the League.`
                  : `${rs.badges} of ${region.gyms.length} ${badgeWord(region)} · then the League`
                : rs.why}</p>
              {/* NORMAL OR HARD (phase 8): hard is always shown, locked with
                  its rewards in view until the region is cleared. */}
              <div className="lg-modes" role="tablist" aria-label="Difficulty">
                <button type="button" role="tab" aria-selected={!hard} onClick={() => setHard(false)}>Normal</button>
                <button type="button" role="tab" aria-selected={hard} onClick={() => setHard(true)}>
                  {!hardOpen(region.id, beaten) && <Lock />}Hard · Lv 100
                </button>
              </div>
            </section>

            {hard ? (
              <HardView region={region} beaten={beaten} steps={steps} money={money}
                onBattle={(o, kind) => setPick({ o, kind })} />
            ) : (
              <>
                <h3 className="lg-section">{region.id === "alola" ? "Island Kahunas" : "Gyms"}</h3>
                <div className="lg-list">
                  {region.gyms.map((g, k) => (
                    <GymCard key={g.id} g={g} st={rs.gyms[k]} region={region} order={k + 1}
                      beaten={beaten} steps={steps} onBattle={(o, kind) => setPick({ o, kind })} />
                  ))}
                </div>

                <h3 className="lg-section">{region.id === "galar" ? "Champion Cup" : "Elite Four & Champion"}</h3>
                <div className="lg-list">
                  {region.league.map((p, k) => (
                    <Card key={p.id} o={{ ...p, type: p.type ?? speciesById(teamOf(p, beaten).at(-1).id).types[0] }}
                      kind={p.champion ? "champion" : "league"} st={rs.league[k]} region={region} order={k + 1}
                      beaten={beaten} steps={steps} onBattle={(o, kind) => setPick({ o, kind })} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {fight && (
        <Fight
          key={fight.n}
          engine={fight.kind === "practice" || fight.kind === "ranked" ? null : engine}
          practice={fight.kind === "practice" || fight.kind === "ranked"}
          remote={fight.remote ?? null}
          opponent={fight.o}
          foeTeam={fight.foe}
          myTeam={fight.mine}
          myMons={fight.mons}
          foeMons={fight.foeMons ?? null}
          badge={fight.kind === "leader" ? { id: fight.o.id, name: fight.o.badge } : null}
          nextLabel={upNext ? (upNext.kind === "trainer" ? trainerName(upNext.o) : upNext.kind === "hard" ? `${upNext.o.name} (hard)` : upNext.o.name) : null}
          ai={AI_FOR[fight.kind] ?? 3}
          onDone={(result, again) => {
            if (fight.kind === "ranked") setNonce((n) => n + 1);
            if (again === "next" && upNext) { goNext(); return; }
            if (again && fight.again) {
              setFight(null);
              fight.again();        // practice or ranked: a fresh blind team from the server
            } else if (again) {
              setFight((f) => ({ ...f, n: f.n + 1, mine: f.mons.map(playerFighter), foe: teamOf(f.o, engine.state.beaten) }));
            } else {
              setFight(null);
              setPick(null);
            }
          }}
        />
      )}
    </div>
  );
}
