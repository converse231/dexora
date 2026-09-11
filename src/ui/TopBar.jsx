/* The header: identity on the left, progress on the right.

   It used to be one run of same-sized pixel text - "¥410 DEX 21/151 CAUGHT 69
   STEPS 1264" - where every value looked exactly like every other and you had to
   read the labels to find the one you wanted. Each figure is a tile now: a small
   faint label over a large value, so the numbers are what you see and the labels
   are only there when you need to check what one means. */

import { levelProgress } from "../game/biomes.js";

/* "+3 +2 balls" - the whole parcel in one short line, because four separate
   floating numbers over one counter is confetti, not information. */
const parcelLabel = (items) => {
  const n = Object.values(items).reduce((a, b) => a + b, 0);
  return `+${n} ball${n === 1 ? "" : "s"}`;
};

export default function TopBar({
  caught, total, steps, money, deltas = [], parcel = null, xp, onReset,
}) {
  const { level, into, need, frac } = levelProgress(xp);

  return (
    <div className="topbar">
      {/* Just the name. There was a PHASE 1 chip here, hard-coded, and it was
          still saying PHASE 1 through two phases of work - a label that can
          only ever be right by coincidence. The roadmap lives in README.md. */}
      <div className="tb-brand">
        <span className="title">Meadow Route</span>
      </div>

      <div
        className="tb-lv"
        title={need ? `${into} / ${need} XP to Lv ${level + 1}` : "Max level"}
      >
        <span className="tb-lv-num">LV <b>{level}</b></span>
        <span className="xpbar"><i style={{ width: `${Math.round(frac * 100)}%` }} /></span>
        <span className="tb-lv-xp">{need ? `${into}/${need} XP` : "MAX"}</span>
      </div>

      <span className="spacer" />

      <div className="tb-stats">
        <span className={`tb-stat cash${deltas.length ? " bump" : ""}`}>
          <i>MONEY</i>
          <b>¥{money.toLocaleString()}</b>
          <span className="deltas" aria-hidden="true">
            {deltas.map((d) => (
              <em key={d.id} className={d.amount > 0 ? "up" : "down"}>
                {d.amount > 0 ? "+" : "−"}¥{Math.abs(d.amount).toLocaleString()}
              </em>
            ))}
          </span>
        </span>

        <span className="tb-stat">
          <i>POKÉDEX</i>
          <b>{caught}<u>/151</u></b>
        </span>

        <span className="tb-stat">
          <i>CAUGHT</i>
          <b>{total.toLocaleString()}</b>
        </span>

        {/* Walking pays, and it says so here rather than in a banner. The
            same floating shape the money counter uses, on the counter the
            reward is actually measured in. */}
        <span className={`tb-stat steps${parcel ? " bump" : ""}`}>
          <i>STEPS</i>
          <b>{steps.toLocaleString()}</b>
          <span className="deltas" aria-hidden="true">
            {parcel && <em className="up">{parcelLabel(parcel.items)}</em>}
          </span>
        </span>
      </div>

      <button onClick={onReset}>RESET</button>
    </div>
  );
}
