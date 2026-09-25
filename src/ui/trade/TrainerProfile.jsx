/* A TRAINER'S PROFILE - the page you visit (docs/trading.md, Phase 1). One
   component for your own card and anybody else's: the numbers are the same
   object either way, and only the buttons at the bottom differ.

   Everything on it came from `trainer_cards`, which the database keeps from
   the save - so a showcase here is what that trainer really holds, never what
   their client claimed. */
import { SPECIES } from "../../data/dex.js";
import { speciesById, levelFromXp } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS } from "../../game/trade.js";
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

export default function TrainerProfile({
  card, self = false, relation = null, busy = false, dexOf = () => 0,
  onAdd, onAccept, onRemove, onEdit, onShare,
}) {
  const level = levelFromXp(card.xp ?? 0);
  return (
    <div className="tp">
      <header className={`tp-hero ch-${card.char}`}>
        <span className="tp-art-frame"><TrainerArt char={card.char} className="tp-art" /></span>
        <div className="tp-id">
          <h4>{card.username}</h4>
          <span>Lv {level} trainer · since {joined(card.joined_at)}</span>
          {self && (
            <span className="tp-code" data-tip="Friends add you with this code">
              FRIEND CODE <b>{card.friend_code}</b>
            </span>
          )}
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

      <div className="tp-actions">
        {self ? (
          <>
            <button type="button" className="ev-go" onClick={onEdit}>Edit showcase &amp; wishes</button>
            <button type="button" className="tp-quiet" onClick={onShare}>Copy profile link</button>
          </>
        ) : (
          <>
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
    </div>
  );
}
