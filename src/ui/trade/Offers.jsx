/* DIRECT OFFERS (docs/trading.md, phase 3): the composer you open from a
   trainer's profile, and the Offers tab - what came in, what you sent, and
   what already happened. Proposing, answering and cancelling are the phase 0
   functions; an offer can only ask for what is on the other trainer's shelf. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { speciesById, isLegendary } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS, PRESETS, tradeable } from "../../game/trade.js";
import { variantOf, keeper } from "../../game/items.js";
import { proposeTrade, answerTrade, cancelTrade } from "../../net/cloud.js";
import Sprite from "../Sprite.jsx";
import Mark from "../Marks.jsx";
import { enterTrading } from "./enter.js";

// A box entry or a server row, as one shape: `tier` is a field on the row.
const tierOf = (m) => m.tier ?? variantOf(m);
export const keyOf = (m) => m.mid ?? `u${m.uid}`;

/* A GRID OF POKEMON TO PICK FROM, up to `max`. The same tiles as the card
   editor, so picking looks like one thing everywhere. */
export function MonPick({ mons, picked, max, onToggle, empty }) {
  if (!mons.length) return <p className="ev-quiet">{empty}</p>;
  return (
    <div className="tc-pick">
      {mons.map((m) => {
        const sp = speciesById(m.species);
        const on = picked.includes(keyOf(m));
        return (
          <button key={keyOf(m)} type="button" className={`tc-mon${on ? " on" : ""}`}
            aria-pressed={on} aria-label={`${label(sp)}, Lv ${m.level}`}
            disabled={!on && picked.length >= max}
            onClick={() => onToggle(keyOf(m))}>
            <Sprite id={m.species} variant={tierOf(m)} fx />
            {tierOf(m) && <span className="tp-tier"><Mark tier={tierOf(m)} size={10} /></span>}
            {m.alpha ? <span className="tp-alpha"><Mark tier="alpha" size={9} /></span> : null}
            {on && <em>{picked.indexOf(keyOf(m)) + 1}</em>}
          </button>
        );
      })}
    </div>
  );
}

/* A ROW OF SPRITES for one side of an offer. */
function Side({ mons }) {
  return (
    <span className="of-side">
      {(mons ?? []).map((m) => (
        <span key={m.mid} className="of-mon" data-tip={`${label(speciesById(m.species))}, Lv ${m.level}`}>
          <Sprite id={m.species} variant={m.tier} fx />
          {m.tier && <span className="tp-tier"><Mark tier={m.tier} size={9} /></span>}
        </span>
      ))}
    </span>
  );
}

/* THE COMPOSER: what they give (from their shelf), what you give (from your
   tradeable box), a preset line. Your side locks the moment it is sent. */
export function Composer({ them, theirShelf, box, engine, onSent, onCancel }) {
  const [want, setWant] = useState([]);
  const [give, setGive] = useState([]);
  const [msg, setMsg] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const mine = useMemo(() => box.filter((m) => tradeable(box, m))
    .sort((a, b) => a.species - b.species || b.level - a.level).slice(0, 150), [box]);
  const toggle = (set) => (k) => set((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const giving = mine.filter((m) => give.includes(keyOf(m)));
  const precious = giving.some((m) => keeper(m) || isLegendary(m.species));

  const send = async () => {
    setBusy(true); setErr(null);
    const entered = await enterTrading(engine, giving);
    if (!entered.ok) { setBusy(false); setErr(entered.error); return; }
    const mids = giving.map((m) => entered.mids[m.uid]);
    const got = await proposeTrade(them.user_id, mids, want, msg);
    setBusy(false);
    if (!got.ok) { setErr(got.error); return; }
    engine.reconcileTrades({ locks: Object.fromEntries(mids.map((m) => [m, "offer"])) });
    onSent(`Offer sent to ${them.username}.`);
  };

  return (
    <div className="tc-edit">
      <section className="ev-card">
        <header className="ev-banner"><h4>{them.username} gives</h4><span className="tp-count">{want.length}/{LIMITS.MAX_SIDE}</span></header>
        <MonPick mons={theirShelf ?? []} picked={want} max={LIMITS.MAX_SIDE} onToggle={toggle(setWant)}
          empty={`${them.username} has nothing up for trade right now.`} />
      </section>
      <section className="ev-card">
        <header className="ev-banner"><h4>You give</h4><span className="tp-count">{give.length}/{LIMITS.MAX_SIDE}</span></header>
        <MonPick mons={mine} picked={give} max={LIMITS.MAX_SIDE} onToggle={toggle(setGive)}
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
      <div className="tp-actions">
        <button type="button" className="ev-go" disabled={busy || !want.length || !give.length} onClick={send}>
          {busy ? "Sending…" : `Send offer · ${give.length} for ${want.length}`}
        </button>
        <button type="button" className="tp-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* THE OFFERS TAB: incoming first (they are waiting on you), then sent, then
   what already happened. Accepting plays the trade scene straight away. */
/* A trainer's name that opens their profile - where Block and Report live,
   so an unwanted offer is one tap from them. */
export const Who = ({ name, onOpen }) => (onOpen
  ? <button type="button" className="of-name" onClick={() => onOpen(name)}>{name}</button>
  : <b>{name}</b>);

export function OffersTab({ inbox, sync, onTraded, onOpenTrainer }) {
  const [busy, setBusy] = useState(null);
  const [say, setSay] = useState(null);
  // App holds the inbox; asking it again updates every tab at once.
  const refresh = sync;
  useEffect(() => { sync(); }, [sync]);

  const open = inbox?.open?.filter((o) => o.kind === "direct") ?? [];
  const incoming = open.filter((o) => !o.mine), sent = open.filter((o) => o.mine);
  const history = inbox?.recent ?? [];

  const answer = async (o, yes) => {
    setBusy(o.id); setSay(null);
    const got = await answerTrade(o.id, yes);
    setBusy(null);
    if (!got.ok) { setSay(got.error); return; }
    if (got.data === "done") {
      onTraded({ id: o.id, kind: "direct", partner: o.partner, at: new Date().toISOString(), gave: o.want, got: o.give });
    } else if (got.data === "failed") {
      setSay("That offer can't happen any more - something in it moved, or a daily limit was reached.");
    }
    refresh();
  };
  const cancel = async (o) => {
    setBusy(o.id);
    await cancelTrade(o.id);
    setBusy(null);
    refresh();
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
                  <button type="button" className="ev-go" disabled={busy === o.id} onClick={() => answer(o, true)}>Accept</button>
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
