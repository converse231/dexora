/* THE ONE POKEMON PICKER, used by every trading screen that asks "which?":
   an offer's two sides, a board listing, Surprise Trade, the showcase and the
   shelf, and a friend's box.

   IT GROUPS. A box is mostly duplicates - seven Charmander were seven tiles -
   so one tile stands for every entry of the same species, tier and alpha, with
   a count. A tap takes the next one of the group (`prefer`: the lowest level
   to give away, the highest to show off); the tray above the grid lists each
   one taken, with its level, and a tap there puts it back. On a phone that is
   the whole interaction: tap to add, tap the tray to remove.

   Search is by name or number; filters are the questions a trader asks (rare
   forms, alphas, legendaries, a type, and "not in my Pokedex" or "they don't
   have" when the caller can answer it). Nothing here decides what may be
   traded - the caller passes only what may. */
import { useMemo, useState } from "react";
import { SPECIES } from "../../data/dex.js";
import { speciesById, isLegendary, TIERS } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { variantOf } from "../../game/items.js";
import { keepLast } from "../../game/trade.js";
import Sprite from "../Sprite.jsx";
import Mark from "../Marks.jsx";

export { keepLast };
// A box entry or a server row, as one shape: `tier` is a field on the row.
export const tierOf = (m) => m.tier ?? variantOf(m) ?? null;
export const keyOf = (m) => m.mid ?? `u${m.uid}`;
const groupOf = (m) => `${m.species}:${tierOf(m) ?? ""}:${m.alpha ? 1 : 0}`;
// Every type any species has, once, for the type filter.
const TYPE_LIST = [...new Set(SPECIES.flatMap((sp) => sp.types))].sort();
// Rarest first means TIERS order; an ordinary one sorts after every tier.
const rank = (m) => { const t = tierOf(m); return (t ? TIERS.indexOf(t) : TIERS.length) - (m.alpha ? 0.5 : 0); };

const SORTS = {
  dex: (a, b) => a.species - b.species || rank(a) - rank(b),
  rare: (a, b) => rank(a) - rank(b) || a.species - b.species,
  level: (a, b) => b.top - a.top || a.species - b.species,
  count: (a, b) => b.members.length - a.members.length || a.species - b.species,
};

/* `missing` is {label, test(species)} - "You don't have", "They don't have".
   `limit(species)` caps picks of one species (`keepLast`). */
export default function Picker({
  mons, picked, max, onChange, empty, prefer = "low", missing = null,
  keyFn = keyOf, query = "", sort: sort0 = "dex", limit = null,
}) {
  const [q, setQ] = useState(query);
  const [only, setOnly] = useState(null);
  const [type, setType] = useState("");
  const [sort, setSort] = useState(sort0);

  const groups = useMemo(() => {
    const by = new Map();
    for (const m of mons) {
      const k = groupOf(m);
      if (!by.has(k)) by.set(k, { key: k, species: m.species, tier: tierOf(m), alpha: !!m.alpha, members: [] });
      by.get(k).members.push(m);
    }
    for (const g of by.values()) {
      g.members.sort((a, b) => (prefer === "high" ? b.level - a.level : a.level - b.level));
      g.top = Math.max(...g.members.map((m) => m.level));
    }
    return [...by.values()];
  }, [mons, prefer]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase().replace(/^#/, "");
    return groups.filter((g) => {
      const sp = speciesById(g.species);
      if (!sp) return false;
      if (n && !(label(sp).toLowerCase().includes(n) || String(sp.id) === n)) return false;
      if (type && !sp.types.includes(type)) return false;
      if (only === "rare" && !g.tier) return false;
      if (only === "alpha" && !g.alpha) return false;
      if (only === "legend" && !isLegendary(g.species)) return false;
      if (only === "missing" && !missing?.test(g.species)) return false;
      return true;
    }).sort(SORTS[sort] ?? SORTS.dex);
  }, [groups, q, type, only, sort, missing]);

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const byKey = useMemo(() => new Map(mons.map((m) => [keyFn(m), m])), [mons, keyFn]);
  const tray = picked.map((k) => byKey.get(k)).filter(Boolean);
  const single = max === 1;
  const ofSpecies = (sp) => tray.filter((m) => m.species === sp).length;
  const capped = (sp) => !!limit && ofSpecies(sp) >= limit(sp);

  const tap = (g) => {
    const next = g.members.find((m) => !pickedSet.has(keyFn(m)));
    if (single) {
      const k = keyFn(g.members[0]);
      onChange(pickedSet.has(k) ? [] : [k]);
      return;
    }
    if (next && picked.length < max && !capped(g.species)) onChange([...picked, keyFn(next)]);
  };
  const drop = (k) => onChange(picked.filter((x) => x !== k));

  if (!mons.length) return <p className="ev-quiet">{empty}</p>;
  const chips = [["rare", "Rare forms"], ["alpha", "Alpha"], ["legend", "Legendary"]];
  if (missing) chips.unshift(["missing", missing.label]);
  return (
    <div className="pk">
      <div className="pk-bar">
        <input className="tc-input pk-q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or #" aria-label="Search Pokémon" />
        <select className="pk-sel" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {TYPE_LIST.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select className="pk-sel" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="dex">Dex no.</option>
          <option value="rare">Rarest</option>
          <option value="level">Level</option>
          <option value="count">Most owned</option>
        </select>
      </div>
      <div className="pk-chips" role="group" aria-label="Show only">
        {chips.map(([id, name]) => (
          <button key={id} type="button" className={`tp-chip add${only === id ? " have" : ""}`} aria-pressed={only === id}
            onClick={() => setOnly((o) => (o === id ? null : id))}>{name}</button>
        ))}
      </div>
      {!single && tray.length > 0 && (
        <div className="pk-tray" aria-label="Picked">
          <span className="pk-count">{tray.length}/{max}</span>
          {tray.map((m) => {
            const sp = speciesById(m.species);
            return (
              <button key={keyFn(m)} type="button" className="pk-took" onClick={() => drop(keyFn(m))}
                aria-label={`Remove ${label(sp)}, Lv ${m.level}`} data-tip="Remove">
                <Sprite id={m.species} variant={tierOf(m)} alt="" />
                <i>Lv {m.level}</i><b aria-hidden="true">✕</b>
              </button>
            );
          })}
        </div>
      )}
      {shown.length ? (
        <div className="tc-pick">
          {shown.map((g) => {
            const sp = speciesById(g.species);
            const took = g.members.filter((m) => pickedSet.has(keyFn(m))).length;
            const full = !single && (took === g.members.length || capped(g.species));
            const room = single || (picked.length < max && !capped(g.species));
            return (
              <button key={g.key} type="button" className={`tc-mon${took ? " on" : ""}`}
                aria-pressed={took > 0}
                aria-label={`${label(sp)}${g.tier ? `, ${g.tier}` : ""}${g.alpha ? ", alpha" : ""}, ${g.members.length} owned${took ? `, ${took} picked` : ""}`}
                disabled={!took && !room ? true : full && !single}
                onClick={() => tap(g)}>
                <Sprite id={g.species} variant={g.tier} fx />
                {g.tier && <span className="tp-tier"><Mark tier={g.tier} size={10} /></span>}
                {g.alpha && <span className="tp-alpha"><Mark tier="alpha" size={9} /></span>}
                {g.members.length > 1 && <span className="pk-n">×{g.members.length}</span>}
                {took > 0 && <em>{single ? "✓" : took}</em>}
              </button>
            );
          })}
        </div>
      ) : <p className="ev-quiet">Nothing matches.</p>}
    </div>
  );
}

/* A SPECIES SEARCH over the WHOLE dex - wishes and wants name what you are
   missing, so they cannot be limited to what you have seen (decided with the
   player: trading is how you fill the gaps). `dexOf` marks what you have. */
export function SpeciesFind({ onPick, placeholder, dexOf = () => 0, skip = [] }) {
  const [find, setFind] = useState("");
  const hits = useMemo(() => {
    const n = find.trim().toLowerCase().replace(/^#/, "");
    if (n.length < 2 && !/^\d+$/.test(n)) return [];
    return SPECIES.filter((sp) => !skip.includes(sp.id)
      && (label(sp).toLowerCase().includes(n) || String(sp.id) === n)).slice(0, 10);
  }, [find, skip]);
  return (
    <>
      <input className="tc-input" type="search" value={find} onChange={(e) => setFind(e.target.value)}
        placeholder={placeholder} aria-label={placeholder} />
      {hits.length > 0 && (
        <div className="tp-seek">
          {hits.map((sp) => (
            <button key={sp.id} type="button" className={`tp-chip add${dexOf(sp.id) === 2 ? " have" : ""}`}
              onClick={() => { onPick(sp.id); setFind(""); }}
              data-tip={dexOf(sp.id) === 2 ? "In your Pokédex" : "Not in your Pokédex"}>
              <Sprite id={sp.id} alt="" />{label(sp)}<i aria-hidden="true">+</i>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
