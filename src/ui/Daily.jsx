/* Today's quest, on the trainer's own page.

   It lives in YOU rather than in a tab of its own because it is a fact about
   the player, not a place - and a sixth tab for one card is a tab you stop
   seeing. The badge on the tab is what actually brings you back; this is where
   you read what it wants. */
import { describe, streakMult } from "../game/daily.js";
import Note from "./Note.jsx";

export default function Daily({ daily, onClaim, note }) {
  if (!daily?.goal) return null;
  const { goal, done, claimed, streak } = daily;
  const ready = !claimed && done >= goal.need;
  const frac = Math.min(1, done / goal.need);

  return (
    <div className={`daily${ready ? " ready" : ""}${claimed ? " done" : ""}`}>
      <div className="dy-head">
        <span>TODAY</span>
        {/* The streak only appears once there is one. A "×1.00" on day one is
            a multiplier explaining that nothing is being multiplied. */}
        {streak > 0 && (
          <span className="dy-streak" title={`${streak} days running`}>
            {streak}-DAY STREAK · ×{streakMult(streak).toFixed(2)}
          </span>
        )}
      </div>

      <p className="dy-goal">{describe(goal)}</p>

      {/* The same two-fill track the dex uses, for the same reason: a number
          you have to compare to another number is a bar somebody has not
          drawn yet. */}
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal.need}
        aria-valuenow={Math.min(done, goal.need)}
        aria-label={`${done} of ${goal.need}`}
      >
        <i style={{ width: `${frac * 100}%` }} />
      </div>

      <div className="dy-foot">
        <span className="dy-count">
          {Math.min(done, goal.need).toLocaleString()} / {goal.need.toLocaleString()}
        </span>
        {claimed ? (
          <em className="dy-done">CLAIMED · COME BACK TOMORROW</em>
        ) : (
          <button className="dy-claim" disabled={!ready} onClick={onClaim}>
            {ready ? "CLAIM" : "IN PROGRESS"}
          </button>
        )}
      </div>

      <Note>{note}</Note>
    </div>
  );
}
