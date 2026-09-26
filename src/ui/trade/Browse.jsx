/* A FRIEND'S POKEMON (docs/trading.md, phase 6): their Pokedex beside yours,
   and their spares - every box entry but the last of a species - to pick
   from and make an offer for. Friends only; the server answers null for
   anybody else, and reads it all off their STORED save.

   "Caught, not in yours" is the explore half: the species they have that you
   don't, each a tap that narrows their spares to it. */
import { useEffect, useMemo, useState } from "react";
import { SPECIES } from "../../data/dex.js";
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS } from "../../game/trade.js";
import { friendBox } from "../../net/cloud.js";
import Sprite from "../Sprite.jsx";
import Picker, { keepLast } from "./Picker.jsx";
import { caughtIds } from "./Offers.jsx";

const SHOW = 48;   // species in the "not in yours" strip before "show all"

export default function Browse({ them, dexOf, query = "", onOffer }) {
  const [data, setData] = useState(null);
  const [fail, setFail] = useState(null);
  const [want, setWant] = useState([]);
  const [q, setQ] = useState(query);
  const [all, setAll] = useState(false);

  useEffect(() => {
    friendBox(them.user_id).then((got) => {
      if (got.ok && got.data) setData(got.data);
      else setFail(got.ok ? `You and ${them.username} are not friends.` : got.error);
    });
  }, [them.user_id, them.username]);

  const theirs = useMemo(() => caughtIds(data?.dex), [data]);
  const mine = useMemo(() => new Set(SPECIES.filter((sp) => dexOf(sp.id) === 2).map((sp) => sp.id)), [dexOf]);
  const gap = useMemo(() => [...theirs].filter((id) => !mine.has(id)), [theirs, mine]);
  const spares = data?.box ?? [];
  const spareSpecies = useMemo(() => new Set(spares.map((m) => m.species)), [spares]);
  const limit = useMemo(() => keepLast(spares), [spares]);

  if (fail) return <p className="tc-err" role="alert">{fail}</p>;
  if (!data) return <p className="ev-quiet">Loading {them.username}&rsquo;s Pokémon…</p>;
  const picked = spares.filter((m) => want.includes(`u${m.uid}`));
  return (
    <div className="tc-edit">
      <section className="ev-card">
        <header className="ev-banner"><h4>{them.username}&rsquo;s Pokédex</h4></header>
        <div className="bw-dex">
          <span><b>{theirs.size}</b>caught</span>
          <span><b>{mine.size}</b>yours</span>
          <span className={gap.length ? "gap" : ""}><b>{gap.length}</b>you don&rsquo;t have</span>
        </div>
        {gap.length > 0 && (
          <>
            <p className="ev-quiet">Caught by {them.username}, not by you. Tap one to see if they have a spare.</p>
            <div className="bw-gap">
              {(all ? gap : gap.slice(0, SHOW)).map((id) => {
                const sp = speciesById(id);
                const spare = spareSpecies.has(id);
                return (
                  <button key={id} type="button" className={`bw-sp${spare ? " spare" : ""}`}
                    onClick={() => setQ(label(sp))} aria-label={`${label(sp)}${spare ? ", has a spare" : ""}`}
                    data-tip={spare ? `${label(sp)} - they have a spare` : label(sp)}>
                    <Sprite id={id} alt="" />
                  </button>
                );
              })}
            </div>
            {gap.length > SHOW && !all && (
              <button type="button" className="tp-quiet" onClick={() => setAll(true)}>Show all {gap.length}</button>
            )}
          </>
        )}
      </section>
      <section className="ev-card">
        <header className="ev-banner"><h4>Their spares</h4><span className="tp-count">{want.length}/{LIMITS.MAX_SIDE}</span></header>
        <p className="ev-quiet">Anything they have more than one of. Pick what you&rsquo;d like, then make an offer.</p>
        {/* Keyed on the search so a tap in the strip above restarts the picker on it. */}
        <Picker key={q} query={q} mons={spares} picked={want} max={LIMITS.MAX_SIDE} onChange={setWant}
          keyFn={(m) => `u${m.uid}`} limit={limit} missing={{ label: "Not in my Pokédex", test: (sp) => dexOf(sp) !== 2 }}
          empty={`${them.username} has nothing spare yet.`} />
      </section>
      <div className="tp-actions tc-dock">
        <button type="button" className="ev-go" disabled={!want.length} onClick={() => onOffer(picked)}>
          {want.length ? `Make an offer for ${want.length}` : "Pick what you'd like"}
        </button>
      </div>
    </div>
  );
}
