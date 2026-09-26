/* THE TRADE BOARD (docs/trading.md): friends' "offering these, looking for
   that". A listing is a BUNDLE - up to MAX_SIDE of yours - for one wanted
   species (and tier, if named); a friend whose box fits completes it in one
   tap. The server checks everything again; `fits` only lets the button say so.

   FIND is the other half: pick any species and see who has one - listings,
   friends with a spare (browse their box), and anybody's shelf. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { speciesById, TIERS } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS, tradeable, fits } from "../../game/trade.js";
import { variantOf, keeper } from "../../game/items.js";
import { tradeBoard, postListing, withdrawListing, fulfilListing, tradeSearch } from "../../net/cloud.js";
import Sprite, { TrainerArt } from "../Sprite.jsx";
import Mark from "../Marks.jsx";
import Picker, { SpeciesFind, keyOf, keepLast } from "./Picker.jsx";
import { Who } from "./Offers.jsx";
import { enterTrading } from "./enter.js";

const Want = ({ species, tier }) => {
  const sp = speciesById(species);
  return (
    <span className="bd-want">
      <Sprite id={species} variant={tier} fx alt="" />
      <span>{tier ? <><Mark tier={tier} size={10} /> {tier}</> : "any"} {sp ? label(sp) : "?"}</span>
    </span>
  );
};

/* A bundle's Pokemon, in a row. */
const Bundle = ({ mons }) => (
  <span className="bd-bundle">
    {mons.map((m) => (
      <span key={m.mid} className="of-mon big" data-tip={`${label(speciesById(m.species))}, Lv ${m.level}`}>
        <Sprite id={m.species} variant={m.tier} fx />
        {m.tier && <span className="tp-tier"><Mark tier={m.tier} size={10} /></span>}
        {m.alpha && <span className="tp-alpha"><Mark tier="alpha" size={9} /></span>}
        <i>Lv {m.level}</i>
      </span>
    ))}
  </span>
);

/* POST: up to six of yours, and what you want for them. */
function Post({ box, dexOf, engine, onPosted, onCancel }) {
  const [pick, setPick] = useState([]);
  const [want, setWant] = useState(null);
  const [tier, setTier] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const mine = useMemo(() => box.filter((m) => tradeable(box, m)), [box]);
  const chosen = mine.filter((m) => pick.includes(keyOf(m)));

  const post = async () => {
    setBusy(true); setErr(null);
    const entered = await enterTrading(engine, chosen);
    if (!entered.ok) { setBusy(false); setErr(entered.error); return; }
    const mids = chosen.map((m) => entered.mids[m.uid]);
    const got = await postListing(mids, want, tier);
    setBusy(false);
    if (!got.ok) { setErr(got.error); return; }
    engine.reconcileTrades({ locks: Object.fromEntries(mids.map((m) => [m, "listing"])) });
    onPosted();
  };

  return (
    <div className="tc-edit">
      <section className="ev-card">
        <header className="ev-banner"><h4>You offer</h4><span className="tp-count">{pick.length}/{LIMITS.MAX_SIDE}</span></header>
        <p className="ev-quiet">One Pokémon, or a bundle of up to {LIMITS.MAX_SIDE} that go together.</p>
        <Picker mons={mine} picked={pick} max={LIMITS.MAX_SIDE} onChange={setPick} limit={keepLast(box)}
          empty="Nothing to offer - you keep the last of every species." />
      </section>
      <section className="ev-card">
        <header className="ev-banner"><h4>You want</h4></header>
        {want ? <Want species={want} tier={tier} /> : <p className="ev-quiet">Any species - even one you have never seen.</p>}
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
      {chosen.some(keeper) && <p className="tc-err">You are offering something rare - whoever fills this gets it.</p>}
      {err && <p className="tc-err" role="alert">{err}</p>}
      <div className="tp-actions tc-dock">
        <button type="button" className="ev-go" disabled={busy || !chosen.length || !want} onClick={post}>
          {busy ? "Posting…" : `Post listing · ${chosen.length} for 1`}
        </button>
        <button type="button" className="tp-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function BoardTab({ box, dexOf, engine, inbox, sync, onTraded, friends, initialQ = null, onOpenTrainer, onBrowse }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState(initialQ);
  const [who, setWho] = useState(null);
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(null);
  const [say, setSay] = useState(null);
  const load = useCallback(async () => {
    const [got, found] = await Promise.all([tradeBoard(q), q ? tradeSearch(q) : Promise.resolve(null)]);
    setList(got.ok ? got.data : []);
    setWho(found?.ok ? found.data : null);
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
  const lots = (l) => l.mons ?? [l.mon];

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
        gave: [{ species: mon.species, level: mon.level, tier: variantOf(mon), alpha: !!mon.alpha }], got: r.gots ?? [r.got] });
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
    if (got.ok && got.data) engine.reconcileTrades({ locks: Object.fromEntries(lots(l).map((m) => [m.mid, null])) });
    load(); sync();
  };

  if (posting) {
    return <Post box={box} dexOf={dexOf} engine={engine}
      onPosted={() => { setPosting(false); setSay("Listing posted."); load(); sync(); }}
      onCancel={() => setPosting(false)} />;
  }
  return (
    <div className="tc-list">
      <section className="ev-card">
        <header className="ev-banner">
          <h4>Find a Pokémon</h4>
          {q && <button type="button" className="tp-chip x" onClick={() => setQ(null)}>
            <Sprite id={q} alt="" />{label(speciesById(q))}<i aria-hidden="true">✕</i>
          </button>}
        </header>
        <SpeciesFind dexOf={dexOf} onPick={setQ} placeholder="Search any species…" />
        {q && who && (
          <>
            <h5 className="bd-h">Friends with a spare</h5>
            {who.friends.length ? (
              <ul className="tc-rows">
                {who.friends.map((f) => (
                  <li key={f.user_id} className="tc-row">
                    <span className="tc-who still">
                      <TrainerArt char={f.char} className="tc-art" />
                      <span><b>{f.username}</b><i>{f.spare} spare</i></span>
                    </span>
                    <button type="button" className="ev-go bd-go" onClick={() => onBrowse(f, label(speciesById(q)))}>Browse</button>
                  </li>
                ))}
              </ul>
            ) : <p className="ev-quiet">No friend has a spare one.</p>}
            <h5 className="bd-h">Up for trade</h5>
            {who.shelves.length ? (
              <ul className="tc-rows">
                {who.shelves.map((s) => (
                  <li key={s.user_id} className="tc-row">
                    <button type="button" className="tc-who" onClick={() => onOpenTrainer(s.username)}>
                      <TrainerArt char={s.char} className="tc-art" />
                      <span><b>{s.username}</b><i>{s.mons.length} on their card</i></span>
                    </button>
                    <Bundle mons={s.mons.slice(0, 3)} />
                  </li>
                ))}
              </ul>
            ) : <p className="ev-quiet">Nobody has one on their card.</p>}
          </>
        )}
      </section>

      <section className="ev-card ev-board">
        <header className="ev-banner">
          <h4>Your listings</h4>
          <span className="tp-count">{mine.length}/{LIMITS.OPEN_LISTINGS}</span>
        </header>
        {mine.length ? (
          <ul className="of-list">
            {mine.map((l) => (
              <li key={l.id} className="bd-row">
                <Bundle mons={lots(l)} />
                <span className="bd-arrow" aria-hidden="true">→</span>
                <Want species={l.want_species} tier={l.want_tier} />
                <button type="button" className="tp-quiet" disabled={busy === l.id} onClick={() => takeDown(l)}>Take down</button>
              </li>
            ))}
          </ul>
        ) : <p className="ev-quiet">Nothing listed. Offer spares for something you want.</p>}
        <button type="button" className="ev-go" disabled={mine.length >= LIMITS.OPEN_LISTINGS}
          onClick={() => { setSay(null); setPosting(true); }}>Post a listing</button>
      </section>

      <section className="ev-card">
        <header className="ev-banner"><h4>Friends&rsquo; listings</h4></header>
        {friends === 0 && <p className="ev-quiet">The board shows your friends&rsquo; listings. Add friends in Trainers.</p>}
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
                    <Bundle mons={lots(l)} />
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
