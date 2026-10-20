import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

/* THE ATLAS PRELOADS CARRY ITS STAMP (mapdata's ATLAS_REV, the url tileset.js
   fetches): unstamped, a preload is a second download of a file the host
   caches a day, and the stale copy drew every map's tiles wrong. */
const atlasRev = () => readFileSync("src/game/mapdata.js", "utf8").match(/ATLAS_REV = "(\w+)"/)[1];
const stampAtlas = {
  name: "stamp-atlas",
  transformIndexHtml: (html) => html.replace(/tilesets\/(route(?:_top)?\.(?:png|json))"/g, `tilesets/$1?v=${atlasRev()}"`),
};

/* THE ART'S STAMP (2026-10-20, the free tier's CDN requests at 93%):
   sprites and cards are kept a MONTH by the browser (vercel.json), so their
   urls carry this - a hash of every file's path and SIZE under them, never
   its date (a fresh checkout dates every file anew, and each deploy would
   have refetched everything). New or redrawn art changes it, and every url
   with it. */
const artRev = () => {
  const h = createHash("sha1");
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else h.update(`${p}:${statSync(p).size};`);
    }
  };
  walk("public/sprites");
  walk("public/cards");
  return h.digest("hex").slice(0, 10);
};

export default defineConfig({
  plugins: [react(), stampAtlas],
  define: { __ART_REV__: JSON.stringify(artRev()) },
  base: "./", // ponytail: relative base so `vite build` output opens from any path

  /* A SAVE LIVES ON AN ORIGIN, AND A PORT IS PART OF ONE. Vite's default is to
     pick the next free port when 5173 is busy - so a second `npm run dev` with
     a stale one still running serves the whole game from 5174, where there is
     no localStorage and therefore no save. The dex looks deleted and nothing is
     wrong. `strictPort` makes that collision an error you can read instead of a
     fresh game you cannot explain. */
  server: { port: 5173, strictPort: true },
});
