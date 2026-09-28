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
import { opponent, fighter, rankedFighter, refusal, effectiveness, AI_FOR } from "../../game/battle.js";
import { teamSize, REMATCH_CAP_STEP } from "../../game/league.js";
import { REMATCH_STEPS } from "../../data/gymtune.js";
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { variantOf } from "../../game/items.js";
import { hash } from "../../game/daily.js";
import { useModalLock } from "../modal.js";
import Sprite from "../Sprite.jsx";
import Types from "../Types.jsx";
import Picker, { keyOf } from "../trade/Picker.jsx";
import Fight from "./Fight.jsx";
import { standing, tuneOf } from "./progress.js";
import Ranked from "./Ranked.jsx";
import { CHAR_PIC } from "../../game/ranked.js";
import { rankedStep } from "../../net/cloud.js";

/* The Ranked tab sits first in the region strip under its own id, which is
   not a region's; the strip remembers it like one. */
const RANKED = "ranked";

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

/* ONE OPPONENT: a leader, a League member or its Champion. */
function Card({ o, kind, st, region, onBattle, order, beaten, steps }) {
  const tune = tuneOf(o, beaten, steps);
  const team = useMemo(() => teamOf(o, beaten), [o, beaten]);
  const trained = tune.top > 100;
  const champ = kind === "champion";
  const [open, setOpen] = useState(false);
  return (
    <article className={`lg-card t-${o.type ?? "normal"}${champ ? " champ" : ""}${st.won ? " won" : ""}${st.open ? "" : " shut"}`}>
      <div className="lg-card-head">
        <div className="lg-portrait">
          <img src={asset(`trainers/${o.pic}.png`)} alt="" loading="lazy" />
        </div>
        <div className="lg-who">
          <span className="lg-kicker">
            {kind === "leader" ? (region.id === "alola" ? `Grand trial ${order}` : `Gym ${order}`)
              : champ ? "Champion" : `League · ${order}`}
          </span>
          <h4>{o.name}</h4>
          <div className="lg-facts">
            {o.type && kind === "leader" && <Types of={[o.type]} />}
            <span className="lg-cap" data-tip="The highest level you may bring">Lv {tune.cap} cap</span>
            {trained && <span className="lg-trained" data-tip="Trained past Lv 100: its stats run higher than its level says">TRAINED</span>}
          </div>
          {kind === "leader" && (
            <span className="lg-badge">
              <img src={asset(`badges/${o.id}.png`)} alt="" loading="lazy" />{o.badge}
            </span>
          )}
        </div>
        <span className={`lg-stamp${st.won ? " won" : st.open ? " open" : ""}`}>
          {st.won ? "BEATEN" : st.open ? "OPEN" : <><Lock />LOCKED</>}
        </span>
      </div>

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
        {kind === "leader" && o.trainers.length > 0 && (
          <button type="button" className="lg-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {o.trainers.length} gym trainer{o.trainers.length > 1 ? "s" : ""}
            <span aria-hidden="true">{open ? "▴" : "▾"}</span>
          </button>
        )}
      </div>

      {open && (
        <ul className="lg-trainers">
          {o.trainers.map((t, k) => {
            const ts = st.trainers[k];
            return (
              <li key={t.id} className={ts.won ? "won" : ""}>
                <img className="lg-tpic" src={asset(`trainers/${t.pic}.png`)} alt="" loading="lazy" />
                <span className="lg-tname">
                  <i>{t.cls}{!ts.won && <em className="lg-tpay"> · {yen(tuneOf(t, beaten, steps).pay)}</em>}</i>
                  <b>{t.name === t.cls ? "" : t.name}</b>
                </span>
                <TrainerParty t={t} beaten={beaten} />
                <button type="button" className="lg-go small" disabled={!ts.open} onClick={() => onBattle(t, "trainer")}>
                  {ts.won ? "Again" : "Battle"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
function TrainerParty({ t, beaten }) {
  const team = useMemo(() => teamOf(t, beaten), [t, beaten]);
  return <Party team={team} small />;
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
          <span className="lg-kicker">{kind === "trainer" ? o.cls : kind === "champion" ? "Champion" : kind === "league" ? "Elite Four" : "Leader"}</span>
          <h4>{o.name}</h4>
          <Party team={theirs} small />
        </div>
      </section>

      <ul className="lg-rules">
        <li><b>{size}</b> Pokémon at most</li>
        {kind !== "trainer" && <li>Up to <b>Lv {cap}</b></li>}
        {kind !== "trainer" && <li>Legendaries: a lower limit, <b>by strength</b></li>}
        <li>{tune.wins ? "Rematch" : "Prize"} <b>{yen(tune.pay)}</b></li>
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

export default function League({ engine, box = [], beaten = {}, steps = 0, team = [], signedIn = false, onClose }) {
  useModalLock();
  const page = useRef(null);
  const head = useRef(null);
  const st = useMemo(() => standing(beaten), [beaten]);
  const firstOpen = () => {
    const saved = readRegion();
    if (saved === RANKED) return RANKED;
    if (saved && st[LEAGUES.findIndex((r) => r.id === saved)]?.open) return saved;
    const k = st.findIndex((s) => s.open && !s.cleared);
    return LEAGUES[k >= 0 ? k : 0].id;
  };
  const [regionId, setRegionId] = useState(firstOpen);
  const [pick, setPick] = useState(null);    // { o, kind }
  const [fight, setFight] = useState(null);  // { o, kind, team, n }
  const [editing, setEditing] = useState(null);   // the defense team slot being edited
  const [nonce, setNonce] = useState(0);          // a ranked battle closed: the Ranked tab reloads its standing
  const ranked = regionId === RANKED;
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

  const startFight = (team) => {
    const { o, kind } = pick;
    setFight({
      o, kind, n: (fight?.n ?? 0) + 1,
      mine: team.map((m) => fighter(m.species, m.level, m.uid)),
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
        ) : ranked ? (
          <Ranked box={box} signedIn={signedIn} editing={editing} setEditing={setEditing}
            onPractice={startPractice} onRanked={startRanked} nonce={nonce} onDefense={engine.setDefense} />
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
            </section>

            <h3 className="lg-section">{region.id === "alola" ? "Island Kahunas" : "Gyms"}</h3>
            <div className="lg-list">
              {region.gyms.map((g, k) => (
                <Card key={g.id} o={g} kind="leader" st={rs.gyms[k]} region={region} order={k + 1}
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
          ai={AI_FOR[fight.kind] ?? 3}
          onDone={(result, again) => {
            if (fight.kind === "ranked") setNonce((n) => n + 1);
            if (again && fight.again) {
              setFight(null);
              fight.again();        // practice or ranked: a fresh blind team from the server
            } else if (again) {
              setFight((f) => ({ ...f, n: f.n + 1, mine: f.mons.map((m) => fighter(m.species, m.level, m.uid)), foe: teamOf(f.o, engine.state.beaten) }));
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
