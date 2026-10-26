/* TITLES, AS BADGES where one is drawn (art/titles, built by `npm run ranks`):
   a medal with its name in the tooltip; a card set's title is the set's logo,
   a Master's with a gold tag under it; a text pill for anything else. One
   component for You and every trainer card. A drawn medal opens full size
   (asked for, 2026-10-26), its name and how it was won under it. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { titleBadge, titleFull, titleName, titleLogo, shownTitles, titleTier, regionTiers } from "../game/titles.js";
import { useModalLock, useDismiss } from "./modal.js";
import { EVENTS } from "../data/eventforms.js";

const asset = (path) => new URL(path, document.baseURI).href;

// How a title is won, under its picture.
const HOW = { dex: () => "Every species of the region in the Pokédex", tier: () => "Every species of the region in one rare form",
  event: (id) => {
    const ev = EVENTS.find((e) => e.id === id);
    return ev ? `Every ${ev.name} Pokémon caught${ev.hunt ? `, ${ev.hunt.title.split(" ").pop()} included` : ""}` : "";
  } };

function Zoom({ t, label, onClose }) {
  useModalLock();
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);
  return createPortal(
    <div className="sheet tb-zoom" {...useDismiss(onClose)}>
      <figure className="confirm tb-zoom-card" role="dialog" aria-modal="true" aria-label={label}>
        <button type="button" className="cd-x" onClick={onClose} aria-label="Close">✕</button>
        <img src={asset(titleFull(t))} alt="" />
        <figcaption><b>{label}</b><span>{HOW[t.split(":")[0]]?.(t.split(":")[1])}</span></figcaption>
      </figure>
    </div>,
    document.body,
  );
}

// A medal whose art is not built yet (a new event's) falls back to its pill, never an empty img.
function Medal({ t, src, label = titleName(t), children, className = "title-badge" }) {
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState(false);
  if (gone) return <i>{titleName(t)}</i>;
  return (
    <>
      <button type="button" className={`tb-open ${className}`} data-tip={label} aria-label={`${label} - view`} onClick={() => setOpen(true)}>
        <img src={src} alt={label} loading="lazy" onError={() => setGone(true)} />
        {children}
      </button>
      {open && <Zoom t={t} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function TitleBadges({ titles }) {
  if (!titles?.length) return null;
  return (
    <span className="you-titles">
      {shownTitles(titles).map((t) => {
        const b = titleBadge(t);
        const logo = titleLogo(t);
        const tier = titleTier(t);
        if (tier) {
          // Its region's badge, the tier's mark at its foot; the tooltip names every tier done there.
          const all = regionTiers(titles, t.split(":")[2]).map(titleName).join(" · ");
          return (
            <Medal key={t} t={t} src={asset(b)} label={all} className={`title-tier t-${tier}`}>
              <img className="title-mark" src={asset(`marks/${tier}.png`)} alt="" loading="lazy" />
            </Medal>
          );
        }
        if (b) return <Medal key={t} t={t} src={asset(b)} />;
        if (logo) {
          return (
            <span key={t} className={`title-set${t.startsWith("master:") ? " master" : ""}`} data-tip={titleName(t)}>
              <img src={asset(logo)} alt={titleName(t)} loading="lazy" />
              {t.startsWith("master:") && <b aria-hidden="true">MASTER</b>}
            </span>
          );
        }
        return <i key={t}>{titleName(t)}</i>;
      })}
    </span>
  );
}
