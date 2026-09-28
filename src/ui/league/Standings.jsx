/* THE LADDER, READ (docs/ranked.md, 6c): the season's top trainers, you and
   your friends, past seasons' top ten - and your defense log. Everything
   comes from db/ranked.sql's read functions; the page holds no rating. */
import { useEffect, useState } from "react";
import { levelFromXp, speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { CHAR_PIC, PLACEMENT, seasonName, TEAM_NAME } from "../../game/ranked.js";
import { rankedTop, rankedFriends, rankedSeasons, myDefenseLog } from "../../net/cloud.js";
import Sprite from "../Sprite.jsx";
import RankBadge from "../RankBadge.jsx";

const asset = (path) => new URL(path, document.baseURI).href;
const since = (at) => new Date(at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const ago = (at) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(at)) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/* One trainer's line: place, who, rank, rating and record - and on the list,
   what the card shows (level, Pokedex, when they started) and their team
   once it has defended enough to be shown. */
function Row({ e, place, me, full }) {
  return (
    <li className={`rk-row${me ? " me" : ""}`}>
      <span className="rk-place">{place ?? "–"}</span>
      <img className="rk-pic" src={asset(`trainers/${CHAR_PIC[e.char] ?? CHAR_PIC.red}.png`)} alt="" loading="lazy" />
      <span className="rk-who">
        <b>{e.username}</b>
        {full
          ? <i>Lv {levelFromXp(e.xp ?? 0)} · {e.dex_count} Pokédex · since {since(e.joined_at)}</i>
          : <i>{e.games} battle{e.games === 1 ? "" : "s"} this season</i>}
      </span>
      {/* The rank carries the rating; the line under it is the record. */}
      <span className="rk-score">
        <RankBadge rating={e.rating} games={e.games} withRating />
        <i>{e.wins}–{e.games - e.wins}</i>
      </span>
      {full && e.team?.length > 0 && (
        <span className="rk-team" aria-label="Their most-used defense team">
          {e.team.map((id, k) => <Sprite key={k} id={id} alt={label(speciesById(id))} />)}
        </span>
      )}
    </li>
  );
}

export function Standings({ me }) {
  const [view, setView] = useState("top");
  const [list, setList] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [past, setPast] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setList(null); setError(null);
    const got = view === "top" ? rankedTop() : view === "friends" ? rankedFriends() : rankedSeasons();
    got.then((r) => {
      if (!live) return;
      if (!r.ok) { setError(r.error); return; }
      if (view === "past") {
        const older = (r.data ?? []).filter((s) => s !== me?.season);
        setSeasons(older);
        setPast((p) => (older.includes(p) ? p : older[0] ?? null));
        setList([]);
      } else setList(r.data ?? []);
    });
    return () => { live = false; };
  }, [view, me?.season]);

  const [pastList, setPastList] = useState(null);
  useEffect(() => {
    if (view !== "past" || !past) { setPastList(null); return undefined; }
    let live = true;
    rankedTop(past, 10).then((r) => { if (live) setPastList(r.ok ? r.data ?? [] : []); });
    return () => { live = false; };
  }, [view, past]);

  const onList = list?.some((e) => e.user_id === me?.user_id);
  return (
    <div className="rk-standings">
      <div className="sheet-tabs rk-seg" role="tablist" aria-label="Standings">
        {[["top", "Top 100"], ["friends", "Friends"], ["past", "Past seasons"]].map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "on" : ""}
            onClick={() => setView(id)}>{name}</button>
        ))}
      </div>
      {error && <p className="lg-refused" role="alert">{error === "closed" ? "Ranked isn't open yet." : "Could not load the standings. Try again."}</p>}
      {view === "past" ? (
        !seasons.length ? <p className="ev-quiet">The first season is still running.</p> : (
          <>
            <div className="rk-use" role="group" aria-label="Season">
              {seasons.map((s) => (
                <button key={s} type="button" className={`tp-chip add${s === past ? " have" : ""}`} aria-pressed={s === past}
                  onClick={() => setPast(s)}>{seasonName(s)}</button>
              ))}
            </div>
            {pastList === null ? <p className="ev-quiet">Loading…</p> : !pastList.length
              ? <p className="ev-quiet">Nobody finished placement that season.</p>
              : <ol className="rk-list">{pastList.map((e) => <Row key={e.user_id} e={e} place={e.place} me={e.user_id === me?.user_id} full />)}</ol>}
          </>
        )
      ) : list === null ? <p className="ev-quiet">Loading…</p> : !list.length ? (
        <p className="ev-quiet">{view === "top"
          ? `Nobody has finished placement yet - ${PLACEMENT} battles puts you on the list.`
          : "Add friends in the Trade Center to see where they stand."}</p>
      ) : (
        <ol className="rk-list">
          {list.map((e, k) => (
            <Row key={e.user_id} e={e} place={view === "top" ? e.place : k + 1} me={e.user_id === me?.user_id} full={view === "top"} />
          ))}
        </ol>
      )}
      {view === "top" && list?.length > 0 && !onList && me && me.games >= PLACEMENT && (
        <p className="lg-why rk-you">You: #{me.place.toLocaleString("en-US")} at {me.rating.toLocaleString("en-US")}</p>
      )}
    </div>
  );
}

/* YOUR DEFENSE LOG: who met your teams while you were away, and what it did. */
export function DefenseLog() {
  const [log, setLog] = useState(null);
  useEffect(() => { myDefenseLog().then((r) => setLog(r.ok ? r.data ?? [] : [])); }, []);
  if (log === null) return <p className="ev-quiet">Loading…</p>;
  if (!log.length) return <p className="ev-quiet">Nobody has battled your teams yet.</p>;
  return (
    <ol className="rk-list">
      {log.map((e, k) => (
        <li key={k} className="rk-row">
          <span className={`rk-held ${e.held ? "held" : "fell"}`}>{e.held ? "Held" : "Lost"}</span>
          <img className="rk-pic" src={asset(`trainers/${CHAR_PIC[e.char] ?? CHAR_PIC.red}.png`)} alt="" loading="lazy" />
          <span className="rk-who"><b>{e.username ?? "A trainer"}</b><i>Team {TEAM_NAME[(e.slot ?? 1) - 1]} · {ago(e.at)}</i></span>
          <span className="rk-score">{e.delta != null && <b className={e.delta >= 0 ? "up" : "down"}>{e.delta >= 0 ? "+" : ""}{e.delta}</b>}</span>
        </li>
      ))}
    </ol>
  );
}
