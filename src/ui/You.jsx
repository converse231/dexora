/* YOU: the fourth tab (Rotom, 2026-10-01). Everything the ☰ menu held, plus
   the rail's old YOU pane: your card, your points, your save, the guides and
   the settings. A page like the Trade Center and the League - it covers the
   game and takes the modal lock, so the arrow keys do not walk under it - and
   it has no Back of its own: the tabs are how you leave. The guides and
   Settings stay the dialogs they were; this is where they are reached from. */
import { useState } from "react";
import Icon from "./Icon.jsx";
import Trainer from "./Trainer.jsx";
import { RankMedal } from "./RankBadge.jsx";
import { useModalLock } from "./modal.js";
import { levelProgress } from "../game/biomes.js";
import { dexRank } from "../game/medals.js";
import { freePoints } from "../game/trainer.js";
import { themeChoice, setTheme, THEMES } from "./theme.js";
import { titleName } from "../game/titles.js";

const THEME_NAME = { auto: "Auto", dark: "Night", light: "Day" };

export default function You({
  trainerName, caught, xp, stats, bag, save, account, unread, titles = [],
  onProfile, onNews, onHelp, onForms, onSettings, onLogOut, onReset, onSpend,
}) {
  useModalLock();
  const [theme, setThemeState] = useState(themeChoice);
  const { level, into, need, frac } = levelProgress(xp);
  const r = dexRank(caught);
  const free = freePoints(stats, level);

  const items = [
    onProfile && ["card", "Your trainer card", "What other trainers see", onProfile],
    ["news", "What's new", unread ? "New since you last looked" : "Updates to the game", onNews, unread],
    ["help", "How to play", "Keys, touch, and how it all works", onHelp],
    ["forms", "Rare forms", "The twelve kinds, and their odds", onForms],
    onSettings && ["gear", "Settings", "Name, trainer, birthday, password", onSettings],
  ].filter(Boolean);

  return (
    <div className="tc-page you-page" role="dialog" aria-modal="true" aria-label="You">
      <main className="you-main">
        <section className="you-hero">
          <span className="you-medal"><RankMedal set="dex" id={r.id} color={r.color} /></span>
          <div className="you-who">
            <h2>{trainerName ?? "Trainer"}</h2>
            <span>LV {level} · {r.name}{r.next ? ` · ${r.left} more to ${r.next.name}` : ""}</span>
            <span className="xpbar" aria-hidden="true"><i style={{ width: `${Math.round(frac * 100)}%` }} /></span>
            <small>{need ? `${into.toLocaleString()} / ${need.toLocaleString()} XP to Lv ${level + 1}` : "Max level"}</small>
            {/* TITLES, earned: a completed set or master set, a generation's Pokédex. */}
            {titles.length > 0 && (
              <span className="you-titles">{titles.map((t) => <i key={t}>{titleName(t)}</i>)}</span>
            )}
          </div>
          {/* A button, not a #link: the hash is the app's route (App's hashchange). */}
          {free > 0 && (
            <button type="button" className="you-points"
              onClick={() => document.getElementById("you-trainer")?.scrollIntoView({ behavior: "smooth" })}>
              {free} point{free === 1 ? "" : "s"} to spend
            </button>
          )}
        </section>

        <nav className="you-menu" aria-label="You">
          {items.map(([ic, name, sub, go, dot]) => (
            <button key={name} type="button" onClick={go}>
              <Icon n={ic} size={20} />
              <span><b>{name}</b><small>{sub}</small></span>
              {dot && <i className="tb-dot" aria-label="unread" />}
              <Icon n="chev" size={16} className="you-chev" />
            </button>
          ))}
          <div className="you-row">
            <Icon n="moon" size={20} />
            <span><b>Appearance</b><small>A setting for this device, not your save</small></span>
            <div className="you-seg" role="radiogroup" aria-label="Appearance">
              {THEMES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t}
                  className={theme === t ? "on" : ""} onClick={() => { setTheme(t); setThemeState(t); }}>
                  {THEME_NAME[t]}
                </button>
              ))}
            </div>
          </div>
          {/* One or the other, never both: reset only survives in local mode,
              where there is no account to leave. */}
          <button type="button" className="you-out" onClick={onLogOut ?? onReset}>
            <Icon n={onLogOut ? "out" : "reset"} size={20} />
            <span><b>{onLogOut ? "Log out" : "Reset this save"}</b></span>
          </button>
        </nav>

        <div className="you-trainer" id="you-trainer">
          <Trainer stats={stats} level={level} bag={bag} onSpend={onSpend} save={save} account={account} />
        </div>
      </main>
    </div>
  );
}
