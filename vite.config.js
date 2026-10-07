import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

/* THE ATLAS PRELOADS CARRY ITS STAMP (mapdata's ATLAS_REV, the url tileset.js
   fetches): unstamped, a preload is a second download of a file the host
   caches a day, and the stale copy drew every map's tiles wrong. */
const atlasRev = () => readFileSync("src/game/mapdata.js", "utf8").match(/ATLAS_REV = "(\w+)"/)[1];
const stampAtlas = {
  name: "stamp-atlas",
  transformIndexHtml: (html) => html.replace(/tilesets\/(route(?:_top)?\.(?:png|json))"/g, `tilesets/$1?v=${atlasRev()}"`),
};

export default defineConfig({
  plugins: [react(), stampAtlas],
  base: "./", // ponytail: relative base so `vite build` output opens from any path

  /* A SAVE LIVES ON AN ORIGIN, AND A PORT IS PART OF ONE. Vite's default is to
     pick the next free port when 5173 is busy - so a second `npm run dev` with
     a stale one still running serves the whole game from 5174, where there is
     no localStorage and therefore no save. The dex looks deleted and nothing is
     wrong. `strictPort` makes that collision an error you can read instead of a
     fresh game you cannot explain. */
  server: { port: 5173, strictPort: true },
});
