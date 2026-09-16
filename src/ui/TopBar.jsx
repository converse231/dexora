/* The header: identity on the left, progress on the right.

   It used to be one run of same-sized pixel text - "¥410 DEX 21/151 CAUGHT 69
   STEPS 1264" - where every value looked exactly like every other and you had to
   read the labels to find the one you wanted. Each figure is a tile now: a small
   faint label over a large value, so the numbers are what you see and the labels
   are only there when you need to check what one means. */

import { useEffect, useRef, useState } from "react";
import { levelProgress } from "../game/biomes.js";
import Daily from "./Daily.jsx";
import { SPECIES } from "../data/dex.js";

/* "+3 +2 balls" - the whole parcel in one short line, because four separate
   floating numbers over one counter is confetti, not information. */
const parcelLabel = (items) => {
  const n = Object.values(items).reduce((a, b) => a + b, 0);
  return `+${n} ball${n === 1 ? "" : "s"}`;
};

/* TODAY'S QUEST, WHERE IT CAN BE FOUND.

   It lived on the YOU tab behind a `!` on the tab badge, which is a fine place
   to READ it and a bad place to discover it: reported as "I am not sure where
   to see the missions", which is the whole verdict on a feature hidden one tab
   deep behind a dot. The top bar is the one thing on screen in every state of
   the game, so that is where a thing you are meant to track goes.

   COLLAPSED BY DEFAULT and summarised on the button - the count is the part you
   glance at, and the card is the part you open once a day. There is ONE card:
   this renders `Daily.jsx`, the same component the YOU tab used to, rather than
   a second smaller copy of it that would drift. */
function Missions({ daily, onClaim, note }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const goal = daily?.goal;
  const done = Math.min(daily?.done ?? 0, goal?.need ?? 0);
  const ready = goal && !daily.claimed && done >= goal.need;

  /* Click away and Escape, because this is a popover over a game that reads
     the keyboard - and a panel you cannot dismiss without finding its button
     again is a panel people leave open. */
  useEffect(() => {
    if (!open) return undefined;
    const away = (ev) => { if (!box.current?.contains(ev.target)) setOpen(false); };
    const esc = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); setOpen(false); } };
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc, true);
    return () => {
      removeEventListener("pointerdown", away);
      removeEventListener("keydown", esc, true);
    };
  }, [open]);

  if (!goal) return null;
  return (
    <div className={`missions${open ? " open" : ""}`} ref={box}>
      <button
        type="button"
        className={`ms-tab${ready ? " ready" : ""}${daily.claimed ? " done" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-tip={ready ? "Today's quest is ready to claim"
          : daily.claimed ? "Claimed - come back tomorrow"
            : "Today's quest"}
      >
        <i>QUEST</i>
        <b>
          {daily.claimed ? "DONE" : `${done}/${goal.need}`}
          {ready && <em className="ms-dot" aria-hidden="true">!</em>}
        </b>
      </button>

      {open && (
        <div className="ms-pop" role="dialog" aria-label="Today's quest">
          <Daily daily={daily} onClaim={onClaim} note={note} />
        </div>
      )}
    </div>
  );
}

export default function TopBar({
  caught, total, steps, money, candy = 0, deltas = [], parcel = null, xp, onReset,
  onLogOut = null,
  stale = null,
  daily, onClaimDaily, claimNote,
}) {
  const { level, into, need, frac } = levelProgress(xp);

  return (
    <div className="topbar">
      {/* Just the name. There was a PHASE 1 chip here, hard-coded, and it was
          still saying PHASE 1 through two phases of work - a label that can
          only ever be right by coincidence. The roadmap lives in README.md. */}
      <div className="tb-brand">
        <span className="title">Dexora</span>
      </div>

      <div
        className="tb-lv"
        data-tip={need ? `${into} / ${need} XP to Lv ${level + 1}` : "Max level"}
      >
        <span className="tb-lv-num">LV <b>{level}</b></span>
        <span className="xpbar"><i style={{ width: `${Math.round(frac * 100)}%` }} /></span>
        <span className="tb-lv-xp">{need ? `${into}/${need} XP` : "MAX"}</span>
      </div>

      <Missions daily={daily} onClaim={onClaimDaily} note={claimNote} />

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

        {/* Beside the money, because it is the other half of the same
            decision: a spare is one or the other and you pick every time. */}
        <span className="tb-stat">
          <i>CANDY</i>
          <b>
            <img src="items/rare-candy.png" alt="" className="tb-candy" />
            {candy.toLocaleString()}
          </b>
        </span>

        <span className="tb-stat">
          <i>POKÉDEX</i>
          {/* The dex SIZE, not 151 - which was typed in, survived two
              generations, and told every player they had finished at 151 of
              358. Read off SPECIES rather than threaded as a prop, because
              `total` already means "catches made" two rows down and one word
              meaning two things is how this sort of bug gets made twice. */}
          <b>{caught}<u>/{SPECIES.length}</u></b>
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

      {/* A SAVE THAT STOPPED WORKING SAYS SO, HERE. The engine plays on when a
          write fails - losing the session to a failed write would be worse -
          but it used to do it in silence, so an hour of catching could go
          nowhere with nothing on screen to say it had. `role="alert"` because
          it appears mid-session rather than on load: it has to interrupt. */}
      {stale && (
        <p className="tb-stale" role="alert">
          <b>NOT SAVING</b>
          {stale === "full"
            ? " — this browser's storage is full. Sell some spares, or export from the YOU tab."
            : " — this browser is blocking storage. Export from the YOU tab to keep this game."}
        </p>
      )}

      {/* One or the other, never both - see App. */}
      {onLogOut
        ? <button className="tb-out" onClick={onLogOut}>LOG OUT</button>
        : <button onClick={onReset}>RESET</button>}
    </div>
  );
}
