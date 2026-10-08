/* THE DAILY CHECK-IN (docs/checkin.md): the week's seven days as a track,
   today's lit, and one press. The press pays and SAVES first
   (`engine.checkIn`); then today's tile is stamped and the reward rises off
   it. A milestone streak day takes the whole screen. The seventh day banks
   a roulette spin, offered straight away. */
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { ItemIcon } from "./Sprite.jsx";
import { useDismiss, useModalLock } from "./modal.js";
import { itemById } from "../game/items.js";
import { CHECKIN_REWARDS, WEEK, STREAK_MILESTONES } from "../game/checkin.js";

const yen = (n) => `¥${n.toLocaleString()}`;
// A reward's icon and its words.
function Reward({ r }) {
  // Day 7, the wide tile: its money and the spin together.
  if (r.spin) {
    return (
      <>
        <span className="ci-ic ci-spin"><Icon n="gift" size={30} /></span>
        <span className="ci-prize">{r.money ? <><b>{yen(r.money)}</b><small>+ Roulette spin</small></> : <b>Roulette spin</b>}</span>
      </>
    );
  }
  if (r.money) return <><span className="ci-ic ci-yen"><Icon n="yen" size={26} /></span><b>{yen(r.money)}</b></>;
  if (r.candy) return <><ItemIcon item={{ id: "rare-candy" }} className="ci-ic" /><b>{r.candy} Candy</b></>;
  const [id, n] = Object.entries(r.items)[0];
  return <><ItemIcon item={itemById(id)} className="ci-ic" /><b>{n > 1 ? `${n} ` : ""}{itemById(id)?.short ?? itemById(id)?.name}</b></>;
}
const says = (r) => [r.money && yen(r.money), r.candy && `${r.candy} Rare Candy`,
  ...Object.entries(r.items ?? {}).map(([id, n]) => `${n} ${itemById(id)?.name ?? id}`), r.spin && "a roulette spin"].filter(Boolean).join(" + ");

export default function CheckIn({ status, best, onCheckIn, onSpin, onClose }) {
  useModalLock();
  const [got, setGot] = useState(null);         // what checkIn answered
  const [party, setParty] = useState(false);    // the milestone screen
  const streak = got?.streak ?? status.streak;
  const day = got?.day ?? status.day;
  const press = () => {
    const r = onCheckIn();
    if (!r) { onClose(); return; }
    setGot(r);
    if (r.milestone) setTimeout(() => setParty(true), 650);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); if (party) setParty(false); else onClose(); }
      else if (e.key === "Enter" && !got) { e.preventDefault(); press(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  const next = STREAK_MILESTONES.find((m) => m > streak);

  return (
    <div className="sheet" {...useDismiss(() => { if (party) setParty(false); else onClose(); })}>
      <div className={`ci-card${got ? " done" : ""}`} role="dialog" aria-modal="true" aria-label="Daily check-in" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="set-x ci-x" aria-label="Close" onClick={onClose}>✕</button>
        <span className="ci-kicker">Daily check-in</span>
        <div className="ci-streak">
          <Icon n="flame" size={34} />
          <b key={streak}>{streak}</b>
          <span>day streak<i>{best > streak ? `Best ${best}` : next ? `${next - streak} to ${next}` : "Legendary"}</i></span>
        </div>
        {status.broken && !got && <p className="ci-broke">Your streak ended. A new one starts today - keep it going!</p>}
        <ol className="ci-week">
          {CHECKIN_REWARDS.map((r, i) => {
            const n = i + 1;
            const state = n < day || (got && n === day) ? "past" : n === day ? "today" : "later";
            return (
              <li key={n} className={`ci-day ${state}${r.spin ? " spin" : ""}${got && n === day ? " stamp" : ""}`}>
                <em>Day {n}</em>
                <Reward r={r} />
                {state === "past" && <span className="ci-check" aria-label="checked in"><Icon n="check" size={16} /></span>}
              </li>
            );
          })}
        </ol>
        {got ? (
          <div className="ci-got" role="status">
            <span>Checked in</span>
            <b>{says(got.reward)}</b>
            {got.reward.spin
              ? <button type="button" className="ci-go" autoFocus onClick={onSpin}><Icon n="gift" size={18} /> Spin the roulette</button>
              : <button type="button" className="ci-go quiet" autoFocus onClick={onClose}>Continue</button>}
          </div>
        ) : (
          <button type="button" className="ci-go" autoFocus onClick={press}>Check in</button>
        )}
        <p className="ci-foot">Come back every day. Day {WEEK} of every week spins the roulette: card packs or a Gold Pokémon.</p>
      </div>

      {party && (
        <div className="ci-party" role="dialog" aria-label={`${streak}-day streak`} onClick={(e) => { e.stopPropagation(); setParty(false); }}>
          <i className="ci-rays" aria-hidden="true" />
          {Array.from({ length: 18 }, (_, k) => <i key={k} className="ci-bit" style={{ "--k": k }} aria-hidden="true" />)}
          <div className="ci-medal">
            <Icon n="flame" size={54} />
            <b>{streak}</b>
            <span>DAY STREAK</span>
          </div>
          <p>{streak >= 100 ? "Unstoppable." : streak >= 30 ? "A whole month. Incredible." : "A full week. Keep it burning!"}</p>
          <small>Tap to continue</small>
        </div>
      )}
    </div>
  );
}
