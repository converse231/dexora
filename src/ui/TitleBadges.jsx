/* TITLES, AS BADGES where one is drawn (art/titles, built by `npm run ranks`):
   a medal with its name in the tooltip, and a text pill for a title with no
   art yet. One component for You and every trainer card. */
import { titleBadge, titleName } from "../game/titles.js";

const asset = (path) => new URL(path, document.baseURI).href;

export default function TitleBadges({ titles }) {
  if (!titles?.length) return null;
  return (
    <span className="you-titles">
      {titles.map((t) => {
        const b = titleBadge(t);
        return b
          ? <img key={t} className="title-badge" src={asset(b)} alt={titleName(t)} data-tip={titleName(t)} loading="lazy" />
          : <i key={t}>{titleName(t)}</i>;
      })}
    </span>
  );
}
