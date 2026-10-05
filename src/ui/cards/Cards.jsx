/* THE CARDS PAGE (docs/cards.md), the fifth tab: Packs, Binder, Card Dex and
   Dust, the pack opening and the card view. A lazy chunk (App's `lazy()`),
   and each set's cards load from their own file, also lazy (`load.js`).

   It reads the collection from the engine's state and writes it only through
   the engine (`buyPacks`, `openCardPack`, `dustCard`, `dustSpares`,
   `craftCard`), which decide and save before a frame of any scene plays.
   Cards are a collection, never a strength - nothing here reaches a roll. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CARD_SETS } from "../../data/cards/index.js";
import { WRAPPERS } from "../../data/cards/art.js";
import {
  RARITY, CARD_RARITIES, landsOn, rulesOf, GOD_PACK, PACK_PRICE, PACK_SIZE, SET_LEVEL, MILESTONES, BOXES, setOpen, cardId,
  copiesOf, chanceOf, freshPity, sparesOf, dustOf, craftCost, rungOf, titleOf, canCraft, isHit,
} from "../../game/cards.js";
import CardFace, { RarityMark } from "./Card.jsx";
import Inspect from "./Inspect.jsx";
import Opening, { OpenAll } from "./Opening.jsx";
import { loadSet, logoUrl, packUrl } from "./load.js";
import Icon from "../Icon.jsx";
import { titleIds, titleName, MASTER_STEP } from "../../game/titles.js";
import { showKey, CARD_SHOW, printingsOf } from "../../game/cards.js";

const yen = (n) => `¥${n.toLocaleString()}`;
const oneIn = (p) => Math.round(1 / p);
const TABS = [["packs", "Packs", "cards"], ["binder", "Binder", "book"], ["dex", "Card Dex", "dex"], ["dust", "Dust", "forms"]];
const POCKETS = 12;            // a page: four across, three down
/* THE CARD DEX ADDS TILES A PAGE AT A TIME as its end scrolls near (the
   Picker's rule): 188 tiles at once was a 103ms task on a throttled phone. */
const TILE_PAGE = 48;
const CHASE = ["mega", "hyper", "special"];
// The best copy a card is held in: a foil over a plain one.
const bestVariant = (row, card) => ["h", "r", "n"].find((v) => row?.[v] && card[4].includes(v)) ?? card[4][0];

export default function Cards({ engine, st, level, onClose, onSpecies, onScene }) {
  const [tab, setTab] = useState("packs");
  const [sets, setSets] = useState({});            // id -> { SET, CARDS }, as each loads
  const [opening, setOpening] = useState(null);    // { set, result, wrapper, n }
  const [inspect, setInspect] = useState(null);    // { setId, localId }
  const [note, setNote] = useState("");
  const page = useRef(null);

  // The game underneath stops while this covers it, as under the League.
  useEffect(() => {
    engine?.pause(true);
    return () => engine?.pause(false);
  }, [engine]);
  useEffect(() => {
    if (!location.hash.startsWith("#/cards")) history.pushState({ cd: 1 }, "", "#/cards");
  }, []);
  useEffect(() => {
    let live = true;
    for (const s of CARD_SETS) loadSet(s.id).then((m) => live && m && setSets((o) => ({ ...o, [s.id]: m })));
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || opening || inspect || engine?.state.ask) return;
      e.preventDefault();
      onClose();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [opening, inspect, onClose, engine]);
  useEffect(() => { page.current?.scrollTo(0, 0); }, [tab]);

  const cards = st?.cards ?? {};
  const packs = st?.packs ?? {};
  const dex = st?.dex ?? [];
  const dust = st?.dust ?? 0;
  const unopened = Object.values(packs).reduce((a, b) => a + b, 0);
  const owned = Object.keys(cards).length;

  const open = useCallback((id) => {
    const set = sets[id];
    if (!set) return;
    /* The scene's flag goes up BEFORE the open, in the same render: the open
       raises a tip and maybe a milestone banner, and a frame of the tip
       mounting cost 46ms of focus on a throttled phone (and flashed it). */
    onScene?.(true);
    const result = engine.openCardPack(set);
    if (!result) onScene?.(false);
    const wraps = WRAPPERS[id] ?? [];
    // Which wrapper it opens in is cosmetic, and nothing reads it but this scene.
    if (result) setOpening((o) => ({ set, result, wrapper: wraps[Math.floor(Math.random() * wraps.length)], n: (o?.n ?? 0) + 1 }));
  }, [engine, sets, onScene]);
  /* Two tasks, not one: the scene first ("Opening 6 packs…"), then the rolls
     and the summary - together they were a 100ms task on a throttled phone. */
  /* OPEN 10 / OPEN ALL: the hits revealed one by one (best last), then one
     summary. Two tasks: the scene first ("Opening 6 packs…"), then the rolls -
     together they were a 100ms task on a throttled phone. */
  const openAll = (id, max = Infinity) => {
    const set = sets[id];
    const n = Math.min(max, packs[id] ?? 0);
    if (!set || n < 1) return;
    setOpening((o) => ({ set, all: [], waiting: n, n: (o?.n ?? 0) + 1 }));
    setTimeout(() => {
      const results = engine.openAllPacks(set, max);
      const hits = results?.flatMap((r) => r.pulls).filter((p) => isHit(p.rarity)).sort((a, b) => rungOf(a.rarity) - rungOf(b.rarity));
      setOpening((o) => (o?.waiting ? (results ? { ...o, all: results, waiting: 0, reveal: hits.length ? hits : null } : null) : o));
    }, 30);
  };
  const buyBox = (id) => setNote(engine.buyBox(id) ? "" : `Not enough money for a ${BOXES[id].name.toLowerCase()}.`);
  const buy = (id, n) => {
    setNote(engine.buyPacks(id, n) ? "" : `Not enough money for ${n === 1 ? "a pack" : `${n} packs`}.`);
  };
  const look = (setId, localId) => setInspect({ setId, localId });
  const titles = titleIds(st?.milestones, st?.medals).map(titleName);

  return (
    <div className={`tc-page evcard cd-page${opening ? " opening" : ""}`} role="dialog" aria-modal="true" aria-label="Cards" ref={page}>
      <header className="tc-head">
        <div className="tc-bar">
          <div className="tc-titles">
            <h3>Cards</h3>
            <span>{owned} cards collected · {unopened} pack{unopened === 1 ? "" : "s"} to open · {dust.toLocaleString()} dust
              {titles.length ? ` · ${titles.join(", ")}` : ""}</span>
          </div>
        </div>
        <nav className="lg-strip-wrap" aria-label="Cards">
          <div className="lg-strip" role="tablist">
            {TABS.map(([id, name, ic]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id}
                className={`rk-tab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>
                <Icon n={ic} className="side-ic" />
                <b>{name}</b>
                <em>{{ packs: yen(st?.money ?? 0), binder: `${owned} owned`, dex: "Every card", dust: `${dust.toLocaleString()} dust` }[id]}</em>
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="hp-body tc-main cd-main">
        {/* NOT RENDERED UNDER A SCENE: three sets and their chase galleries
            re-rendered on every open, and an open went back over 100ms. */}
        {tab === "packs" && !opening && (
          <div className="cd-packs">
            {note && <p className="cd-note" role="alert">{note}</p>}
            {CARD_SETS.map((s) => (
              <PackCard key={s.id} meta={s} set={sets[s.id]} level={level} money={st?.money ?? 0}
                held={packs[s.id] ?? 0} earned={st?.earnedPacks?.[s.id]?.length ?? 0}
                pity={st?.cardPity?.[s.id] ?? freshPity()} cards={cards} log={st?.cardLog ?? []}
                onOpen={() => open(s.id)} onOpenAll={(max) => openAll(s.id, max)} onBuy={(n) => buy(s.id, n)}
                onBox={() => buyBox(s.id)} onLook={(localId) => look(s.id, localId)} />
            ))}
          </div>
        )}
        {tab === "binder" && <Binder sets={sets} cards={cards} dex={dex} log={st?.cardLog ?? []} onLook={look}
          milestones={st?.milestones ?? {}} />}
        {tab === "dex" && <CardDex sets={sets} cards={cards} dex={dex} onLook={look} />}
        {tab === "dust" && <Dust sets={sets} cards={cards} dust={dust} onLook={look}
          onSweep={(id) => engine.dustSpares(sets[id])} />}
        <p className="cd-credit">
          Card data and small images from TCGdex; pack and card-back art from Bulbagarden Archives; each card names
          its illustrator. Pokémon and the TCG are © Nintendo, Creatures and GAME FREAK. Cards change nothing in the wild.
        </p>
      </main>

      {opening?.reveal && (
        <Opening key={`r${opening.n}`} set={opening.set} result={{ pulls: opening.reveal, god: false, daily: false }}
          hitsOnly onScene={onScene} onFinish={() => setOpening((o) => ({ ...o, reveal: null }))} />
      )}
      {opening?.all && !opening.reveal && (
        <OpenAll key={opening.n} set={opening.set} results={opening.all} waiting={opening.waiting}
          onBinder={() => { setOpening(null); setTab("binder"); }} onDone={() => setOpening(null)} />
      )}
      {opening && !opening.all && (
        <Opening key={opening.n} set={opening.set} result={opening.result} wrapper={opening.wrapper} onScene={onScene}
          again={(packs[opening.set.SET.id] ?? 0) > 0}
          onAgain={() => open(opening.set.SET.id)}
          onBinder={() => { setOpening(null); setTab("binder"); }}
          onDone={() => setOpening(null)} />
      )}
      {inspect && sets[inspect.setId] && (
        <Inspect set={sets[inspect.setId]} localId={inspect.localId} cards={cards} dust={dust} dex={dex}
          showcase={st?.cardShowcase ?? []}
          onShow={(v, on) => engine.showCard(cardId(inspect.setId, inspect.localId), v, on)}
          onDust={(v) => engine.dustCard(sets[inspect.setId], inspect.localId, v, 1)}
          onCraft={(v) => engine.craftCard(sets[inspect.setId], inspect.localId, v)}
          onSpecies={(id) => { setInspect(null); onSpecies?.(id); }}
          onClose={() => setInspect(null)} />
      )}
    </div>
  );
}

/* ONE SET'S PACKS: its real wrappers fanned, the odds (its own real-life rates, `rulesOf`,
   never typed), the three pity meters, your best pull, and the chase gallery
   - every Mega Hyper Rare and Special illustration rare, owned or still out
   there, each with its own odds. */
function PackCard({ meta, set, level, money, held, earned, pity, cards, log, onOpen, onOpenAll, onBuy, onBox, onLook }) {
  const box = BOXES[meta.id];
  const isOpen = setOpen(meta.id, level);
  const wraps = WRAPPERS[meta.id] ?? [];
  const chase = useMemo(() => (set ? CHASE.flatMap((r) => set.CARDS.filter((c) => c[3] === r)) : []), [set]);
  const count = (r) => set?.CARDS.filter((c) => c[3] === r).length ?? 1;
  const best = useMemo(() => {
    const mine = log.filter(([id]) => id.startsWith(`${meta.id}-`)).map(([id, v]) => [set?.CARDS.find((c) => cardId(meta.id, c[0]) === id), v]).filter(([c]) => c);
    return mine.sort((a, b) => rungOf(b[0][3]) - rungOf(a[0][3]))[0] ?? null;
  }, [log, set, meta.id]);
  /* THIS SET'S OWN RULES (`rulesOf`): its real-life rates and the pity scaled
     to them. Each rate under the rarity it gives IN THIS SET (`landsOn`):
     Prismatic's illustration roll is an ACE SPEC, a Scarlet & Violet set's
     top roll a Hyper rare. */
  const rules = rulesOf(meta.id);
  const { rates, pity: net } = rules;
  const as = (r) => (set ? landsOn(set.CARDS, r) ?? r : r);
  const odds = ["double", "illustration", "ultra", "special", "mega"].map((r) => [as(r), rates[r]]);
  // The rate a rarity is pulled at here: the roll that lands on it.
  const rateOf = (rarity) => rates[Object.keys(rates).find((k) => as(k) === rarity)] ?? 0;
  const meters = [
    ["hit", "A Double rare or better", pity.hit],
    ["special", "A Special illustration rare", pity.special],
    ["mega", `A ${RARITY[as("mega")].name}`, pity.mega],
  ];
  const got = chase.filter((c) => cards[cardId(meta.id, c[0])]).length;
  return (
    <section className={`ev-card cd-set${isOpen || held ? "" : " shut"}`}>
      <div className="cd-wrap">
        <div className="cd-wrappers" style={{ "--n": wraps.length }}>
          {wraps.map((w, k) => (
            <img key={w} src={packUrl(meta.id, w)} alt={k === 0 ? `${meta.name} booster pack` : ""} style={{ "--k": k }} />
          ))}
          {!wraps.length && <img src={logoUrl(meta.id)} alt={meta.name} />}
        </div>
        {best && (
          <button type="button" className="cd-best" onClick={() => onLook(best[0][0])}>
            <CardFace setId={meta.id} card={best[0]} variant={best[1]} still />
            <span>Your best pull</span>
          </button>
        )}
      </div>
      <div className="cd-set-body">
        <h4>{meta.name}</h4>
        <p className="cd-sub">{meta.total} cards · {PACK_SIZE} a pack · a hit about 1 pack in {(1 / rules.hit).toFixed(1)} · {yen(PACK_PRICE)}</p>
        <ul className="cd-odds" aria-label="Odds per pack">
          {odds.map(([r, p]) => (
            <li key={r}><RarityMark rarity={r} /><span>{RARITY[r].name}</span><b>1 in {oneIn(p)}</b></li>
          ))}
          <li className="cd-god"><span>God Pack: all foils, three {RARITY[as("illustration")].name}s or better</span><b>1 in {oneIn(GOD_PACK)}</b></li>
        </ul>
        <div className="cd-pity">
          {meters.map(([k, name, n]) => {
            const left = net[k].hard - n;
            return (
              <div key={k} className="cd-meter">
                <span>{name} <em>within {left.toLocaleString()} pack{left === 1 ? "" : "s"}</em></span>
                <i style={{ "--p": n / net[k].hard }} />
                {k !== "hit" && n + 1 > net[k].soft && <small>Odds up: {Math.round(chanceOf(k, n, rules) * 100)}% this pack</small>}
              </div>
            );
          })}
        </div>
        <div className="cd-actions">
          {held > 0 && (
            <button type="button" className="lg-go cd-open-btn" onClick={onOpen} disabled={!set}>
              Open a pack · {held}{earned ? ` (${earned} earned)` : ""}
            </button>
          )}
          {held >= 10 && (
            <button type="button" className="lg-go quiet" onClick={() => onOpenAll(10)} disabled={!set}>Open 10</button>
          )}
          {held > 1 && (
            <button type="button" className="lg-go quiet" onClick={() => onOpenAll()} disabled={!set}>Open all {held}</button>
          )}
          {isOpen ? (
            <>
              <button type="button" className="lg-go quiet" disabled={money < PACK_PRICE} onClick={() => onBuy(1)}>Buy 1 · {yen(PACK_PRICE)}</button>
              <button type="button" className="lg-go quiet" disabled={money < PACK_PRICE * 10} onClick={() => onBuy(10)}>Buy 10 · {yen(PACK_PRICE * 10)}</button>
              {box && (
                <button type="button" className="lg-go quiet" disabled={money < box.price} onClick={onBox}>
                  {box.name.replace("Booster ", "").replace(/^./, (c) => c.toUpperCase())} of {box.packs} · {yen(box.price)} (−{Math.round((1 - box.price / (box.packs * PACK_PRICE)) * 100)}%)
                </button>
              )}
            </>
          ) : <span className="cd-lock">Opens at Lv {SET_LEVEL[meta.id]}</span>}
        </div>
      </div>
      {chase.length > 0 && (
        <div className="cd-chase">
          <div className="cd-chase-head">
            <h5>Chase cards</h5>
            <span>{got} of {chase.length} found</span>
          </div>
          <div className="cd-chase-row">
            {chase.map((c) => {
              const row = cards[cardId(meta.id, c[0])];
              return (
                <button key={c[0]} type="button" className={`cd-chase-card${row ? " got" : ""}`} onClick={() => onLook(c[0])}>
                  <CardFace setId={meta.id} card={c} variant="h" still lazy />
                  <span><RarityMark rarity={c[3]} /> 1 in {oneIn(rateOf(c[3]) / count(c[3])).toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/* THE BINDER: twelve pockets a page, four across, in set order. An empty
   pocket names the card faintly; a filled one holds the best copy, a count,
   the catch stamp and the earned mark. Above it, the Pulls wall. */
function Binder({ sets, cards, dex, log, onLook, milestones }) {
  const [setId, setSetId] = useState(CARD_SETS[0]?.id);
  const [pageNo, setPage] = useState(0);
  const set = sets[setId];
  if (!set) return <p className="ev-quiet">Loading…</p>;
  const key = (c) => cardId(setId, c[0]);
  const ownedN = set.CARDS.filter((c) => cards[key(c)]).length;
  const variants = printingsOf(set.CARDS);
  /* THE COVER: locked until the set is complete, foil when it is, gold for
     the master set (every printing). */
  const done = (milestones[setId] ?? 0) >= MILESTONES.length;
  const masterDone = (milestones[setId] ?? 0) >= MASTER_STEP;
  const master = set.CARDS.reduce((a, c) => a + c[4].split("").filter((v) => cards[key(c)]?.[v]).length, 0);
  const pages = Math.ceil(set.CARDS.length / POCKETS);
  const at = Math.min(pageNo, pages - 1);
  const rows = set.CARDS.slice(at * POCKETS, at * POCKETS + POCKETS);
  const pulls = log.filter(([id]) => id.startsWith(`${setId}-`))
    .map(([id, v, when]) => ({ card: set.CARDS.find((c) => key(c) === id), v, when })).filter((p) => p.card);
  return (
    <div className="cd-binder">
      <SetChips setId={setId} onSet={(id) => { setSetId(id); setPage(0); }} />
      {pulls.length > 0 && (
        <section className="cd-wall">
          <h5>Pulls wall <span>your hits, newest first</span></h5>
          <div className="cd-chase-row">
            {pulls.map((p, k) => (
              <button key={k} type="button" className="cd-chase-card got" onClick={() => onLook(setId, p.card[0])}>
                <CardFace setId={setId} card={p.card} variant={p.v} still lazy />
                <span><RarityMark rarity={p.card[3]} /> {new Date(p.when).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className={`cd-cover${done ? " done" : ""}${masterDone ? " master" : ""}`}>
        <img src={logoUrl(setId)} alt="" />
        <span>
          <b>{masterDone ? "Master set" : done ? "Complete" : "Binder cover"}</b>
          <i>{masterDone ? `Every printing - ${titleName(`master:${setId}`)}` : done ? `${titleName(`set:${setId}`)} · the gold cover takes every printing`
            : `Complete the set (${set.CARDS.length - ownedN} to go) for its cover`}</i>
        </span>
      </div>
      <div className="cd-progress">
        <b>{ownedN}<u>/{set.CARDS.length}</u></b>
        <i style={{ "--p": ownedN / set.CARDS.length }} />
        <small>Master set: {master} of {variants} printings</small>
      </div>
      <div className="cd-page-grid">
        {rows.map((c) => {
          const row = cards[key(c)];
          const n = copiesOf(row);
          return (
            <button key={c[0]} type="button" className={`cd-pocket${row ? " got" : ""}`} onClick={() => onLook(setId, c[0])}
              aria-label={`${c[1]}, ${RARITY[c[3]].name}${row ? `, ${n} owned` : ", missing"}`}>
              {row ? (
                <>
                  <CardFace setId={setId} card={c} variant={bestVariant(row, c)} still />
                  {n > 1 && <em>×{n}</em>}
                  {row.earned && <span className="cd-earned" aria-hidden="true">✦</span>}
                </>
              ) : (
                <span className="cd-empty"><b>{c[0]}</b>{c[1]}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="cd-turn">
        <button type="button" className="lg-go quiet" disabled={at === 0} onClick={() => setPage(at - 1)} aria-label="Previous page">‹</button>
        <span>Page {at + 1} of {pages}</span>
        <button type="button" className="lg-go quiet" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} aria-label="Next page">›</button>
      </div>
    </div>
  );
}

// One set at a time, for the Binder and Dust.
function SetChips({ setId, onSet }) {
  if (CARD_SETS.length < 2) return null;
  return (
    <div className="pk-chips">
      {CARD_SETS.map((s) => (
        <button key={s.id} type="button" className={`tp-chip add${s.id === setId ? " have" : ""}`}
          aria-pressed={s.id === setId} onClick={() => onSet(s.id)}>{s.name}</button>
      ))}
    </div>
  );
}

/* THE CARD DEX: every card of every shipped set in one grid, filtered and
   sorted - the binder answers "what is on this page", this answers "where is
   the card I want". Missing cards show, dimmed: you can see what you chase. */
function CardDex({ sets, cards, dex, onLook }) {
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("");
  const [have, setHave] = useState("");
  const [sort, setSort] = useState("set");
  const all = useMemo(() => CARD_SETS.flatMap((s) => (sets[s.id]?.CARDS ?? []).map((c, i) => ({ s: s.id, c, i }))), [sets]);
  const n = q.trim().toLowerCase();
  const shown = all.filter(({ s, c }) => {
    const row = cards[cardId(s, c[0])];
    if (n && !c[1].toLowerCase().includes(n) && !(c[6] ?? "").toLowerCase().includes(n)) return false;
    if (rarity && c[3] !== rarity) return false;
    if (have === "owned" && !row) return false;
    if (have === "missing" && row) return false;
    if (have === "spare" && !c[4].split("").some((v) => sparesOf(row, v))) return false;
    return true;
  }).sort((a, b) => (sort === "rarity" ? rungOf(b.c[3]) - rungOf(a.c[3]) : 0)
    || (sort === "dex" ? (a.c[5][0] ?? 1e9) - (b.c[5][0] ?? 1e9) : 0) || a.i - b.i);
  const [upTo, setUpTo] = useState(TILE_PAGE);
  useEffect(() => setUpTo(TILE_PAGE), [q, rarity, have, sort]);
  const more = useRef(null);
  useEffect(() => {
    const el = more.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setUpTo((k) => k + TILE_PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [upTo, shown.length]);
  return (
    <div className="cd-dex">
      <div className="pk-bar">
        <input className="tc-input pk-q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search a card or illustrator" aria-label="Search cards" />
        <select className="pk-sel" value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="Rarity">
          <option value="">Every rarity</option>
          {CARD_RARITIES.map((r) => <option key={r} value={r}>{RARITY[r].name}</option>)}
        </select>
        <select className="pk-sel" value={have} onChange={(e) => setHave(e.target.value)} aria-label="Owned">
          <option value="">Owned and missing</option>
          <option value="owned">Owned</option>
          <option value="missing">Missing</option>
          <option value="spare">With spares</option>
        </select>
        <select className="pk-sel" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="set">Set order</option>
          <option value="rarity">Rarest first</option>
          <option value="dex">Pokédex number</option>
        </select>
      </div>
      <p className="cd-sub">{shown.length} card{shown.length === 1 ? "" : "s"}</p>
      <div className="cd-grid">
        {shown.slice(0, upTo).map(({ s, c }) => {
          const row = cards[cardId(s, c[0])];
          return (
            <button key={`${s}-${c[0]}`} type="button" className={`cd-tile${row ? " got" : ""}`} onClick={() => onLook(s, c[0])}
              aria-label={`${c[1]}, ${RARITY[c[3]].name}${row ? "" : ", missing"}`}>
              <CardFace setId={s} card={c} variant={bestVariant(row, c)} still lazy />
              {copiesOf(row) > 1 && <em>×{copiesOf(row)}</em>}
              <span className="cd-tile-cap"><RarityMark rarity={c[3]} />{c[0]}</span>
            </button>
          );
        })}
        {upTo < shown.length && <i ref={more} className="pk-more" aria-hidden="true" />}
      </div>
    </div>
  );
}

/* DUST: your spares and what they are worth, the one sweep, and what a
   missing card costs to craft. Every individual dust or craft happens in the
   card view, which asks first for anything rare. */
function Dust({ sets, cards, dust, onLook, onSweep }) {
  const [setId, setSetId] = useState(CARD_SETS[0]?.id);
  const set = sets[setId];
  if (!set) return <p className="ev-quiet">Loading…</p>;
  const spares = set.CARDS.map((c) => {
    const row = cards[cardId(setId, c[0])];
    const per = c[4].split("").map((v) => [v, sparesOf(row, v)]).filter(([, k]) => k);
    return { c, per, worth: per.reduce((a, [v, k]) => a + k * dustOf(c[3], v), 0) };
  }).filter((x) => x.per.length);
  const sweep = spares.filter(({ c }) => rungOf(c[3]) < rungOf("rare"))
    .reduce((a, { c, per }) => a + per.filter(([v]) => v === "n").reduce((b, [, k]) => b + k * dustOf(c[3], "n"), 0), 0);
  const missing = set.CARDS.filter((c) => !cards[cardId(setId, c[0])]);
  return (
    <div className="cd-dustpage">
      <SetChips setId={setId} onSet={setSetId} />
      <section className="ev-card cd-dusthead">
        <b>{dust.toLocaleString()}</b>
        <span>Card Dust<small>Spares become dust; dust crafts any card you are missing. You always keep one of each.</small></span>
        <button type="button" className="lg-go" disabled={!sweep} onClick={() => onSweep(setId)}>
          Dust spare commons and uncommons · +{sweep}
        </button>
      </section>
      <h5 className="cd-h">Spares <span>{spares.length} cards</span></h5>
      {spares.length ? (
        <div className="cd-grid">
          {spares.map(({ c, per, worth }) => (
            <button key={c[0]} type="button" className="cd-tile got" onClick={() => onLook(setId, c[0])}>
              <CardFace setId={setId} card={c} variant={per[0][0]} still lazy />
              <em>+{worth}</em>
              <span className="cd-tile-cap"><RarityMark rarity={c[3]} />{per.map(([v, k]) => `${k} ${v === "n" ? "" : v === "r" ? "rev." : "holo"}`).join(" · ")}</span>
            </button>
          ))}
        </div>
      ) : <p className="ev-quiet">No spares yet - every card you hold is your only copy.</p>}
      <h5 className="cd-h">Missing <span>{missing.length} to craft</span></h5>
      <div className="cd-grid">
        {missing.map((c) => (
          <button key={c[0]} type="button" className="cd-tile" onClick={() => onLook(setId, c[0])}>
            <CardFace setId={setId} card={c} variant={c[4][0]} still lazy />
            <span className="cd-tile-cap"><RarityMark rarity={c[3]} />{canCraft(c[3]) ? craftCost(c[3], c[4][0]).toLocaleString() : "Packs only"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
