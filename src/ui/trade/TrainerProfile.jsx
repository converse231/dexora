/* A TRAINER'S PROFILE - the page you visit (docs/trading.md, Phase 1). One
   component for your own card and anybody else's: the numbers are the same
   object either way, and only the buttons at the bottom differ.

   Everything on it came from `trainer_cards`, which the database keeps from
   the save - so a showcase here is what that trainer really holds, never what
   their client claimed. */
import { useEffect, useState } from "react";
import { SPECIES } from "../../data/dex.js";
import { speciesById, levelFromXp } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS, REPORT_REASONS } from "../../game/trade.js";
import Sprite, { TrainerArt } from "../Sprite.jsx";
import Mark from "../Marks.jsx";

const joined = (at) => (at
  ? new Date(at).toLocaleDateString(undefined, { month: "short", year: "numeric" })
  : "");

/* The Pokedex ring and three counts: how far, how rare, how finished, how
   social. The ring is the one that is a proportion, so it is the one drawn. */
function Stats({ card }) {
  const pct = card.dex_count / SPECIES.length;
  return (
    <div className="tp-stats">
      <span className="tp-ring" style={{ "--p": pct }} data-tip={`${card.dex_count} of ${SPECIES.length} species`}>
        <b>{Math.round(pct * 100)}<i>%</i></b>
      </span>
      <span><b>{card.dex_count}</b>Pokédex</span>
      <span><b>{card.variants}</b>rare forms</span>
      <span><b>{card.stars}</b>stars</span>
      <span><b>{card.trades}</b>trades</span>
    </div>
  );
}

function Showcase({ list }) {
  const slots = Array.from({ length: LIMITS.SHOWCASE }, (_, i) => list[i] ?? null);
  return (
    <div className="tp-show">
      {slots.map((m, i) => {
        const sp = m && speciesById(m.species);
        return sp ? (
          <figure key={i} className={`tp-slot${m.tier ? ` has-${m.tier}` : ""}`}>
            <Sprite id={sp.id} variant={m.tier} fx alt={label(sp)} />
            {m.alpha && <span className="tp-alpha"><Mark tier="alpha" size={11} /></span>}
            {m.tier && <span className="tp-tier"><Mark tier={m.tier} size={12} /></span>}
            <figcaption><b>{label(sp)}</b><i>Lv {m.level}</i></figcaption>
          </figure>
        ) : (
          <figure key={i} className="tp-slot empty" aria-hidden="true"><span>?</span></figure>
        );
      })}
    </div>
  );
}

/* WHAT THEY ARE LOOKING FOR. A species you have never seen stays a question
   mark - somebody else's wish list must not spoil your dex. */
function Seeking({ ids, dexOf }) {
  if (!ids.length) return <p className="ev-quiet">Nothing listed yet.</p>;
  return (
    <div className="tp-seek">
      {ids.map((id) => {
        const sp = speciesById(id);
        if (!sp) return null;
        const known = dexOf(id) >= 1;
        return (
          <span key={id} className={`tp-chip${dexOf(id) === 2 ? " have" : ""}`}
            data-tip={known ? (dexOf(id) === 2 ? "You have caught one" : "Seen") : "Not seen yet"}>
            {known ? <Sprite id={id} alt="" /> : <i className="tp-q">?</i>}
            {known ? label(sp) : "???"}
          </span>
        );
      })}
    </div>
  );
}

/* UP FOR TRADE: the Pokemon this trainer offered. An offer can only ask for
   these - nobody is badgered for a Pokemon they never put up. */
function Shelf({ list, self }) {
  if (!list.length) {
    return <p className="ev-quiet">{self ? "Nothing up for trade - pick some in Edit." : "Nothing up for trade right now."}</p>;
  }
  return (
    <div className="tp-shelf">
      {list.map((m) => {
        const sp = speciesById(m.species);
        return sp ? (
          <span key={m.mid} className="of-mon big" data-tip={`${label(sp)}, Lv ${m.level}`}>
            <Sprite id={sp.id} variant={m.tier} fx />
            {m.tier && <span className="tp-tier"><Mark tier={m.tier} size={10} /></span>}
            {m.alpha && <span className="tp-alpha"><Mark tier="alpha" size={9} /></span>}
            <i>Lv {m.level}</i>
          </span>
        ) : null;
      })}
    </div>
  );
}

/* YOUR FRIEND CODE, one tap to copy - it is read aloud or pasted, never typed
   from a screenshot. The tick is the feedback: the page may be scrolled past
   any note at its top. */
function FriendCode({ code }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* the code stays on screen */ }
  };
  return (
    <span className="tp-code" data-tip="Friends add you with this code">
      FRIEND CODE <b>{code}</b>
      <button type="button" className={`tp-copy${copied ? " done" : ""}`} onClick={copy}
        aria-label={copied ? "Friend code copied" : "Copy friend code"} data-tip={copied ? "Copied" : "Copy"}>
        {copied ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12.5l5 5L20 6.5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
          </svg>
        )}
      </button>
    </span>
  );
}

/* BLOCK AND REPORT, quiet and last. Both ask first: a block ends a
   friendship and closes open offers, and a report is filed for good. */
function Safety({ name, busy, onBlock, onReport }) {
  const [ask, setAsk] = useState(null);
  if (ask === "block") {
    return (
      <div className="tp-ask" role="group" aria-label={`Block ${name}`}>
        <p>Block <b>{name}</b>? Neither of you can find the other, your friendship ends and open offers between you close.</p>
        <button type="button" className="tp-quiet danger" disabled={busy} onClick={onBlock}>Yes, block</button>
        {/* Focus lands on the safe answer: the pressed button is gone. */}
        <button type="button" className="tp-quiet" autoFocus onClick={() => setAsk(null)}>Cancel</button>
      </div>
    );
  }
  if (ask === "report") {
    return (
      <div className="tp-ask" role="group" aria-label={`Report ${name}`}>
        <p>What&rsquo;s wrong with <b>{name}</b>?</p>
        <div className="tp-seek">
          {REPORT_REASONS.map((r, i) => (
            <button key={r} type="button" className="tp-chip add" disabled={busy}
              onClick={() => { setAsk(null); onReport(i); }}>{r}</button>
          ))}
        </div>
        <button type="button" className="tp-quiet" autoFocus onClick={() => setAsk(null)}>Cancel</button>
      </div>
    );
  }
  return (
    <div className="tp-safety">
      <button type="button" className="tp-quiet" onClick={() => setAsk("report")}>Report</button>
      <button type="button" className="tp-quiet danger" onClick={() => setAsk("block")}>Block</button>
    </div>
  );
}

export default function TrainerProfile({
  card, self = false, relation = null, busy = false, dexOf = () => 0, shelf = null,
  onAdd, onAccept, onRemove, onEdit, onShare, onPropose, onBlock, onReport,
}) {
  const level = levelFromXp(card.xp ?? 0);
  return (
    <div className="tp">
      <header className={`tp-hero ch-${card.char}`}>
        <span className="tp-art-frame"><TrainerArt char={card.char} className="tp-art" /></span>
        <div className="tp-id">
          <h4>{card.username}</h4>
          <span>Lv {level} trainer · since {joined(card.joined_at)}</span>
          {self && <FriendCode code={card.friend_code} />}
        </div>
      </header>

      <Stats card={card} />

      <section className="ev-card">
        <header className="ev-banner">
          <h4>Showcase</h4>
          <span className="tp-count">{card.showcase.length}/{LIMITS.SHOWCASE}</span>
        </header>
        <Showcase list={card.showcase} />
      </section>

      <section className="ev-card">
        <header className="ev-banner">
          <h4>Looking for</h4>
          <span className="tp-count">{card.seeking.length}/{LIMITS.SEEKING}</span>
        </header>
        <Seeking ids={card.seeking} dexOf={dexOf} />
      </section>

      {shelf !== null && (
        <section className="ev-card">
          <header className="ev-banner">
            <h4>Up for trade</h4>
            <span className="tp-count">{shelf.length}/{LIMITS.SHELF}</span>
          </header>
          <Shelf list={shelf} self={self} />
        </section>
      )}

      <div className="tp-actions">
        {self ? (
          <>
            <button type="button" className="ev-go" onClick={onEdit}>Edit showcase &amp; wishes</button>
            <button type="button" className="tp-quiet" onClick={onShare}>Copy profile link</button>
          </>
        ) : (
          <>
            {shelf?.length > 0 && (
              <button type="button" className="ev-go" disabled={busy} onClick={onPropose}>Propose a trade</button>
            )}
            {relation === "friends" && <span className="tp-badge">✓ Friends</span>}
            {relation === "sent" && <span className="tp-badge">Request sent</span>}
            {relation === "incoming" && (
              <button type="button" className="ev-go" disabled={busy} onClick={onAccept}>Accept friend request</button>
            )}
            {!relation && (
              <button type="button" className="ev-go" disabled={busy} onClick={onAdd}>Add friend</button>
            )}
            <button type="button" className="tp-quiet" onClick={onShare}>Copy profile link</button>
            {(relation === "friends" || relation === "sent") && (
              <button type="button" className="tp-quiet danger" disabled={busy} onClick={onRemove}>
                {relation === "friends" ? "Remove friend" : "Cancel request"}
              </button>
            )}
          </>
        )}
      </div>
      {!self && onBlock && <Safety name={card.username} busy={busy} onBlock={onBlock} onReport={onReport} />}
    </div>
  );
}
