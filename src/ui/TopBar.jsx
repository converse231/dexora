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
import Icon from "./Icon.jsx";
import { dexRank } from "../game/medals.js";
import { RankMedal } from "./RankBadge.jsx";

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
export function Missions({ daily, onClaim, note }) {
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
    /* Into view: held sideways, the top bar sits BELOW the game, and the card
       opened under the fold where nobody saw it arrive. */
    box.current?.querySelector(".ms-pop")?.scrollIntoView({ block: "center", behavior: "smooth" });
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
        data-tip={open ? undefined : ready ? "Today's quest is ready to claim"
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

/* THE APP BAR (Rotom, 2026-10-01). The ☰ menu is gone: Dexora is three
   features side by side - Catch, Trade, Battles - plus You, which holds what the
   menu held. One `nav`, and CSS decides where it stands: in this bar on a
   desktop, a tab bar along the bottom of a phone, a rail down the left of a
   sideways one (see ROTOM SHELL at the end of styles.css). */
export const TABS = [["catch", "Catch", "ball"], ["trade", "Trade", "swap"], ["battles", "Battles", "trophy"]];

export default function TopBar({
  tab = "catch", onTab, caught, total, steps, money, candy = 0, deltas = [], parcel = null, xp,
  onNews = null, unread = false, tradeAlert = 0, youAlert = false,
  trainerName = null,
  stale = null,
}) {
  const { level, into, need, frac } = levelProgress(xp);
  const r = dexRank(caught);

  return (
    <header className="topbar">
      <span className="tb-logo" aria-hidden="true"><i><Icon n="ball" size={18} /></i>Dexora</span>

      <nav className="tb-tabs" aria-label="Main">
        {TABS.map(([id, name, ic]) => (
          <button key={id} type="button" className={`tb-tab t-${id}${tab === id ? " on" : ""}`}
            aria-current={tab === id ? "page" : undefined} onClick={() => onTab(id)}>
            <Icon n={ic} size={19} /><span>{name}</span>
            {id === "trade" && tradeAlert ? <em aria-label={`${tradeAlert} waiting`}>{tradeAlert}</em> : null}
          </button>
        ))}
        {/* YOU: the trainer's chip on a desktop, the fourth tab on a phone. */}
        <button type="button" className={`tb-tab t-you${tab === "you" ? " on" : ""}`}
          aria-current={tab === "you" ? "page" : undefined} onClick={() => onTab("you")}
          /* No tip: a tip shows on focus, and a tapped tab keeps focus - it
             sat over the page it had just opened. You says it all in full. */
          aria-label={`You: ${trainerName ?? "your trainer"}, level ${level}, ${r.name}`}>
          <span className="tb-medal"><RankMedal set="dex" id={r.id} color={r.color} /></span>
          <span className="tb-you">
            <b>{trainerName ?? "You"}</b>
            <small>LV {level} · {r.name}</small>
            <span className="xpbar"><i style={{ width: `${Math.round(frac * 100)}%` }} /></span>
          </span>
          <span className="tb-you-short">You</span>
          {youAlert && <i className="tb-dot" aria-label="Something new" />}
        </button>
      </nav>

      <span className="spacer" />

      <div className="tb-stats">
        <span className={`tb-stat cash${deltas.length ? " bump" : ""}`} data-tip="Money">
          <Icon n="yen" size={15} />
          <b>{money.toLocaleString()}</b>
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
        <span className="tb-stat candy" data-tip="Rare Candy">
          <img src="items/rare-candy.png" alt="" className="tb-candy" />
          <b>{candy.toLocaleString()}</b>
        </span>
        {/* The dex SIZE from SPECIES, never typed: 151 once told every player
            they had finished at 151 of 358. */}
        <span className="tb-stat dex" data-tip="Pokédex">
          <Icon n="dex" size={15} />
          <b>{caught}<u>/{SPECIES.length}</u></b>
        </span>
        <span className="tb-stat tb-extra" data-tip="Caught">
          <Icon n="ball" size={15} />
          <b>{total.toLocaleString()}</b>
        </span>
        {/* Walking pays, and it says so here rather than in a banner. */}
        <span className={`tb-stat tb-extra steps${parcel ? " bump" : ""}`} data-tip="Steps">
          <Icon n="steps" size={15} />
          <b>{steps.toLocaleString()}</b>
          <span className="deltas" aria-hidden="true">
            {parcel && <em className="up">{parcelLabel(parcel.items)}</em>}
          </span>
        </span>
      </div>

      {onNews && (
        <button type="button" className="tb-bell" onClick={onNews} aria-label="What's new" data-tip="What's new">
          <Icon n="bell" size={20} />
          {unread && <i className="tb-dot" aria-label="unread" />}
        </button>
      )}

      {/* A SAVE THAT STOPPED WORKING SAYS SO, HERE - `role="alert"` because it
          appears mid-session. "taken" and "outdated" are not degrees of this:
          they end the session, and App raises a dialog for each. */}
      {stale && stale !== "taken" && stale !== "outdated" && (
        <p className="tb-stale" role="alert">
          <b>{stale === "offline" ? "NOT SYNCED" : "NOT SAVING"}</b>
          {stale === "offline"
            ? " — your game is safe on this device but has not reached your account yet. It will retry."
            : stale === "full"
              ? " — this browser's storage is full. Sell some spares, or export from You."
              : " — this browser is blocking storage. Export from You to keep this game."}
        </p>
      )}
    </header>
  );
}
