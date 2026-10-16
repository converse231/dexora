/* THE ROTOM ICON SET: 2px strokes on a 24 grid, drawn as markup so they take
   `currentColor` (a selected tab and an idle one need no second file) and stay
   sharp at any zoom. Game art - sprites, items, badges - stays pixel art; these
   are only the interface's own glyphs. */
const P = {
  ball: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h6M15 12h6M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  swap: "M4 8h14l-4-4M20 16H6l4 4",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M10 17h4",
  you: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  dex: "M5 3h11l3 3v15H5zM9 8h6M9 12h6M9 16h4",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  shop: "M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15",
  events: "M13 2L4 14h7l-1 8 9-12h-7z",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01",
  forms: "M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z",
  out: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  reset: "M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5",
  news: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5",
  star: "M12 2l2.6 6.3L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.4-.7z",
  card: "M3 6h18v12H3zM7 10h4M7 14h7M15 10h2",
  cards: "M9 3h11v15H9zM5 6v15h11",
  flag: "M5 21V4h11l-2 4 2 4H5",
  chev: "M9 6l6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  yen: "M6 4l6 8 6-8M12 12v8M8 13h8M8 16h8",
  // The side columns of Trade, Battles and Cards (2026-10-06).
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6 6 0 0 1 4 5.5",
  gift: "M3 8h18v5H3zM5 13h14v8H5zM12 8v13M12 8C10 4 6.5 4 6.5 6.5S10 8 12 8zM12 8c2-4 5.5-4 5.5-1.5S14 8 12 8z",
  board: "M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 11h6M9 15h4",
  train: "M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11",
  book: "M12 6.5C10 5 7 4.5 4 5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v14",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  flame: "M12 3c.5 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.8 1.6-4.4 2.6-6 .4 1.9 1.4 3 2.4 3 .3-2.6 0-5.2.5-8z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  shirt: "M9 3L3 6l2 4 3-1v12h8V9l3 1 2-4-6-3a3 3 0 0 1-6 0z",
  steps: "M13 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM6 20l3-6 3 2v5M9 14l1-5 4 2 3-1M10 9l-3 2",
};

/* PLACES (the world map, 2026-10-17): what kind of place a map is, drawn in
   its main type's colour on the Map tab - Travel.jsx's `KIND`. Plus the
   ferry, a lock for a place not open yet. */
Object.assign(P, {
  town: "M3 21V11l5-4 5 4v10M13 21V7l4-3 4 3v14M2 21h20M6 15h4M16 10h2M16 14h2",
  grass: "M3 20c1-4 2-6 3-8 1 2 2 4 3 8M9 20c1-6 2-9 3-12 1 3 2 6 3 12M15 20c1-4 2-6 3-8 1 2 2 4 3 8",
  forest: "M12 2l6 9h-3.5l4.5 7H5l4.5-7H6zM12 18v4",
  coast: "M2 10c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-1.5 5 0M2 16c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-1.5 5 0",
  cave: "M2 20L9 7l3 4 2-3 8 12zM9 20v-3a3 3 0 0 1 6 0v3",
  mountain: "M2 20l7-11h6l7 11zM9 9L7.5 5M15 9l1.5-4M12 9V3",
  ice: "M12 2v20M3.4 7l17.2 10M3.4 17L20.6 7M9 3.5l3 2 3-2M9 20.5l3-2 3 2",
  desert: "M12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 18v2M3 11h2M19 11h2M5.6 4.6L7 6M17 16l1.4 1.4M5.6 17.4L7 16M17 6l1.4-1.4M2 22h20",
  building: "M3 21V9l6-3v15M9 21V4l12 5v12M2 21h20M13 12h4M13 16h4",
  tower: "M8 21V8l4-5 4 5v13M6 21h12M10 11h4M10 15h4",
  ruins: "M3 21h18M5 21V9M9.5 21V9M14.5 21V9M19 21v-9M3 9h13l-2-4H5z",
  safari: "M7 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 14l2-8h3l1 6M20 14l-2-8h-3l-1 6M10 15h4",
  lock: "M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  boat: "M2 15h20l-3.5 5h-13zM5 15v-5h14v5M12 10V4l5 6",
  weather: "M7 19h9a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.4 1.5A3.3 3.3 0 0 0 7 19zM17 2v2M21.5 6.5H20M20.2 3.3l-1.2 1.2",
});
// The raw path, for a glyph drawn inside another SVG (the world map).
export const glyph = (n) => P[n];

export default function Icon({ n, size = 20, className = "" }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={P[n]} />
    </svg>
  );
}
