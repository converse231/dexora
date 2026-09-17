/* Where a level actually goes.

   One point per level, five stats, ten ranks each — and only 29 points in a
   whole game against 50 ranks of capacity, so this screen is a series of
   refusals as much as choices. It shows the number each rank is worth right
   now and what the next one buys, because a stat you cannot price is a stat you
   cannot choose between.

   Spending is one click. It used to go through a confirm dialog on the grounds
   that a point cannot be moved once spent, but that put a modal between the
   player and the only reward a level gives, twice a level — and the dialog was
   answering a question the row already answers. The warning it carried now sits
   on the panel once instead of interrupting every click, the button says what
   the next rank buys before you press it, and the row flashes afterwards so a
   spend is never silent. */

import { useEffect, useState } from "react";
import {
  STATS, MAX_RANK, rank, freePoints, earnedPoints, spentPoints,
} from "../game/trainer.js";
import { KEY_ITEMS, holding } from "../game/items.js";
import Confirm from "./Confirm.jsx";
import Note from "./Note.jsx";

/* THE TRAINER QUESTION IS NOT HERE ANY MORE. It was two tiles on this panel,
   which is where a SETTING goes - and it is not one. The handhelds ask it once,
   before you have a save, and asked there it is part of becoming a trainer
   rather than a costume change. It lives in the onboarding gate now; see
   Gate.jsx. One question, one place. */
/* AND THE ACCOUNT BLOCK IS GONE FROM HERE TOO, for the same reason the trainer
   question was: this panel is what a trainer has EARNED, and a name, a password
   and "delete everything" are none of those. They were also at the bottom of a
   column that scrolls, which put an action with no undo one flick below a
   routine one. They live in Settings.jsx now, in a dialog off the top bar. */
export default function Trainer({
  stats, level, bag, onSpend, save, account = null,
}) {
  // Which row just changed, so the click has something to show for itself.
  const [lit, setLit] = useState(null);
  // A file that has been read and checked, waiting on the confirm step.
  const [offer, setOffer] = useState(null);
  const [saveNote, setSaveNote] = useState("");
  // Which recovery is waiting on the confirm step: "backup" or "broken".
  const [recover, setRecover] = useState(null);
  const free = freePoints(stats, level);

  /* WHAT IS STILL RECOVERABLE, READ ONCE. This is the offer that exists only
     when something is behind it: the engine keeps the last save that loaded
     cleanly and the raw text of anything that failed, and neither is worth a
     word on screen when there is nothing there. Read at mount rather than per
     render - both keys are written at load time and cannot change while the
     panel is open, and restoring reloads the page. */
  const [lost] = useState(() => (save ? save.recover() : null));
  const canRestore = lost && (lost.backup || (lost.broken && !lost.broken.unreadable));

  /* Download the save as a file. A Blob and an object URL rather than a data:
     URI - a finished dex is tens of kilobytes of JSON and a data: URI that
     size is refused by some browsers outright. Revoked immediately: the click
     is synchronous, so by the time this line runs the download has started. */
  const exportSave = () => {
    const data = save.read();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `meadow-route-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveNote(`Saved ${a.download}`);
  };

  /* Read a chosen file and check it before anything is replaced. The file
     input is reset afterwards so choosing the same file twice still fires. */
  const offerFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaveNote("");
    try {
      const obj = JSON.parse(await file.text());
      const look = save.inspect(obj);
      if (look.problem) { setSaveNote(look.problem); return; }
      setOffer({ obj, look, name: file.name });
    } catch {
      setSaveNote("That file is not readable JSON.");
    }
  };

  useEffect(() => {
    if (!lit) return;
    const t = setTimeout(() => setLit(null), 700);
    return () => clearTimeout(t);
  }, [lit]);

  // The engine is the authority on whether a point was actually available.
  const spend = (id) => {
    if (onSpend(id)) setLit({ id, at: Date.now() });
  };

  return (
    <div className="panel">
      {/* Loading a file throws away the game that is running, and there is no
          undo for it - so it goes through the same dialog that selling does,
          showing what arrives rather than asking "are you sure" about nothing. */}
      {/* Same dialog as loading a file, for the same reason: it throws away the
          game that is running and there is no undo. */}
      {recover && (
        <Confirm
          title="Restore this save?"
          tone="warn"
          lines={[
            ["From", recover === "backup" ? "Last clean load" : "The save that failed"],
            ["Pokédex", `${lost[recover].caught} caught`],
            ["Box", `${lost[recover].box} held`],
            ["Money", `¥${lost[recover].money.toLocaleString()}`],
          ]}
          confirmLabel="RESTORE"
          onConfirm={() => {
            if (!save.restore(recover)) {
              setRecover(null);
              setSaveNote("That save could not be restored.");
            }
            // On success the page reloads; nothing after this runs.
          }}
          onCancel={() => setRecover(null)}
        />
      )}

      {offer && (
        <Confirm
          title="Load this save?"
          tone="warn"
          lines={[
            ["File", offer.name],
            ["Pokédex", `${offer.look.caught} caught${offer.look.rare ? ` \u00b7 ${offer.look.rare} rare` : ""}`],
            ["Trainer", `Lv ${offer.look.level}`],
            ["Money", `¥${offer.look.money.toLocaleString()}`],
            ["In the box", `${offer.look.box}`],
          ]}
          note="This replaces the game you are playing now. Export it first if you want to keep it."
          confirmLabel="LOAD"
          onCancel={() => setOffer(null)}
          onConfirm={() => {
            const problem = save.write(offer.obj);
            // write() reloads the page on success, so reaching here is a failure.
            setOffer(null);
            setSaveNote(problem ?? "");
          }}
        />
      )}

      <div className="panel-head">
        <span>TRAINER · LV {level}</span>
        <span>{spentPoints(stats)} / {earnedPoints(level)} SPENT</span>
      </div>

      <div className={`tr-points${free > 0 ? " has" : ""}`}>
        {free > 0 ? (
          <>
            <b>{free}</b>
            <span>
              point{free === 1 ? "" : "s"} to spend
              {/* The warning the confirm dialog used to carry, said once. */}
              <i> — a spent point cannot be moved</i>
            </span>
          </>
        ) : (
          <span>No points left — the next level brings one.</span>
        )}
      </div>

      {/* One scroller for the stats and the key items together, so the rail
          cannot grow past the screen the way the shop once did. */}
      <div className="trscroll">
        <div className="trlist">
          {STATS.map((stat) => {
            const r = rank(stats, stat.id);
            const maxed = r >= MAX_RANK;
            const can = !maxed && free > 0;
            return (
              <div
                key={stat.id}
                className={`trrow${maxed ? " maxed" : ""}${lit?.id === stat.id ? " lit" : ""}`}
              >
                <span className="tr-glyph" aria-hidden="true">{stat.glyph}</span>

                <div className="tr-main">
                  <span className="tr-name">
                    {stat.name}
                    <em>{maxed ? "MAX" : `${r}/${MAX_RANK}`}</em>
                  </span>
                  <span className="tr-effect">
                    {r > 0 ? stat.effect(r) : "no effect yet"}
                    {/* What the click buys, right where the click is. This is
                        the job the dialog was doing. */}
                    {can && <b>next → {stat.effect(r + 1)}</b>}
                  </span>
                  <span className="tr-blurb">{stat.blurb}</span>
                </div>

                {/* Ten pips rather than a bar: the number of ranks is small and
                    exact, and you are counting them when you decide. */}
                <span className="tr-pips" aria-label={`Rank ${r} of ${MAX_RANK}`}>
                  {Array.from({ length: MAX_RANK }, (_, i) => (
                    <i key={i} className={i < r ? "on" : ""} />
                  ))}
                </span>

                <button
                  className="tr-add"
                  disabled={!can}
                  onClick={() => spend(stat.id)}
                  data-tip={
                    maxed ? "Already at maximum"
                      : free < 1 ? "No points to spend"
                        : `${stat.name} ${r + 1}: ${stat.effect(r + 1)}`
                  }
                >
                  +1
                </button>
              </div>
            );
          })}
        </div>

        {/* A READOUT OUTLIVES THE SYSTEM THAT WROTE IT, again. "KEPT IN THIS
            BROWSER" and "stored in this browser only" were written when that
            was the whole truth, and they went on saying it after accounts
            arrived - so a signed-in player was told their dex lived somewhere
            it does not, on the one panel whose job is to tell them where it is.

            The panel itself stays, and it is worth being clear why, because
            "is this still needed?" is a fair question. Two of its three jobs
            survive an account intact: EXPORT is a copy the player holds
            themselves, which an account is not - it is the answer to a deleted
            account, a lost password or a service that goes away - and the
            RECOVERY offer below reads `localStorage`, which is where a save
            that failed to parse is stashed, and has nothing to do with the
            server. Only IMPORT-to-move-machines was made redundant, and
            importing is still how a held copy gets back in. */}
        <div className="panel-head tr-head">
          <span>SAVE FILE</span>
          <span>{account ? "SYNCED TO YOUR ACCOUNT" : "KEPT IN THIS BROWSER"}</span>
        </div>

        <div className="trsave">
          <p className="ts-why">
            {account
              ? "Your game syncs to your account, and this browser keeps a copy. Export one you hold yourself - an account is not a backup."
              : "Your game is stored in this browser only. Export a copy to keep it safe, or to carry it to another machine."}
          </p>
          <div className="ts-row">
            <button className="ts-btn" onClick={exportSave} disabled={!save}>
              EXPORT
            </button>
            <label className={`ts-btn ts-file${save ? "" : " off"}`}>
              IMPORT
              <input type="file" accept="application/json,.json"
                     onChange={offerFile} disabled={!save} />
            </label>
          </div>
          <Note>{saveNote}</Note>
        </div>

        {/* THE OFFER ONLY APPEARS WHEN THERE IS SOMETHING BEHIND IT. A save
            that failed to load used to be overwritten by the first step of the
            session that could not read it; both halves are kept now, and this
            is where a player gets one back. An unreadable one is still listed,
            because knowing it survived is what makes exporting it worth doing -
            it just cannot be loaded from here. */}
        {canRestore && (
          <div className="trsave trlost">
            <p className="ts-why">
              An earlier save is still in this browser. Restoring replaces the
              game you are playing now.
            </p>
            <div className="ts-row">
              {lost.backup && (
                <button className="ts-btn" onClick={() => setRecover("backup")}>
                  {`LAST GOOD · ${lost.backup.caught} CAUGHT`}
                </button>
              )}
              {lost.broken && !lost.broken.unreadable && (
                <button className="ts-btn" onClick={() => setRecover("broken")}>
                  {`FAILED SAVE · ${lost.broken.caught} CAUGHT`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="panel-head tr-head">
          <span>KEY ITEMS</span>
          <span>EARNED, NEVER SOLD</span>
        </div>

        <div className="trkeys">
          {KEY_ITEMS.map((key) => {
            const have = holding(bag, key.id);
            return (
              <div key={key.id} className={`trkey${have ? "" : " locked"}`}>
                <img src={`items/${key.id}.png`} alt="" />
                <div className="tk-main">
                  <span className="tk-name">{key.name}</span>
                  <span className="tk-blurb">
                    {have ? key.blurb : `Earned at trainer Lv ${key.level}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
