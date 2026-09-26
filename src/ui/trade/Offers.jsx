/* DIRECT OFFERS (docs/trading.md): the composer you open from a trainer's
   profile, a friend's box or a counter-offer, and the Offers tab - what came
   in, what you sent, and what already happened.

   WHAT YOU MAY ASK FOR is the server's rule, mirrored: a FRIEND's spares (any
   box entry but the last of its species), a stranger's shelf. Up to MAX_SIDE a
   side, so several of yours can buy one of theirs. One of yours may sit in
   several open offers; the first accepted takes it. */
import { useEffect, useMemo, useState } from "react";
import { SPECIES } from "../../data/dex.js";
import { speciesById, isLegendary } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS, PRESETS, tradeable } from "../../game/trade.js";
import { keeper } from "../../game/items.js";
import { flushNow } from "../../game/store.js";
import { proposeTrade, answerTrade, cancelTrade, friendBox, trainerShelf, push } from "../../net/cloud.js";
import Sprite from "../Sprite.jsx";
import Mark from "../Marks.jsx";
import Picker, { keyOf, tierOf, keepLast } from "./Picker.jsx";
import { enterTrading } from "./enter.js";

export { keyOf };

/* A Pokedex array (position-keyed, as a save holds it) as the set of dex ids
   caught - how "they don't have" is answered from a friend's box. */
export const caughtIds = (dex) => new Set((dex ?? []).flatMap((v, i) => (v === 2 && SPECIES[i] ? [SPECIES[i].id] : [])));

/* A ROW OF SPRITES for one side of an offer. */
function Side({ mons }) {
  return (
    <span className="of-side">
      {(mons ?? []).map((m) => (
        <span key={m.mid} className="of-mon" data-tip={`${label(speciesById(m.species))}, Lv ${m.level}`}>
          <Sprite id={m.species} variant={m.tier} fx />
          {m.tier && <span className="tp-tier"><Mark tier={m.tier} size={9} /></span>}
          {m.alpha && <span className="tp-alpha"><Mark tier="alpha" size={8} /></span>}
        </span>
      ))}
    </span>
  );
}

/* THE COMPOSER. `want` and `give` arrive pre-filled from a friend's box or a
   counter-offer as Pokemon ({uid, mid}), and are matched to this trainer's
   list once it has loaded - a friend's by box uid, a shelf by server id. */
export function Composer({ them, box, engine, dexOf, want: want0 = [], give: give0 = [], counter = null, onSent, onCancel }) {
  const [theirs, setTheirs] = useState(null);
  const [friend, setFriend] = useState(false);
  const [theirDex, setTheirDex] = useState(null);
  const [want, setWant] = useState([]);
  const [give, setGive] = useState(() => give0.map(keyOf));
  const [msg, setMsg] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const fb = await friendBox(them.user_id);
      if (!live) return;
      if (fb.ok && fb.data) {
        const list = fb.data.box.map((m) => ({ ...m, mid: undefined }));   // a friend is asked by box uid
        setFriend(true); setTheirs(list); setTheirDex(caughtIds(fb.data.dex));
        setWant(want0.filter((m) => list.some((x) => x.uid === m.uid)).map((m) => `u${m.uid}`));
        return;
      }
      const sh = await trainerShelf(them.user_id);
      if (!live) return;
      const list = sh.ok ? sh.data : [];
      setTheirs(list);
      setWant(want0.filter((m) => list.some((x) => x.mid === m.mid)).map((m) => m.mid));
    })();
    return () => { live = false; };
  }, [them.user_id]);   // once per trainer: the pre-fill is read on load, not tracked

  const mine = useMemo(() => box.filter((m) => tradeable(box, m, true)), [box]);
  const myLimit = useMemo(() => keepLast(box), [box]);
  const theirLimit = useMemo(() => (friend && theirs ? keepLast(theirs) : null), [friend, theirs]);
  const giving = mine.filter((m) => give.includes(keyOf(m)));
  const precious = giving.some((m) => keeper(m) || isLegendary(m.species));
  const theirKey = (m) => (friend ? `u${m.uid}` : m.mid);

  const send = async () => {
    setBusy(true); setErr(null);
    const entered = await enterTrading(engine, giving);
    if (!entered.ok) { setBusy(false); setErr(entered.error); return; }
    const mids = giving.map((m) => entered.mids[m.uid]);
    const got = friend
      ? await proposeTrade(them.user_id, mids, [], msg, want.map((k) => Number(k.slice(1))))
      : await proposeTrade(them.user_id, mids, want, msg, []);
    if (!got.ok) { setBusy(false); setErr(got.error); return; }
    engine.reconcileTrades({ locks: Object.fromEntries(mids.map((m) => [m, "offer"])) });
    if (counter) await answerTrade(counter, false);      // a counter replaces the offer it answers
    setBusy(false);
    onSent(counter ? `Counter-offer sent to ${them.username}.` : `Offer sent to ${them.username}.`);
  };

  return (
    <div className="tc-edit">
      <section className="ev-card">
        <header className="ev-banner">
          <h4>You get from {them.username}</h4><span className="tp-count">{want.length}/{LIMITS.MAX_SIDE}</span>
        </header>
        <p className="ev-quiet">{friend ? "Anything they have spare - they keep the last of each species." : "What they put up for trade."}</p>
        {theirs === null ? <p className="ev-quiet">Loading…</p> : (
          <Picker mons={theirs} picked={want} max={LIMITS.MAX_SIDE} onChange={setWant} keyFn={theirKey} limit={theirLimit}
            missing={{ label: "Not in my Pokédex", test: (sp) => dexOf(sp) !== 2 }}
            empty={friend ? `${them.username} has nothing spare yet.` : `${them.username} has nothing up for trade right now.`} />
        )}
      </section>
      <section className="ev-card">
        <header className="ev-banner"><h4>You give</h4><span className="tp-count">{give.length}/{LIMITS.MAX_SIDE}</span></header>
        <Picker mons={mine} picked={give} max={LIMITS.MAX_SIDE} onChange={setGive} limit={myLimit}
          missing={theirDex ? { label: "They don't have", test: (sp) => !theirDex.has(sp) } : null}
          empty="Nothing to give - you keep the last of every species." />
      </section>
      <section className="ev-card">
        <header className="ev-banner"><h4>Say</h4></header>
        <div className="tp-seek">
          {PRESETS.map((p, i) => (
            <button key={p} type="button" className={`tp-chip add${msg === i ? " have" : ""}`}
              aria-pressed={msg === i} onClick={() => setMsg(i)}>{p}</button>
          ))}
        </div>
      </section>
      {precious && <p className="tc-err">You are offering something rare - once they accept, it is theirs.</p>}
      {err && <p className="tc-err" role="alert">{err}</p>}
      {/* Pinned to the bottom of the page: the pickers above can be long. */}
      <div className="tp-actions tc-dock">
        <button type="button" className="ev-go" disabled={busy || !want.length || !give.length} onClick={send}>
          {busy ? "Sending…" : `${counter ? "Send counter" : "Send offer"} · ${give.length} for ${want.length}`}
        </button>
        <button type="button" className="tp-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* A trainer's name that opens their profile - where Block and Report live,
   so an unwanted offer is one tap from them. */
export const Who = ({ name, onOpen }) => (onOpen
  ? <button type="button" className="of-name" onClick={() => onOpen(name)}>{name}</button>
  : <b>{name}</b>);

/* THE OFFERS TAB: incoming first (they are waiting on you), then sent, then
   what already happened. Accepting plays the trade scene straight away.

   'sync' IS NOT A FAILURE: a friend asked for something your game has not
   learned the server id of yet, so the tab syncs the inbox (which assigns it),
   uploads, and asks once more. */
export function OffersTab({ inbox, sync, onTraded, onOpenTrainer, onCounter }) {
  const [busy, setBusy] = useState(null);
  const [say, setSay] = useState(null);
  useEffect(() => { sync(); }, [sync]);

  const open = inbox?.open?.filter((o) => o.kind === "direct") ?? [];
  const incoming = open.filter((o) => !o.mine), sent = open.filter((o) => o.mine);
  const history = inbox?.recent ?? [];

  const answer = async (o, yes) => {
    setBusy(o.id); setSay(null);
    let got = await answerTrade(o.id, yes);
    if (got.ok && got.data === "sync") {
      await sync();
      await new Promise((r) => setTimeout(r, 500));   // the engine's local write
      await flushNow(push);
      got = await answerTrade(o.id, yes);
    }
    setBusy(null);
    if (!got.ok) { setSay(got.error); return; }
    if (got.data === "done") {
      onTraded({ id: o.id, kind: "direct", partner: o.partner, at: new Date().toISOString(), gave: o.want, got: o.give });
    } else if (got.data === "failed") {
      setSay("That offer can't happen any more - something in it moved, or a daily limit was reached.");
    } else if (got.data === "sync") {
      setSay("Your game is still saving - try again in a moment.");
    }
    sync();
  };
  const cancel = async (o) => {
    setBusy(o.id);
    await cancelTrade(o.id);
    setBusy(null);
    sync();
  };

  if (!inbox) return <p className="ev-quiet">Loading offers…</p>;
  return (
    <div className="tc-list">
      {say && <p className="tc-err" role="alert">{say}</p>}
      <section className={`ev-card${incoming.length ? " live" : ""}`}>
        <header className="ev-banner"><h4>For you</h4>{incoming.length > 0 && <span className="ev-stamp live">{incoming.length} NEW</span>}</header>
        {incoming.length ? (
          <ul className="of-list">
            {incoming.map((o) => (
              <li key={o.id} className="of-card">
                <p className="of-who"><Who name={o.partner} onOpen={onOpenTrainer} /> · “{PRESETS[o.msg] ?? PRESETS[0]}”</p>
                <div className="of-swap">
                  <span className="of-label">You get</span><Side mons={o.give} />
                  <span className="of-label">You give</span><Side mons={o.want} />
                </div>
                <div className="tp-actions">
                  <button type="button" className="ev-go" disabled={busy === o.id} onClick={() => answer(o, true)}>
                    {busy === o.id ? "Trading…" : "Accept"}
                  </button>
                  {onCounter && (
                    <button type="button" className="tp-quiet" disabled={busy === o.id} onClick={() => onCounter(o)}>Counter</button>
                  )}
                  <button type="button" className="tp-quiet danger" disabled={busy === o.id} onClick={() => answer(o, false)}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="ev-quiet">No offers waiting. Visit a trainer to make one.</p>}
      </section>
      {sent.length > 0 && (
        <section className="ev-card">
          <header className="ev-banner"><h4>Sent</h4><span className="tp-count">{sent.length}/{LIMITS.OPEN_OFFERS}</span></header>
          <ul className="of-list">
            {sent.map((o) => (
              <li key={o.id} className="of-card">
                <p className="of-who">To <Who name={o.partner} onOpen={onOpenTrainer} /> · waiting</p>
                <div className="of-swap">
                  <span className="of-label">You give</span><Side mons={o.give} />
                  <span className="of-label">You get</span><Side mons={o.want} />
                </div>
                <div className="tp-actions">
                  <button type="button" className="tp-quiet" disabled={busy === o.id} onClick={() => cancel(o)}>Take back offer</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="ev-card">
        <header className="ev-banner"><h4>Trade history</h4></header>
        {history.length ? (
          <ul className="of-list">
            {history.map((h) => (
              <li key={h.id} className="of-card done">
                <p className="of-who">{h.kind === "surprise" ? "Surprise Trade" : "Trade"} with <Who name={h.partner} onOpen={onOpenTrainer} /></p>
                <div className="of-swap">
                  <span className="of-label">Gave</span><Side mons={h.gave} />
                  <span className="of-label">Got</span><Side mons={h.got} />
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="ev-quiet">No trades yet.</p>}
      </section>
    </div>
  );
}

// Re-exported for the other trading screens.
export { tierOf };
