/* TITLES, AS BADGES where one is drawn (art/titles, built by `npm run ranks`):
   a medal with its name in the tooltip; a card set's title is the set's logo,
   a Master's with a gold tag under it; a text pill for anything else. One
   component for You and every trainer card. */
import { titleBadge, titleName, titleLogo, shownTitles } from "../game/titles.js";

const asset = (path) => new URL(path, document.baseURI).href;

export default function TitleBadges({ titles }) {
  if (!titles?.length) return null;
  return (
    <span className="you-titles">
      {shownTitles(titles).map((t) => {
        const b = titleBadge(t);
        const logo = titleLogo(t);
        if (b) return <img key={t} className="title-badge" src={asset(b)} alt={titleName(t)} data-tip={titleName(t)} loading="lazy" />;
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
