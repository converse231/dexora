/* THE DAILY CHECK-IN (docs/checkin.md): the week's seven days as a track,
   today's lit, and one press. The press pays and SAVES first
   (`engine.checkIn`); then today's tile is stamped and the reward rises off
   it. A milestone streak day takes the whole screen. The seventh day banks
   a roulette spin, offered straight away. */
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Confetti from "./Confetti.jsx";
import { ItemIcon } from "./Sprite.jsx";
import { useDismiss, useModalLock } from "./modal.js";
import { itemById } from "../game/items.js";
import { CHECKIN_REWARDS, WEEK, STREAK_PACKS, STREAK_MONTH, nextPackDay, streakPacks } from "../game/checkin.js";
import { eventCheckin } from "../game/events.js";

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

export default function CheckIn({ status, best, onCheckIn, onSpin, onPacks, onClose }) {
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
      else if (e.key === "Enter" && !got && status.due) { e.preventDefault(); press(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  /* THE ROAD TO THE NEXT PACK DAY (checkin.js `streakPacks`): a bar from the
     last pack day to the next. Before today's press it counts today as done,
     so the bar shows where the press takes you. */
  // Today itself, while it pays packs and is not yet pressed.
  const next = status.due && !got && streakPacks(streak) ? streak : nextPackDay(streak);
  const prev = next > STREAK_PACKS.at(-1)[0] ? next - STREAK_MONTH : [0, ...STREAK_PACKS.map(([d]) => d)].filter((d) => d < next).at(-1);
  const fill = (streak - prev) / (next - prev);
  const packs = got?.packs ?? [];
  // An event's check-in day: its extra, named before the press and after.
  const bonus = got ? got.bonus : status.due ? eventCheckin() : null;

  return (
    <div className="sheet" {...useDismiss(() => { if (party) setParty(false); else onClose(); })}>
      <div className={`ci-card${got ? " done" : ""}`} role="dialog" aria-modal="true" aria-label="Daily check-in" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="set-x ci-x" aria-label="Close" onClick={onClose}>✕</button>
        <span className="ci-kicker">Daily check-in</span>
        <div className="ci-streak">
          <Icon n="flame" size={34} />
          <b key={streak}>{streak}</b>
          <span>day streak<i>Best {Math.max(best, streak)}</i></span>
        </div>
        <div className={`ci-goal${next === streak ? " now" : ""}`} aria-label={next === streak ? `Check in for ${streakPacks(next)} card packs` : `${next - streak} days to ${streakPacks(next)} card packs`}>
          <span><b>{next === streak ? "Today" : `Day ${next}`}</b> · {streakPacks(next)} card packs</span>
          <i style={{ "--p": fill }} />
          <small>{next === streak ? "Check in!" : next - streak === 1 ? "Tomorrow!" : `${next - streak} days to go`}</small>
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
        {bonus && (
          <div className="ci-bonus">
            {Object.entries(bonus.items).map(([id, n]) => <ItemIcon key={id} item={itemById(id)} className="ci-ic" />)}
            <span>
              <b>{bonus.event.name} bonus</b>
              {got ? "Added to your bag: " : "Check in today for "}{says({ items: bonus.items })}
            </span>
          </div>
        )}
        {got ? (
          <div className="ci-got" role="status">
            <span>Checked in</span>
            <b>{says(got.reward)}{got.bonus ? ` + ${says({ items: got.bonus.items })}` : ""}{packs.length ? ` + ${streakPacks(streak)} card packs` : ""}</b>
            {/* Day 70 is a pack day AND a seventh day: the packs first, the spin waits as its pill. */}
            {packs.length
              ? <button type="button" className="ci-go" autoFocus onClick={() => onPacks(streak, packs)}><Icon n="gift" size={18} /> Reveal your {streakPacks(streak)} packs</button>
              : got.reward.spin
                ? <button type="button" className="ci-go" autoFocus onClick={onSpin}><Icon n="gift" size={18} /> Spin the roulette</button>
                : <button type="button" className="ci-go quiet" autoFocus onClick={onClose}>Continue</button>}
          </div>
        ) : status.due ? (
          <button type="button" className="ci-go" autoFocus onClick={press}>Check in</button>
        ) : (
          <div className="ci-got" role="status">
            <span>Checked in today</span>
            <button type="button" className="ci-go quiet" autoFocus onClick={onClose}>Come back tomorrow</button>
          </div>
        )}
        <p className="ci-foot">Come back every day. Day {WEEK} of every week spins the roulette, and days {STREAK_PACKS.map(([d]) => d).join(", ")} pay card packs - then {streakPacks(STREAK_PACKS.at(-1)[0] + STREAK_MONTH)} every {STREAK_MONTH} days.</p>
      </div>

      {party && (
        <div className="ci-party" role="dialog" aria-label={`${streak}-day streak`} onClick={(e) => { e.stopPropagation(); setParty(false); }}>
          {/* THE CARD PULL'S POP (2026-10-13, asked for): its flash, its corner
              cannons and its masked rays. The party had its own 18 bits on one
              falling track, which read as a line drifting across the screen,
              and full-screen hard rays. */}
          <span className="cd-flash" aria-hidden="true" />
          <i className="ci-rays" aria-hidden="true" />
          <Confetti />
          <div className="ci-medal">
            <Icon n="flame" size={54} />
            <b>{streak}</b>
            <span>DAY STREAK</span>
          </div>
          {packs.length > 0 && <em className="ci-packs-won">+{streakPacks(streak)} card packs</em>}
          <p>{streak >= 100 ? "Unstoppable." : streak >= 30 ? "A whole month. Incredible." : packs.length ? "Your streak paid off. Keep it burning!" : "A full week. Keep it burning!"}</p>
          <small>Tap to continue</small>
        </div>
      )}
    </div>
  );
}
