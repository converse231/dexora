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
  flag: "M5 21V4h11l-2 4 2 4H5",
  chev: "M9 6l6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  yen: "M6 4l6 8 6-8M12 12v8M8 13h8M8 16h8",
  steps: "M13 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM6 20l3-6 3 2v5M9 14l1-5 4 2 3-1M10 9l-3 2",
};

export default function Icon({ n, size = 20, className = "" }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={P[n]} />
    </svg>
  );
}
