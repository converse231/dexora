/* INVITE FRIENDS (referral.js, db/referrals.sql; asked for, 2026-10-15).

   Your link to copy or share, what you both get, what "getting going" asks
   of a friend (the server's rule - steps, catches, separate days), each
   friend you invited with how far they are, and the claim. If you joined
   through someone's link, your own welcome gift's progress sits on top.

   It only ever SHOWS what the server answered (`info`); the engine pays
   (`onClaim`), once per reward id. */
import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import Icon from "./Icon.jsx";
import { TrainerArt } from "./Sprite.jsx";
import { REF_RULE, REF_WELCOME, REF_EACH, REF_MILESTONES, inviteLink, referralDue, rewardWords } from "../game/referral.js";
import { itemById } from "../game/items.js";

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
      {bits.map(([src, n, name]) => <span key={name} data-tip={name}><img src={src} alt="" />×{n}</span>)}
      {r.packs > 0 && <span data-tip={r.packs >= 36 ? "A booster box" : "Card packs"}><Icon n="cards" size={18} />{r.packs >= 36 ? "Box" : `×${r.packs}`}</span>}
    </span>
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

export default function Invite({ name, info, signedIn, paidIds = [], welcome = false, onClaim, onRefresh, onClose }) {
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
    try { await navigator.share({ title: "Play Dexora with me", text: "Catch Pokémon with me on Dexora - we both get rewards:", url: link }); }
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
              ? `${info.me.referrer} invited you. Get going and you both earn a gift.`
              : "Bring a friend in. When they get going, you both get big rewards."}</p>
          </div>
        </header>

        {!signedIn ? <p className="ev-quiet">Sign in to get your own invite link.</p> : (
          <>
            {info?.me && (
              <section className={`iv-card iv-me${info.me.qualified ? " done" : ""}`}>
                <h4>Your welcome gift <small>from {info.me.referrer}</small></h4>
                <Prize r={REF_WELCOME} />
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
                <span className="iv-k">Your friend</span><Prize r={REF_WELCOME} />
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
