/* TITLES, AS BADGES where one is drawn (art/titles, built by `npm run ranks`):
   a medal with its name in the tooltip; a card set's title is the set's logo,
   a Master's with a gold tag under it; a text pill for anything else. One
   component for You and every trainer card. */
import { useState } from "react";
import { titleBadge, titleName, titleLogo, shownTitles, titleTier, regionTiers } from "../game/titles.js";

const asset = (path) => new URL(path, document.baseURI).href;

// A medal whose art is not built yet (a new event's) falls back to its pill, never an empty img.
function Medal({ t, src }) {
  const [gone, setGone] = useState(false);
  return gone ? <i>{titleName(t)}</i>
    : <img className="title-badge" src={src} alt={titleName(t)} data-tip={titleName(t)} loading="lazy" onError={() => setGone(true)} />;
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
            <span key={t} className={`title-tier t-${tier}`} data-tip={all}>
              <img src={asset(b)} alt={all} loading="lazy" />
              <img className="title-mark" src={asset(`marks/${tier}.png`)} alt="" loading="lazy" />
            </span>
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
