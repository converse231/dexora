/* A FRIEND'S CHALLENGE, WHEREVER YOU ARE (2026-10-24, asked for: "notify the
   player wherever he is, like when I am catching"). The Arena page lists the
   challenges waiting for you only while its Battle a friend panel is open, so
   a challenge sent to somebody walking the map simply expired. App asks the
   server every `CALL_MS` and raises this; Accept answers it and opens the
   Arena on the match, Decline answers no, and closing it keeps the challenge
   on the Arena's own list until it runs out. */
import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import Icon from "./Icon.jsx";
import { ARENAS } from "../game/floors.js";

export const CALL_MS = 12000;

export function ArenaCall({ call, busy, error, onAnswer, onClose }) {
  useModalLock();
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  // Its own clock, a second at a time (never App's).
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.ceil((call.until - now) / 1000));
  const who = call.inv.card.username;
  const floor = ARENAS.find((a) => a.id === call.inv.arena)?.name;
  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="ci-card st-join ac-call" role="dialog" aria-modal="true" aria-label={`${who} challenges you`} onClick={(e) => e.stopPropagation()}>
        <Icon n="arena" size={34} />
        <h3>{who} challenges you!</h3>
        <p>A live Arena battle{floor ? <> on <b>{floor}</b></> : null}. {left ? `It waits ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} more.` : "It has run out."}</p>
        {error && <p className="ac-err" role="alert">{error}</p>}
        <button type="button" className="ci-go" autoFocus disabled={busy || !left} onClick={() => onAnswer(true)}>Accept</button>
        <button type="button" className="ci-go quiet" disabled={busy} onClick={() => onAnswer(false)}>Decline</button>
      </div>
    </div>
  );
}
