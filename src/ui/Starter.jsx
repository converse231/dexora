/* THE FIRST DAYS ON THE MAP (starter.js): the Starter Path's one goal, and
   a guest's soft "save your progress". Both small, both dismissible - a
   first visit gets one thing to do, never a wall of chips. */
import { useEffect } from "react";
import Icon from "./Icon.jsx";
import { useDismiss, useModalLock } from "./modal.js";
import { itemById } from "../game/items.js";
import { PATH } from "../game/starter.js";

// What a goal pays, in words.
const payOf = ({ money, candy, items = {} }) => [
  money && `¥${money.toLocaleString()}`,
  candy && `${candy} Rare Candy`,
  ...Object.entries(items).map(([id, n]) => `${n} ${itemById(id)?.name ?? id}s`),
].filter(Boolean).join(" + ");

/* THE GOAL, in the quest's place: what to do and where, its progress, and
   once met its reward to claim. A tap before then goes where it is done. */
export function PathCard({ path, onClaim, onGo }) {
  const { at, goal, value, ready } = path;
  return (
    <button type="button" className={`st-path${ready ? " ready" : ""}`}
      onClick={ready ? onClaim : () => onGo(goal.where)}
      aria-label={ready ? `Claim ${payOf(goal.pay)} for: ${goal.name}` : `Starter goal ${at + 1} of ${PATH.length}: ${goal.name}. ${goal.tip}`}>
      <i>STARTER PATH · {at + 1}/{PATH.length}</i>
      <b>{goal.name}{goal.need > 1 && !ready ? <u> {value}/{goal.need}</u> : null}</b>
      <small>{ready ? <>Claim <em>{payOf(goal.pay)}</em></> : goal.tip}</small>
      {ready && <span className="ms-dot" aria-hidden="true">!</span>}
    </button>
  );
}

/* SAVE YOUR PROGRESS: asked after a few catches, a few times at most. */
export function JoinAsk({ caught, onJoin, onClose }) {
  useModalLock();
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="ci-card st-join" role="dialog" aria-modal="true" aria-label="Save your progress" onClick={(e) => e.stopPropagation()}>
        <Icon n="users" size={34} />
        <h3>{caught} Pokémon caught!</h3>
        <p>They live on this browser only. A free account keeps your game safe, follows you to any device, and opens trading with friends.</p>
        <button type="button" className="ci-go" autoFocus onClick={onJoin}>Save my progress</button>
        <button type="button" className="ci-go quiet" onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}
