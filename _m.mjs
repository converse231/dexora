import { BIOMES, encounterTable, LEGENDARY, LEGEND_EACH, LEGEND_CEIL } from "./src/game/biomes.js";
const rows = encounterTable(BIOMES[0], 50);
let tot = 0, leg = 0;
for (const [id, w] of rows) { tot += w; if (LEGENDARY.includes(id)) leg += w; }
console.log(`today: ${LEGENDARY.length} legendaries, total share ${((leg/tot)*100).toFixed(2)}%, one named = 1 in ${Math.round(1/((leg/tot)/LEGENDARY.length)).toLocaleString()}`);
for (const n of [34, 60, 90, 120]) {
  const share = Math.min(LEGEND_CEIL, LEGEND_EACH * n);
  console.log(`  at ${String(n).padStart(3)} legendaries: total ${(share*100).toFixed(2)}%, one named = 1 in ${Math.round(1/(share/n)).toLocaleString()}`);
}
