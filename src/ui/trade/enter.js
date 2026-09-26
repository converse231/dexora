/* A POKEMON ENTERS TRADING HERE - the one path, shared by Surprise Trade, an
   offer and the shelf (docs/trading.md). The server checks every claim against
   the save it already holds, so: let the engine's local write land, upload it,
   register whatever has no server id yet, and tell the engine which entry got
   which. Answers {ok, mids: {uid: mid}} or {ok: false, error}. */
import { flushNow } from "../../game/store.js";
import { snapshot } from "../../game/trade.js";
import { push, registerMons } from "../../net/cloud.js";

export async function enterTrading(engine, mons) {
  await new Promise((r) => setTimeout(r, 500));     // the engine's 400ms local write
  await flushNow(push);                             // ...and the server's copy of it
  const mids = Object.fromEntries(mons.filter((m) => m.mid).map((m) => [m.uid, m.mid]));
  const fresh = mons.filter((m) => !m.mid);
  if (fresh.length) {
    const reg = await registerMons(fresh.map(snapshot));
    if (!reg.ok) return reg;
    for (const r of reg.data ?? []) mids[r.uid] = r.mid;
    engine.reconcileTrades({
      assign: Object.fromEntries(fresh.filter((m) => mids[m.uid]).map((m) => [m.uid, mids[m.uid]])),
    });
  }
  if (mons.some((m) => !mids[m.uid])) {
    return { ok: false, error: "Your save is still uploading - try again in a moment." };
  }
  return { ok: true, mids };
}
