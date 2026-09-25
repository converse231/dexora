/* One Pokédex entry, opened by clicking a slot in the grid.

   How much it shows depends on how far you've got with that species: an unseen
   one is a silhouette and nothing else, a seen one gives you its name and types,
   and only a caught one opens up the rest. Holding detail back is the point —
   the gaps are what make you want to go and fill them.

   ORDER IS THE ARGUMENT. It used to be a flat stack of five equal blocks -
   header, flavour, facts, forms, stats - which said everything mattered the
   same amount. It does not: FORMS is why this dialog gets opened. The marks on
   a Dex tile tell you that you hold a Holo of something; only this says what
   that Holo looks like and which three you are still missing, and in a game
   about collecting variants that is the content. So it sits directly under the
   name, and the dex text and the measurements follow as the reference material
   they are.

   The six base-stat bars are gone. Nothing in this game reads `stats` - there
   is no battling - so they were six rows of precise numbers that could not
   affect a single decision, and they were the largest block on the card. */

import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import { SPECIES } from "../data/dex.js";
import { label } from "../game/map.js";
import Sprite, { spriteUrl, VariantFx } from "./Sprite.jsx";
import {
  foundIn, howOften, speciesById, areaOpen, BIOMES, tiersFor, ROSETTE_NEED,
  TIER_TELL, genOf, dexIndex,
} from "../game/biomes.js";
import { evoLevel, itemById } from "../game/items.js";
import { EVOLUTIONS } from "../data/evolutions.js";
import Mark from "./Marks.jsx";
import {
  tasksFor, progress, researchLevel, RESEARCH_MAX, RESEARCH_LIFT, STAR_COST, canStar,
} from "../game/research.js";

/* Kindest first, so the row reads as progress toward the rarest. Origin and
   Holo share odds; Origin sits first because its tell is the drawing itself,
   which is the easier of the two to recognise cold. */
/* WHAT EACH TIER IS, IN FOUR WORDS. Only the prose lives here - the LIST and
   its ORDER come from `TIERS`, because a second hand-written list of tiers is
   exactly how this strip came to be missing four of them the day the ladder
   grew. It drifted once already: it filtered on `origin` by name and knew
   nothing about any other tier whose artwork might be absent.

   A tier with no line here still renders; it just has no blurb. That is the
   right failure - a missing sentence beats a missing column. */
const BLURB = TIER_TELL;
const LABEL = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/* Where this one turns up, in a sentence a player can act on.

   Ordered by what is actually useful: a wild table beats a rod beats an
   evolution, because "go to Rock Ridge" is a thing you can do now and "evolve
   a Machoke" is a thing you can do once you already have one.

   The evolution fallback matters more than it looks: 51 of the 151 are in no
   table at all - every second-stage and third-stage Pokemon - and for those
   the old sheet said nothing whatsoever, on exactly the entries a player is
   most likely to open wondering where it is. */
function whereToFind(id) {
  const { legendary, areas, rods } = foundIn(id);

  /* `from` is the level an evolved form starts turning up at. Printed, because
     a sheet that says "Deep Woods · rare" for a Venusaur to a Lv 3 trainer is
     sending them somewhere nothing will happen. */
  const out = areas.map((a) => ({
    key: a.id,
    // The biome id, which is what makes a row a PLACE rather than a sentence -
    // a rod row and an "evolve X" row are neither, and must not offer to go.
    area: a.id,
    where: a.name,
    how: (legendary ? "legendary" : howOften(a.share)) + (a.from ? ` · Lv ${a.from}+` : ""),
  }));
  for (const rod of rods) out.push({ key: rod, where: "Any water", how: rod });

  if (!out.length) {
    const from = EVOLUTIONS.filter((r) => r.to === id);
    for (const row of from) {
      out.push({
        key: `evo-${row.from}`,
        where: `Evolve ${label(speciesById(row.from))}`,
        how: row.kind === "level" ? `at Lv ${row.level}`
          : row.kind === "stone" ? "with a stone" : "by trade",
      });
    }
  }
  return out;
}

/* AND IT TAKES YOU THERE. This panel answered "where do I find one" and then
   made you close it, open MAP, and find the same name in a second list - which
   is the whole journey the answer was supposed to save you.

   `areaOpen` is the single answer to whether a map is reachable and it is asked
   here for the same reason the Travel panel asks it: an offer the engine will
   refuse is worse than no offer. A locked row prints the level it opens at
   instead, and stays a plain row rather than a dead button.

   Rows that are not places - a rod, an "evolve Bulbasaur" - never become
   buttons at all: `area` is what says a row IS somewhere. */
/* RESEARCH: what this species still has to teach you, and how far along it
   is. Every task is derived from the data in research.js, so a species that
   cannot evolve simply has no "Evolve one" row. A task with several steps
   counts towards the next one; a task with one is done or it is not. */
function Research({ id, row, starred, ordinary, onStar }) {
  const level = researchLevel(id, row);
  return (
    <div className="sheet-research">
      <div className="sr-bar"><i style={{ width: `${(level / RESEARCH_MAX) * 100}%` }} /></div>
      {/* A CHECKLIST, ticked as you go - a quest log rather than a table. */}
      <ul>
        {tasksFor(id).map((t) => {
          const p = progress(t, row);
          const next = t.steps.find((s) => p.n < s);
          return (
            <li key={t.id} className={next ? "" : "done"}>
              <i aria-hidden="true">{next ? "" : "✓"}</i>
              <span>{t.label}</span>
              <em>{t.bonus ? "bonus" : t.steps.length > 1 ? `${p.n}/${next ?? t.steps.at(-1)}` : ""}</em>
            </li>
          );
        })}
      </ul>
      {/* THE STAR: offered by finished research, bought with ordinary ones. */}
      {!canStar(id) ? (
        <p className="sr-note">
          {level < RESEARCH_MAX ? "Catch one to complete it." : "Complete."} A legendary is never starred.
        </p>
      ) : level < RESEARCH_MAX ? (
        <p className="sr-note">
          Finish every task, then star it: {STAR_COST} ordinary ones for {RESEARCH_LIFT}x rare forms.
        </p>
      ) : starred ? (
        <p className="sr-note sr-starred">★ Starred: its rare forms turn up {RESEARCH_LIFT}x as often.</p>
      ) : (
        <div className="sr-star">
          <p className="sr-note">
            Complete. Give up {STAR_COST} ordinary ones (you hold {ordinary}) and its rare
            forms turn up {RESEARCH_LIFT}x as often.
          </p>
          <button type="button" className="sheet-inbox" disabled={ordinary < STAR_COST} onClick={onStar}>
            ★ GET STAR
          </button>
        </div>
      )}
    </div>
  );
}

function Where({ id, level = 1, busy = false, here = null, onTravel = null, head = true }) {
  const rows = whereToFind(id);
  if (!rows.length) return null;
  return (
    <div className="sheet-where">
      {head && <div className="sw-head">WHERE TO LOOK</div>}
      <ul>
        {rows.map((r) => {
          const open = r.area ? areaOpen(r.area, level) : false;
          const go = r.area && onTravel && open && r.area !== here && !busy;
          const shut = r.area && !open;
          return (
            <li key={r.key} className={go ? "sw-go" : ""}>
              {go ? (
                <button type="button" onClick={() => onTravel(r.area)}>
                  {r.where}
                  <i aria-hidden="true">›</i>
                </button>
              ) : (
                <span>{r.where}</span>
              )}
              <em>
                {r.area === here ? "you are here"
                  : shut ? `opens at Lv ${BIOMES.find((b) => b.id === r.area)?.level}`
                    : r.how}
              </em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* THE EVOLUTION LINE, which the sheet never showed: what this comes from and
   what it becomes, each with what it costs. A step you have not SEEN stays
   "???" - the same rule the grid follows, because the line is a spoiler for
   exactly the entries a player has not met. Seen ones are buttons that open
   that entry, so the line can be walked. */
const METHOD = (row) => {
  const at = `Lv ${evoLevel(row)}`;
  if (row.item) return `${at} + ${itemById(row.item)?.name ?? row.item}`;
  return row.kind === "trade" || row.kind === "bond" ? `${at} · friendship` : at;
};

function Line({ id, dexOf, onSelect }) {
  const from = EVOLUTIONS.filter((r) => r.to === id).map((r) => [r.from, r]);
  const into = EVOLUTIONS.filter((r) => r.from === id).map((r) => [r.to, r]);
  if (!from.length && !into.length) {
    return <p className="sheet-line-none">Does not evolve.</p>;
  }
  const step = ([other, row], dir) => {
    const known = dexOf(other) >= 1;
    const name = known ? label(speciesById(other)) : "???";
    const body = (
      <>
        <Sprite id={other} className={known ? "" : "locked"} alt="" />
        <span><i>{dir}</i><b>{name}</b></span>
        <em>{METHOD(row)}</em>
      </>
    );
    return (
      <li key={`${dir}-${other}`}>
        {known && onSelect
          ? <button type="button" onClick={() => onSelect(other)}>{body}</button>
          : <div>{body}</div>}
      </li>
    );
  };
  return (
    <div className="sheet-line">
      <ul>
        {from.map((x) => step(x, "from"))}
        {into.map((x) => step(x, "into"))}
      </ul>
    </div>
  );
}

let lastTab = "forms";   // the tab this session last used - see `tabs` below

export default function DexSheet({
  id, state, variant = null, held = {}, owned = 0, research = null,
  starred = false, ordinary = 0, onStar = () => {},
  level = 1, here = null, busy = false,
  onClose, onFindInBox, onTravel, onSelect = null, dexOf = () => 0,
}) {
  const sp = speciesById(id);
  const caught = state === 2;
  const seen = state >= 1;
  /* Which of the four you actually hold. The ordinary one is simply "caught";
     the rest come from their own dex arrays. */
  const got = (t) => (t === null ? caught : !!held[t]);
  /* Only the forms this species can have, straight out of `tiersFor` - the
     same answer the ROLL uses, so the strip cannot offer a column the game
     will never fill. A Sinnoh entry drops Origin and a Mega drops Showdown,
     rather than showing a silhouette nobody can ever earn: a slot that cannot
     be filled reads as a bug in the collection.

     Kindest first, which is what makes the row read as progress. */
  const forms = [
    [null, "Ordinary", "the sprite everyone meets"],
    ...[...tiersFor(id)].reverse().map((t) => [t, LABEL(t), BLURB[t] ?? ""]),
  ];
  /* THE ROSETTE IS ANY FOUR, and this label has to say the same thing the Dex
     tile does - two answers to "is this complete" is how one screen shows the
     badge and the other does not. */
  const heldCount = forms.filter(([t]) => t !== null && got(t)).length;
  const every = heldCount >= ROSETTE_NEED;

  /* WHICH FORM THE PORTRAIT IS SHOWING. It was fixed at the rarest one held,
     which is the right thing to OPEN on and the wrong thing to be stuck with:
     the strip below is where you go to see what a variant looks like, and the
     portrait is the biggest this entry ever draws the creature - so picking a
     form there and having the big picture ignore you is the whole strip's
     point missed. Held forms only; a silhouette is not something to promote.

     Keyed on `id` so opening a different entry starts from its own rarest
     again rather than remembering a tier the new one may not even have. */
  const [picked, setPicked] = useState(variant);
  useEffect(() => { setPicked(variant); }, [id, variant]);
  const shown = got(picked) ? picked : variant;


  /* TABS, because it had become five stacked blocks - forms, research, where,
     flavour, measurements - and on a phone the one you opened it for was a long
     scroll away. The header stays put and names the Pokemon; only the panel
     below changes, and the panel scrolls rather than the card, so switching
     tabs never makes the dialog jump in size. FORMS opens first: it is what
     this dialog is opened for (see the note at the top of the file). The last
     tab used is remembered while you browse, so reading one Pokemon's research
     and opening the next opens on its research. */
  /* TWO TABS, NOT FOUR. Four left three of them mostly white space - a
     paragraph and four numbers in a tall fixed card - so everything that is
     not the collection is one INFO board of cards, Events-style: field notes,
     research, the line and where to look, one scroll. */
  const rLevel = researchLevel(id, research);
  const tabs = caught ? [
    ["forms", "Forms", `${heldCount}/${forms.length - 1}`],
    ["info", "Info", `Lv ${rLevel}`],
  ] : [];
  const [tab, setTab] = useState(() => lastTab);
  const current = tabs.some(([t]) => t === tab) ? tab : "forms";
  const choose = (t) => { lastTab = t; setTab(t); };
  const onTabKey = (e) => {
    const i = tabs.findIndex(([t]) => t === current);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(i + step + tabs.length) % tabs.length][0];
    choose(next);
    e.currentTarget.parentElement.querySelector(`[data-tab="${next}"]`)?.focus();
  };

  useModalLock();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div
        className={`sheet-card${caught ? " tabbed" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={seen ? label(sp) : `Unknown Pokémon number ${id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-top">
          {/* `shown` rather than `variant`: the FORMS tab can change it.

              THE IMAGE IS NOT KEYED AND THE LAYER IS, and they must not share
              a key: two siblings with one key stopped reconciling, and swapping
              the form left the old <img> mounted beside the new one. Only the
              LAYER needs remounting - a CSS animation does not restart on a
              prop change. */}
          {seen && <span className={`sheet-hero t-${sp.types[0]}`} aria-hidden="true" />}
          <span className={`sheet-portrait${caught ? "" : " locked"}`}>
            <Sprite
              id={id}
              variant={caught ? shown : null}
              className={`sheet-art${caught ? "" : " locked"}`}
            />
            {caught && <VariantFx key={`fx-${shown ?? "plain"}`} id={id} variant={shown} />}
          </span>
          <div className="sheet-id">
            <div className="sheet-no">#{String(id).padStart(3, "0")}</div>
            <h3 className="sheet-name">{seen ? label(sp) : "???"}</h3>
            {seen ? (
              <>
                <div className="sheet-genus">{caught ? sp.genus : "Seen, not caught"}</div>
                <div className="sheet-types">
                  {sp.types.map((t) => (
                    <span key={t} className={`type t-${t}`}>{t.toUpperCase()}</span>
                  ))}
                </div>
                {caught && (
                  <div className="dx-stats">
                    <span className="dx-ring" style={{ "--p": rLevel / RESEARCH_MAX }}
                      data-tip={`Research Lv ${rLevel} of ${RESEARCH_MAX}`}>
                      <b>{rLevel}</b>
                    </span>
                    <span><b>{heldCount}/{forms.length - 1}</b> forms</span>
                    <span><b>{owned}</b> owned</span>
                  </div>
                )}
              </>
            ) : (
              <div className="sheet-genus">No data recorded</div>
            )}
          </div>
          <button type="button" className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {caught ? (
          <>
            <div className="sheet-tabs" role="tablist" aria-label="Entry sections">
              {tabs.map(([t, name, badge]) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`dex-tab-${t}`}
                  data-tab={t}
                  aria-selected={current === t}
                  aria-controls="dex-panel"
                  tabIndex={current === t ? 0 : -1}
                  className={current === t ? "on" : ""}
                  onClick={() => choose(t)}
                  onKeyDown={onTabKey}
                >
                  <span>{name}</span>
                  {badge && <em>{badge}</em>}
                </button>
              ))}
            </div>

            <div className="sheet-body" role="tabpanel" id="dex-panel" aria-labelledby={`dex-tab-${current}`}>
              {current === "forms" && (
                <div className="sheet-forms">
                  <div className="sf-head">
                    <span>FORMS</span>
                    {/* WHAT THE STRIP IS FOR, AS A NUMBER. Every unheld cell used
                        to print the words "not yet" - seven times on a Kanto
                        entry, which is seven lines saying what a silhouette
                        already says. One count replaces all of them, and it says
                        the thing they never did: how close the rosette is, now
                        that it wants ANY four rather than every one. */}
                    {every ? (
                      <span className="sf-all">
                        <Mark tier="complete" size={14} /> COMPLETE
                      </span>
                    ) : (
                      <span className="sf-tally">
                        <b>{heldCount}<i>/{forms.length - 1}</i></b>
                        <em>{ROSETTE_NEED} for the rosette</em>
                      </span>
                    )}
                  </div>
                  <div className="sf-row">
                    {forms.map(([t, name, blurb]) => (
                      /* A held form is a BUTTON - it promotes itself to the
                         portrait. One you have not got stays a plain div: there is
                         nothing to show, and a control that does nothing is worse
                         than no control. */
                      <div
                        key={name}
                        /* The blurb is clamped to two lines, so the tooltip is
                           where the rest of a long one lives - the same reason the
                           shop's descriptions have one. */
                        data-tip={`${name} \u2014 ${blurb}${got(t) ? "" : " (not found yet)"}`}
                        className={`sf-one${got(t) ? " got" : ""}${
                          got(t) && t === shown ? " picked" : ""}`}
                        {...(got(t) ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-pressed": t === shown,
                          "aria-label": `Show the ${name} ${label(sp)}`,
                          onClick: () => setPicked(t),
                          onKeyDown: (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPicked(t);
                            }
                          },
                        } : {})}
                      >
                        <div className="sf-art">
                          {/* This strip is where someone comes to SEE what a
                              variant looks like, so every tier gets its real
                              treatment rather than the filter on its own. It was a
                              hand-rolled copy of the foil for Holo only - the same
                              duplicated-constant shape that lost Astral its art in
                              the evolution scene. `VariantFx` is the one list. */}
                          {/* AN UNHELD SHOWDOWN DRAWS THE ORDINARY SPRITE, and
                              this strip is the only place in the game that would
                              ever ask for a tier nobody owns.

                              Showdown is the single picture this repo does not
                              ship. It comes from PokeAPI's CDN, and the whole
                              argument for that is in Sprite.jsx: it is the rarest
                              tier, so a whole playthrough loads a handful. This
                              strip renders every tier a species can wear, so
                              opening ANY entry fetched a 67KB animated GIF in
                              order to paint it black - which makes that argument
                              untrue on a dex of 1,145.

                              Nothing is lost: a silhouette is a flat fill of the
                              outline. It also stops the odd one out in a grid
                              whose whole point is one creature nine ways - a
                              Showdown GIF is not framed on the 64px canvas every
                              other sprite is normalised to, so it drew visibly
                              larger than its eight neighbours. */}
                          <Sprite
                            id={id}
                            variant={t === "showdown" && !got(t) ? null : t}
                            alt={`${name} ${label(sp)}`}
                          />
                          <VariantFx id={id} variant={t} />
                          {/* A MARK ONLY APPEARS ON A CELL YOU HAVE EARNED, and
                              before this it appeared on all nine, greyed out.

                              Reported as four broken images - holo, glitched,
                              astral and showdown - and that is exactly what they
                              looked like. Those four marks are FILLED SOLIDS whose
                              identity is their colour: a rainbow hexagon, a blue
                              crystal, a purple bolt, a blue cone. `grayscale(1)`
                              at .35 opacity left four featureless grey blobs,
                              which is what a failed image load looks like. The
                              other four survived because their identity is a
                              SILHOUETTE - a ring, a four-point star, an eight-
                              point star, and Noir, which is achromatic already.

                              docs/decisions.md claims "the marks are shapes, not just
                              colours - these stay distinct in greyscale". That was
                              true of the four CSS shapes it was written about and
                              stopped being true the day the art became drawn.

                              Tuning the grey would only postpone it to the next
                              tier that is a coloured solid. The cell already names
                              its tier underneath in pixel type, so on an unheld
                              cell the mark was decoration that had to be
                              suppressed until it read as a fault. Gone - and the
                              badge now MEANS something: you own this one. */}
                          {t && got(t) && <Mark tier={t} size={12} className="sf-badge" />}
                        </div>
                        <span className="sf-name">{name}</span>
                        {/* THE BLURB SHOWS WHETHER OR NOT YOU HAVE IT. It only
                            appeared on held cells before, so the seven you are
                            hunting read "not yet" and the one you already had
                            explained itself - which is backwards. What a tier
                            LOOKS like is exactly what you want to know about one
                            you have not found. The silhouette is what says you
                            have not got it; it does not need saying twice. */}
                        <span className="sf-note">{blurb}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {current === "info" && (
                <div className="dx-board">
                  <section className="ev-card dx-notes">
                    <header className="ev-banner"><h4>Field notes</h4></header>
                    <p className="sheet-flavor">{sp.flavor}</p>
                    <dl className="sheet-facts">
                      <div><dt>Height</dt><dd>{(sp.height / 10).toFixed(1)} m</dd></div>
                      <div><dt>Weight</dt><dd>{(sp.weight / 10).toFixed(1)} kg</dd></div>
                      <div><dt>Catch rate</dt><dd>{sp.rate}</dd></div>
                      <div><dt>Gen</dt><dd>{genOf(id)}</dd></div>
                    </dl>
                  </section>
                  <section className={`ev-card dx-research${rLevel >= RESEARCH_MAX ? " live" : ""}`}>
                    <header className="ev-banner">
                      <Mark tier="research" size={18} />
                      <h4>Research</h4>
                      <span className={`ev-stamp${rLevel >= RESEARCH_MAX ? " live" : ""}`}>
                        {starred ? "★ STARRED" : `LV ${rLevel}/${RESEARCH_MAX}`}
                      </span>
                    </header>
                    <Research id={id} row={research} starred={starred} ordinary={ordinary} onStar={onStar} />
                  </section>
                  <section className="ev-card">
                    <header className="ev-banner"><h4>Evolution</h4></header>
                    <Line id={id} dexOf={dexOf} onSelect={onSelect} />
                  </section>
                  <section className="ev-card">
                    <header className="ev-banner"><h4>Where to look</h4></header>
                    <Where id={id} level={level} here={here} busy={busy} onTravel={onTravel} head={false} />
                  </section>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="sheet-body">
            <p className="sheet-locked">
              {seen ? "CATCH ONE TO FILL IN THIS ENTRY" : "NOT YET ENCOUNTERED"}
            </p>
            {/* A silhouette with no information is a locked door; a silhouette
                that tells you which map to walk is a lead. */}
            <Where id={id} level={level} here={here} busy={busy} onTravel={onTravel} />
          </div>
        )}

        <div className="sheet-actions">
          {/* Only when you actually hold one: a jump to an empty search answers
              "where is mine" with a blank list, which reads as a broken filter. */}
          {owned > 0 && onFindInBox && (
            <button
              className="sheet-inbox"
              onClick={() => onFindInBox(id)}
              data-tip={`Find your ${owned > 1 ? `${owned} ` : ""}${label(sp)} in the Box`}
            >
              SEE IN BOX{owned > 1 ? ` · ${owned}` : ""}
            </button>
          )}
          <button className="sheet-close" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}
