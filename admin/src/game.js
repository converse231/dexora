/* THE GAME'S OWN WORDS, loaded once and lazily (docs/admin.md): level from
   xp, tier names, the League's ids, the ranks, the events, report reasons.
   The species table rides along (~350KB), so the sign-in screen does not wait
   for it. Never `map.js` - it pulls the 900KB of map rows for one `label`. */
import { useEffect, useState } from "react";

let loading = null;
export function loadGame() {
  loading ??= Promise.all([
    import("../../src/game/biomes.js"),
    import("../../src/game/ranked.js"),
    import("../../src/data/gymtune.js"),
    import("../../src/data/eventforms.js"),
    import("../../src/data/dex.js"),
    import("../../src/game/trade.js"),
  ]).then(([biomes, ranked, tune, events, dex, trade]) => ({
    levelFromXp: biomes.levelFromXp,
    TIERS: biomes.TIERS,
    tierName: biomes.tierName,
    BIOMES: biomes.BIOMES,
    dexIndex: biomes.dexIndex,
    RANKS: ranked.RANKS,
    rankOf: ranked.rankOf,
    GYMTUNE: tune.GYMTUNE,
    EVENTS: events.EVENTS,
    DEX_TOTAL: dex.DEX_TOTAL,
    REPORT_REASONS: trade.REPORT_REASONS,
  }));
  return loading;
}

export function useGame() {
  const [game, setGame] = useState(null);
  useEffect(() => { let live = true; loadGame().then((g) => live && setGame(g)); return () => { live = false; }; }, []);
  return game;
}

// A League id the way a person reads it: "kanto-lt-surge" -> "Lt Surge".
export const leagueName = (id) => id.split(":")[0].split("-").slice(1)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
