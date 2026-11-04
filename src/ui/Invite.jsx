/* INVITE FRIENDS (referral.js, db/referrals.sql; asked for, 2026-10-15).

   Your link to copy or share, what you both get, what "getting going" asks
   of a friend (the server's rule - steps, catches, separate days), each
   friend you invited with how far they are, and the claim. If you joined
   through someone's link, your own welcome gift's progress sits on top.

   It only ever SHOWS what the server answered (`info`); the engine pays
   (`onClaim`), once per reward id.

   THE STARFORGED FOUR head it (`Looks`, eventforms.js): the point of inviting,
   seen first, signed in or not. `InviteIntro` is their announcement, once a
   device, and leads here. */
import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import Icon from "./Icon.jsx";
import { TrainerArt, spriteUrl } from "./Sprite.jsx";
import { REF_RULE, REF_WELCOME, REF_EACH, REF_FRIEND_LOOK, REF_MILESTONES, inviteLink, referralDue, rewardWords } from "../game/referral.js";
import { itemById } from "../game/items.js";
import { INVITE } from "../data/eventforms.js";

const itemName = (id) => itemById(id)?.name ?? id;
const asset = (path) => new URL(path, document.baseURI).href;

// A reward drawn as its items: the ball or candy picture, or a pack, and the count.
function Prize({ r }) {
  const bits = [
    ...Object.entries(r.items ?? {}).map(([id, n]) => [asset(`items/${id}.png`), n, itemName(id)]),
    r.candy && [asset("items/rare-candy.png"), r.candy, "Rare Candy"],
  ].filter(Boolean);
  return (
    <span className="iv-prize" aria-label={rewardWords(r, itemName)}>
      {r.mon && <span data-tip={rewardWords({ mon: r.mon })}><img src={asset(spriteUrl(r.mon))} alt="" />{rewardWords({ mon: r.mon })}</span>}
      {bits.map(([src, n, name]) => <span key={name} data-tip={name}><img src={src} alt="" />×{n}</span>)}
      {r.packs > 0 && <span data-tip={r.packs >= 36 ? "A booster box" : "Card packs"}><Icon n="cards" size={18} />{r.packs >= 36 ? "Box" : `×${r.packs}`}</span>}
      {r.medal && <span>{rewardWords({ medal: r.medal })}</span>}
    </span>
  );
}

// The four, each at the friends it takes; the ones you have reached are marked.
function Looks({ counted = 0 }) {
  return (
    <ol className="iv-looks">
      {INVITE.looks.map((l) => (
        <li key={l.id} className={counted >= l.friends ? "done" : ""}>
          <img src={asset(spriteUrl(l.id))} alt="" />
          <b>{l.title.replace(`${INVITE.title} `, "")}</b>
          <small>{l.friends} friend{l.friends > 1 ? "s" : ""}{l.friends === 1 ? ", for you both" : ""}{l === INVITE.looks.at(-1) ? " + title" : ""}</small>
        </li>
      ))}
    </ol>
  );
}

/* THE ANNOUNCEMENT (asked for, 2026-11-05): once a device, on the map, after
   the day's check-in (App). A press on Invite friends opens the dialog below. */
export function InviteIntro({ onGo, onClose }) {
  useModalLock();
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);
  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="confirm iv iv-intro" role="dialog" aria-modal="true" aria-labelledby="iv-intro-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cd-x" onClick={onClose} aria-label="Close">✕</button>
        <span className="iv-kicker">New · Only from inviting friends</span>
        <h2 id="iv-intro-title">{INVITE.title} Pokémon</h2>
        <p>Four Pokémon you can't catch anywhere. Bring friends into Dexora, and when they get going, these are yours.</p>
        <Looks />
        <div className="iv-go">
          <button type="button" className="ci-go" onClick={onGo}>Invite friends</button>
          <button type="button" className="ci-go quiet" onClick={onClose}>Later</button>
        </div>
      </div>
    </div>
  );
}

// How far one newcomer is through the rule: three small meters.
function Progress({ p }) {
  const meters = [
    ["Days", p.days, REF_RULE.days],
    ["Steps", p.steps, REF_RULE.steps],
    ["Caught", p.caught, REF_RULE.caught],
  ];
  return (
    <span className="iv-meters">
      {meters.map(([name, n, of]) => (
        <span key={name} className={n >= of ? "done" : ""}>
          <i style={{ "--p": Math.min(1, n / of) }} />
          <small>{name} {Math.min(n, of).toLocaleString()}/{of.toLocaleString()}</small>
        </span>
      ))}
    </span>
  );
}

export default function Invite({ name, info, signedIn, paidIds = [], welcome = false, onClaim, onRefresh, onClose, onJoin = null }) {
  useModalLock();
  const [note, setNote] = useState("");
  const [got, setGot] = useState(null);
  useEffect(() => { onRefresh?.(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);

  const link = name ? inviteLink(`${location.origin}${location.pathname}`, name) : "";
  const due = referralDue(info, paidIds);
  const invited = info?.invited ?? [];
  const paidCount = invited.filter((x) => x.paid).length;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setNote("Link copied - send it to a friend."); }
    catch { setNote("Copy this link: " + link); }
  };
  const share = async () => {
    try { await navigator.share({ title: "Play Dexora with me", text: "Catch Pokémon with me on Dexora - we both get a Starforged Pikachu:", url: link }); }
    catch { /* closed the share sheet */ }
  };

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="confirm iv" role="dialog" aria-modal="true" aria-label="Invite friends" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cd-x" onClick={onClose} aria-label="Close">✕</button>
        <header className="iv-hero">
          <span className="iv-gift" aria-hidden="true"><Icon n="gift" size={30} /></span>
          <div>
            <h3>{welcome ? "Welcome to Dexora!" : "Invite friends"}</h3>
            <p>{welcome && info?.me
              ? `${info.me.referrer} invited you. Get going and you both earn a Starforged Pikachu.`
              : "Bring a friend in. When they get going, you both get big rewards."}</p>
          </div>
        </header>

        <section className="iv-card iv-star">
          <h4>{INVITE.title} Pokémon <small>Only from inviting friends</small></h4>
          <Looks counted={paidCount} />
        </section>

        {!signedIn ? (
          <>
            <p className="ev-quiet">Make an account to get your own invite link.</p>
            {onJoin && <button type="button" className="ev-go iv-claim" onClick={() => { onClose(); onJoin(); }}>Save my progress</button>}
          </>
        ) : (
          <>
            {info?.me && (
              <section className={`iv-card iv-me${info.me.qualified ? " done" : ""}`}>
                <h4>Your welcome gift <small>from {info.me.referrer}</small></h4>
                <Prize r={{ ...REF_WELCOME, ...REF_FRIEND_LOOK }} />
                {info.me.qualified ? <p className="iv-ok">Unlocked!</p> : <Progress p={info.me} />}
              </section>
            )}

            <section className="iv-card">
              <h4>Your invite link</h4>
              <div className="iv-link">
                <input className="tc-input" readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.target.select()} />
                <button type="button" className="lg-go" onClick={copy}>Copy</button>
                {typeof navigator.share === "function" && <button type="button" className="lg-go quiet" onClick={share}>Share</button>}
              </div>
              {note && <p className="iv-note" role="status">{note}</p>}
            </section>

            <section className="iv-card">
              <h4>Rewards</h4>
              <div className="iv-rows">
                <span className="iv-k">You, for each friend</span><Prize r={REF_EACH} />
                <span className="iv-k">Your friend</span><Prize r={{ ...REF_WELCOME, ...REF_FRIEND_LOOK }} />
              </div>
              <ol className="iv-ladder" aria-label="Milestones">
                {REF_MILESTONES.map(([n, r]) => (
                  <li key={n} className={paidCount >= n ? "done" : ""}>
                    <b>{n}</b><small>friends</small><Prize r={r} />
                  </li>
                ))}
              </ol>
            </section>

            <section className="iv-card">
              <h4>When does a friend count?</h4>
              <ol className="iv-steps">
                <li>They sign up with your link - a brand-new account.</li>
                <li>They walk <b>{REF_RULE.steps.toLocaleString()} steps</b> and catch <b>{REF_RULE.caught} Pokémon</b>.</li>
                <li>They play on <b>{REF_RULE.days} different days</b>. Then you both get your rewards.</li>
              </ol>
            </section>

            <section className="iv-card">
              <h4>Your invites <small>{invited.length ? `${paidCount} counted` : ""}</small></h4>
              {info === null ? <p className="ev-quiet">Loading…</p> : !invited.length
                ? <p className="ev-quiet">No one yet - send your link to a friend.</p>
                : (
                  <ul className="iv-list">
                    {invited.map((x) => (
                      <li key={x.id}>
                        <TrainerArt char={x.char} className="tc-art" />
                        <b>{x.username}</b>
                        {x.paid ? <span className="iv-ok">Counted ✓</span>
                          : x.qualified ? <span className="iv-cap">Got going - past your first {REF_RULE.cap}</span>
                            : <Progress p={x} />}
                      </li>
                    ))}
                  </ul>
                )}
            </section>

            {due.length > 0 && (
              <button type="button" className="ev-go iv-claim" onClick={() => setGot(onClaim())}>
                Claim {due.length} reward{due.length > 1 ? "s" : ""}
              </button>
            )}
            {got && (
              <ul className="iv-got" role="status">
                {got.map((r) => <li key={r.id}><b>{r.why}</b><Prize r={r} /></li>)}
              </ul>
            )}
            <p className="iv-fine">
              Rewards count for your first {REF_RULE.cap} friends. Only new accounts can use a link, within {REF_RULE.linkHours / 24} days
              of signing up. Accounts that cheat earn nothing.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
