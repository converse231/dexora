/* THE TRADE BOARD (docs/trading.md, phase 4): friends' "offering this,
   looking for that". A listing is one Pokemon and a wanted species (and tier,
   if named); anybody whose box fits completes it in one tap. The server checks
   everything again - `fits` is only so the button can say so first. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { SPECIES } from "../../data/dex.js";
import { speciesById, TIERS } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS, tradeable, fits } from "../../game/trade.js";
import { variantOf, keeper } from "../../game/items.js";
import { tradeBoard, postListing, withdrawListing, fulfilListing } from "../../net/cloud.js";
import Sprite from "../Sprite.jsx";
import Mark from "../Marks.jsx";
import { MonPick, keyOf, Who } from "./Offers.jsx";
import { enterTrading } from "./enter.js";

/* A species search over what you have seen - a wish list must not spoil. */
function SpeciesFind({ dexOf, onPick, placeholder }) {
  const [find, setFind] = useState("");
  const hits = useMemo(() => {
    const n = find.trim().toLowerCase();
    if (n.length < 2) return [];
    return SPECIES.filter((sp) => dexOf(sp.id) >= 1 && label(sp).toLowerCase().includes(n)).slice(0, 8);
  }, [find, dexOf]);
  return (
    <>
      <input className="tc-input" value={find} onChange={(e) => setFind(e.target.value)}
        placeholder={placeholder} aria-label={placeholder} />
      {hits.length > 0 && (
        <div className="tp-seek">
          {hits.map((sp) => (
            <button key={sp.id} type="button" className="tp-chip add" onClick={() => { onPick(sp.id); setFind(""); }}>
              <Sprite id={sp.id} alt="" />{label(sp)}<i aria-hidden="true">+</i>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const Want = ({ species, tier }) => {
  const sp = speciesById(species);
  return (
    <span className="bd-want">
      <Sprite id={species} variant={tier} fx alt="" />
      <span>{tier ? <><Mark tier={tier} size={10} /> {tier}</> : "any"} {sp ? label(sp) : "?"}</span>
    </span>
  );
};

/* POST: one of yours, and what you want for it. */
function Post({ box, dexOf, engine, onPosted, onCancel }) {
  const [pick, setPick] = useState([]);
  const [want, setWant] = useState(null);
  const [tier, setTier] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const mine = useMemo(() => box.filter((m) => tradeable(box, m))
    .sort((a, b) => a.species - b.species || b.level - a.level).slice(0, 150), [box]);
  const chosen = mine.find((m) => keyOf(m) === pick[0]);

  const post = async () => {
    setBusy(true); setErr(null);
    const entered = await enterTrading(engine, [chosen]);
    if (!entered.ok) { setBusy(false); setErr(entered.error); return; }
    const mid = entered.mids[chosen.uid];
    const got = await postListing(mid, want, tier);
    setBusy(false);
    if (!got.ok) { setErr(got.error); return; }
    engine.reconcileTrades({ locks: { [mid]: "listing" } });
    onPosted();
  };

  return (
    <div className="tc-edit">
      <section className="ev-card">
        <header className="ev-banner"><h4>You offer</h4></header>
        <MonPick mons={mine} picked={pick} max={1} onToggle={(k) => setPick((p) => (p[0] === k ? [] : [k]))}
          empty="Nothing to offer - you keep the last of every species." />
      </section>
      <section className="ev-card">
        <header className="ev-banner"><h4>You want</h4></header>
        {want ? <Want species={want} tier={tier} /> : <p>Pick a species you have seen.</p>}
        <SpeciesFind dexOf={dexOf} onPick={setWant} placeholder="Find a species…" />
        <div className="tp-seek" role="group" aria-label="Which form">
          <button type="button" className={`tp-chip add${tier === null ? " have" : ""}`} aria-pressed={tier === null}
            onClick={() => setTier(null)}>Any form</button>
          {TIERS.map((t) => (
            <button key={t} type="button" className={`tp-chip add${tier === t ? " have" : ""}`} aria-pressed={tier === t}
              onClick={() => setTier(t)}><Mark tier={t} size={12} />{t}</button>
          ))}
        </div>
      </section>
      {chosen && (keeper(chosen)) && <p className="tc-err">You are offering something rare - whoever fills this gets it.</p>}
      {err && <p className="tc-err" role="alert">{err}</p>}
      <div className="tp-actions">
        <button type="button" className="ev-go" disabled={busy || !chosen || !want} onClick={post}>
          {busy ? "Posting…" : "Post listing"}
        </button>
        <button type="button" className="tp-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function BoardTab({ box, dexOf, engine, inbox, sync, onTraded, friends, initialQ = null, onOpenTrainer }) {
  const [list, setList] = useState(null);
  // A Pokedex entry's "On the Board" opens here already searching for it.
  const [q, setQ] = useState(initialQ);
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(null);
  const [say, setSay] = useState(null);
  const load = useCallback(async () => {
    const got = await tradeBoard(q);
    setList(got.ok ? got.data : []);
    if (!got.ok) setSay(got.error);
  }, [q]);
  useEffect(() => { load(); }, [load]);
  // A line of news, not a label: it goes after a few seconds.
  useEffect(() => {
    if (!say) return undefined;
    const t = setTimeout(() => setSay(null), 5000);
    return () => clearTimeout(t);
  }, [say]);

  const mine = inbox?.listings ?? [];
  const others = (list ?? []).filter((l) => !l.mine);

  const fill = async (l, mon) => {
    setBusy(l.id); setSay(null);
    const entered = await enterTrading(engine, [mon]);
    if (!entered.ok) { setBusy(null); setSay(entered.error); return; }
    const got = await fulfilListing(l.id, entered.mids[mon.uid]);
    setBusy(null);
    if (!got.ok) { setSay(got.error); return; }
    const r = got.data;
    if (r.status === "done") {
      onTraded({ id: r.trade, kind: "board", partner: r.from, at: new Date().toISOString(),
        gave: [{ species: mon.species, level: mon.level, tier: variantOf(mon), alpha: !!mon.alpha }], got: [r.got] });
    } else {
      setSay({ gone: "Somebody got there first - that listing is gone.",
        unfit: "That one doesn't fit the listing any more.",
        capped: "One of you has traded as much as a day allows." }[r.status] ?? "That didn't work.");
    }
    load(); sync();
  };
  const takeDown = async (l) => {
    setBusy(l.id);
    const got = await withdrawListing(l.id);
    setBusy(null);
    if (got.ok && got.data) engine.reconcileTrades({ locks: { [l.mon.mid]: null } });
    load(); sync();
  };

  if (posting) {
    return <Post box={box} dexOf={dexOf} engine={engine}
      onPosted={() => { setPosting(false); setSay("Listing posted."); load(); sync(); }}
      onCancel={() => setPosting(false)} />;
  }
  return (
    <div className="tc-list">
      <section className="ev-card ev-board">
        <header className="ev-banner">
          <h4>Your listings</h4>
          <span className="tp-count">{mine.length}/{LIMITS.OPEN_LISTINGS}</span>
        </header>
        {mine.length ? (
          <ul className="of-list">
            {mine.map((l) => (
              <li key={l.id} className="bd-row">
                <span className="of-mon"><Sprite id={l.mon.species} variant={l.mon.tier} fx /></span>
                <span className="bd-arrow" aria-hidden="true">→</span>
                <Want species={l.want_species} tier={l.want_tier} />
                <button type="button" className="tp-quiet" disabled={busy === l.id} onClick={() => takeDown(l)}>Take down</button>
              </li>
            ))}
          </ul>
        ) : <p className="ev-quiet">Nothing listed. Offer a spare for something you want.</p>}
        <button type="button" className="ev-go" disabled={mine.length >= LIMITS.OPEN_LISTINGS}
          onClick={() => { setSay(null); setPosting(true); }}>Post a listing</button>
      </section>

      <section className="ev-card">
        <header className="ev-banner">
          <h4>Friends&rsquo; listings</h4>
          {q && <button type="button" className="tp-chip x" onClick={() => setQ(null)}>
            <Sprite id={q} alt="" />{label(speciesById(q))}<i aria-hidden="true">✕</i>
          </button>}
        </header>
        {friends === 0 && <p className="ev-quiet">The board shows your friends&rsquo; listings. Add friends in Trainers.</p>}
        <SpeciesFind dexOf={dexOf} onPick={setQ} placeholder="Search by species…" />
        {say && <p className="tc-note" role="status">{say}</p>}
        {list === null ? <p className="ev-quiet">Loading the board…</p> : others.length ? (
          <ul className="of-list">
            {others.map((l) => {
              const fit = box.filter((m) => fits(box, m, l))
                .sort((a, b) => Number(keeper(a)) - Number(keeper(b)) || a.level - b.level)[0];
              return (
                <li key={l.id} className="of-card">
                  <p className="of-who"><Who name={l.owner} onOpen={onOpenTrainer} /> offers</p>
                  <div className="bd-deal">
                    <span className="of-mon big">
                      <Sprite id={l.mon.species} variant={l.mon.tier} fx />
                      {l.mon.tier && <span className="tp-tier"><Mark tier={l.mon.tier} size={10} /></span>}
                      <i>Lv {l.mon.level}</i>
                    </span>
                    <span className="bd-for">for</span>
                    <Want species={l.want_species} tier={l.want_tier} />
                  </div>
                  {fit ? (
                    <button type="button" className="ev-go" disabled={busy === l.id} onClick={() => fill(l, fit)}>
                      {busy === l.id ? "Trading…" : `Trade your ${label(speciesById(fit.species))} Lv ${fit.level}`}
                    </button>
                  ) : <p className="ev-quiet">You have none to spare.</p>}
                </li>
              );
            })}
          </ul>
        ) : list && <p className="ev-quiet">{q ? "No listing for that species." : "No listings yet."}</p>}
      </section>
    </div>
  );
}
