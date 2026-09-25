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
import { themeChoice, setTheme } from "./theme.js";

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

/* THE CORNER HELD THREE BUTTONS AND FITS ONE.

   Settings, log out and - once there was somewhere to put it - how to play,
   all as separate keys in the top right. On a phone that row wrapped and the
   gear ended up underneath LOG OUT, which is the bug this was reported as; on
   a desktop it merely crowded the figures it sits beside. None of the three is
   something you press while playing, which is the whole argument: they are the
   menu, and the menu is one button.

   ONE MENU AT EVERY WIDTH rather than a burger below some breakpoint. The
   alternative was rendering the controls twice and letting CSS choose, and
   this file already carries the note about why there is exactly one `Daily`
   card - two copies of a thing drift, and the second one is always the one
   nobody updates.

   THE QUEST STAYS OUT OF IT. That is a thing you check and claim during play,
   and it carries a dot when it is ready; buried behind a burger it would be
   the YOU tab again, which is where it was when nobody could find it. */
/* DRAWN HERE RATHER THAN FETCHED. A handful of 16px glyphs is smaller as markup than
   as a request, they take `currentColor` so the hover state costs nothing, and
   they stay sharp at any zoom - which `public/icons` cannot, being pixel masks
   sized for the tab rail. Stroked rather than filled, because at 16px a filled
   glyph next to 13px body text reads as a bullet. */
const ICON = {
  help: "M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.7M12 17.5v.01",
  star: "M12 3.5l2.4 5.2 5.6.7-4.1 3.9 1.1 5.6-5-2.8-5 2.8 1.1-5.6L4 9.4l5.6-.7z",
  cog: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M19.4 15a1.6 1.6 0 0 0 "
    + ".3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 "
    + "0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 "
    + "3.5 14H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.3 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l"
    + ".1.1A1.6 1.6 0 0 0 10 3.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 "
    + "2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.8H21a2 2 0 1 1 0 4h-.2a1.6 1.6 "
    + "0 0 0-1.4 1",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  reset: "M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  moon: "M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z",
};
// Night mode cycles: follow the system, always on, always off.
const THEME_NEXT = { auto: "dark", dark: "light", light: "auto" };
const THEME_SAYS = { auto: "AUTO", dark: "ON", light: "OFF" };

function Glyph({ of }) {
  return (
    <svg className="tb-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICON[of]} />
    </svg>
  );
}

function Menu({ onSettings, onHelp, onForms, onEvents, onNews, unread, onLogOut, onReset }) {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState(themeChoice);
  const box = useRef(null);

  // Click away and Escape, the same as `Missions` - this sits over a game that
  // reads the keyboard, and a panel you cannot dismiss is one people leave up.
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

  // Every item closes the menu first, so the dialog it opens is not underneath
  // a popover that is still listening for the click that dismisses it.
  const run = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className={`tb-menu${open ? " open" : ""}`} ref={box}>
      <button
        type="button"
        className="tb-burger"
        aria-expanded={open}
        aria-label={open ? "Close the menu" : "Menu"}
        data-tip="Settings, help, log out"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? "\u2715" : "\u2630"}</span>
        {/* One dot for something unread, on the one button that leads to it. */}
        {unread && !open && <i className="tb-dot" aria-label="New update" />}
      </button>

      {open && (
        <div className="tb-pop" role="menu">
          {/* LIVE FIRST, then news, then reference - what is happening today
              is the thing a player opens this menu most often to find. */}
          <button type="button" role="menuitem" onClick={run(onEvents)}>
            <Glyph of="bolt" />Events
          </button>
          <button type="button" role="menuitem" onClick={run(onNews)}>
            <Glyph of="bell" />What&rsquo;s new{unread && <i className="tb-dot" aria-label="unread" />}
          </button>
          <button type="button" role="menuitem" onClick={run(onHelp)}>
            <Glyph of="help" />How to play
          </button>
          {/* DIRECTLY UNDER HOW TO PLAY, because it is the same kind of thing:
              reference you go and look at rather than anything you act on. It
              is also the only place in the game that says what the rare forms
              ARE, so burying it below the destructive items would be hiding
              the explanation for half of what there is to do here. */}
          <button type="button" role="menuitem" onClick={run(onForms)}>
            <Glyph of="star" />Rare forms
          </button>
          {/* A SWITCH, SO IT DOES NOT CLOSE THE MENU: the page changes under
              it and you see the answer before choosing again. */}
          <button type="button" role="menuitem" className="tb-theme"
            aria-label={`Night mode: ${THEME_SAYS[theme].toLowerCase()}`}
            onClick={() => { const next = THEME_NEXT[theme]; setTheme(next); setThemeState(next); }}>
            <Glyph of="moon" />Night mode<em>{THEME_SAYS[theme]}</em>
          </button>
          {onSettings && (
            <button type="button" role="menuitem" onClick={run(onSettings)}>
              <Glyph of="cog" />Settings
            </button>
          )}
          {/* One or the other, never both - see App. Reset only survives in
              local mode, where there is no account to leave. */}
          {onLogOut
            ? (
              <button type="button" role="menuitem" className="tb-danger" onClick={run(onLogOut)}>
                <Glyph of="out" />Log out
              </button>
            ) : (
              <button type="button" role="menuitem" className="tb-danger" onClick={run(onReset)}>
                <Glyph of="reset" />Reset this save
              </button>
            )}
        </div>
      )}
    </div>
  );
}

export default function TopBar({
  caught, total, steps, money, candy = 0, deltas = [], parcel = null, xp, onReset,
  onLogOut = null, onSettings = null, onHelp = null, onForms = null,
  onEvents = null, onNews = null, unread = false,
  trainerName = null,
  stale = null,
  daily, onClaimDaily, claimNote,
}) {
  const { level, into, need, frac } = levelProgress(xp);

  return (
    <div className="topbar">
      {/* YOUR NAME, NOT THE GAME'S. The bar carried "Dexora" with the trainer
          name in a small chip beside it, which is the wrong way round: the
          title is the same on every screen for every player and is already on
          the tab, the login card and the loading screen, while the name is the
          one thing here that says whose game this is. Local mode has no
          account and therefore no name, so it keeps the title. */}
      <div className="tb-brand">
        <span className="title">{trainerName ?? "Dexora"}</span>
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

        <span className="tb-stat tb-extra">
          <i>CAUGHT</i>
          <b>{total.toLocaleString()}</b>
        </span>

        {/* Walking pays, and it says so here rather than in a banner. The
            same floating shape the money counter uses, on the counter the
            reward is actually measured in. */}
        <span className={`tb-stat tb-extra steps${parcel ? " bump" : ""}`}>
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
      {/* "taken" is deliberately absent here: it is not a degree of this, it
          is the end of the session, and App raises a dialog for it. Left to
          fall through the ternary below it would have claimed the browser was
          blocking storage, which is a different problem with a different and
          useless remedy. "outdated" is the same: App's dialog, not a banner. */}
      {stale && stale !== "taken" && stale !== "outdated" && (
        <p className="tb-stale" role="alert">
          <b>{stale === "offline" ? "NOT SYNCED" : "NOT SAVING"}</b>
          {stale === "offline"
            ? " — your game is safe on this device but has not reached your account yet. It will retry."
            : stale === "full"
              ? " — this browser's storage is full. Sell some spares, or export from the YOU tab."
              : " — this browser is blocking storage. Export from the YOU tab to keep this game."}
        </p>
      )}

      <Menu
        onSettings={onSettings}
        onHelp={onHelp}
        onForms={onForms}
        onEvents={onEvents}
        onNews={onNews}
        unread={unread}
        onLogOut={onLogOut}
        onReset={onReset}
      />
    </div>
  );
}
