/* THE WARDROBE (docs/cosmetics.md): how you look on the map, and who walks
   behind you. Off You, a dialog like Rare forms. A skin is bought once and
   worn whenever; it changes the overworld sprite and nothing else. The
   follower is chosen from a Pokemon's Box preview - here it can only be
   seen and sent back to its ball. */
import { useEffect, useState } from "react";
import Confirm from "./Confirm.jsx";
import Sprite, { TrainerArt } from "./Sprite.jsx";
import { variantOf } from "../game/items.js";
import { useDismiss, useModalLock } from "./modal.js";
import { SKINS, SKIN_TIERS } from "../game/cosmetics.js";
import { speciesById } from "../game/biomes.js";
import { label } from "../game/map.js";

const asset = (path) => new URL(path, document.baseURI).href;

export default function Wardrobe({ engine, state, onClose }) {
  useModalLock();
  const [pending, setPending] = useState(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !pending) { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const money = state.money ?? 0;
  const owned = new Set(state.skins);
  const worn = owned.has(state.skin) ? state.skin : null;
  const buddy = state.buddy == null ? null : state.box.find((m) => m.uid === state.buddy);
  const buy = (s, price) => setPending({
    title: `Buy ${s.name}?`,
    lines: [["Cost", `¥${price.toLocaleString()}`], ["Money left", `¥${(money - price).toLocaleString()}`]],
    confirmLabel: `BUY · ¥${price.toLocaleString()}`,
    run: () => engine.buySkin(s.id),
  });

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="varcard wardrobe" role="dialog" aria-modal="true" aria-label="Wardrobe"
        onClick={(e) => e.stopPropagation()}>
        <div className="set-top">
          <h3>Wardrobe</h3>
          <span className="set-mail">How you look on the map · ¥{money.toLocaleString()}</span>
          <button type="button" className="set-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="vr-body">
          <div className="wd-buddy">
            {buddy ? (
              <>
                <Sprite id={buddy.species} variant={variantOf(buddy)} alt="" />
                <span><b>{label(speciesById(buddy.species))}</b> walks with you</span>
                <button type="button" onClick={() => engine.setBuddy(null)}>Back to its ball</button>
              </>
            ) : (
              <span>No one walks with you. Open a Pokémon's preview in the Box and choose <b>Walk with me</b>.</span>
            )}
          </div>

          <h4>Your trainer</h4>
          <div className="wd-grid">
            <button type="button" className={`wd-skin${worn ? "" : " on"}`} aria-pressed={!worn}
              onClick={() => engine.wearSkin(null)}>
              <TrainerArt char={state.char ?? "red"} />
              <b>{state.char === "leaf" ? "Leaf" : "Red"}</b>
              <small>{worn ? "Wear" : "Wearing"}</small>
            </button>
          </div>

          {SKIN_TIERS.map(([tier, name, price]) => (
            <section key={tier}>
              <h4>{name} · ¥{price.toLocaleString()}</h4>
              <div className="wd-grid">
                {SKINS.filter((s) => s.tier === tier).map((s) => {
                  const have = owned.has(s.id);
                  const poor = !have && money < price;
                  return (
                    <button key={s.id} type="button" className={`wd-skin${worn === s.id ? " on" : ""}`}
                      aria-pressed={worn === s.id} disabled={poor}
                      data-tip={poor ? `¥${(price - money).toLocaleString()} short` : undefined}
                      onClick={() => (have ? engine.wearSkin(s.id) : buy(s, price))}>
                      <i className="wd-art" style={{ "--skin": `url(${asset(`skins/${s.id}.png`)})` }} aria-hidden="true" />
                      <b>{s.name}</b>
                      <small>{worn === s.id ? "Wearing" : have ? "Wear" : `¥${price.toLocaleString()}`}</small>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
      {pending && (
        <Confirm title={pending.title} lines={pending.lines} confirmLabel={pending.confirmLabel} tone="buy"
          onConfirm={() => { pending.run(); setPending(null); }} onCancel={() => setPending(null)} />
      )}
    </div>
  );
}
