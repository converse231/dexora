/* A DATED EVENT ON SCREEN (eventforms.js, events.js): the announcement that
   opens by itself once per event on each device (`SeasonIntro`), and its card
   on the Events board (`SeasonCard`) - the looks you hold, the days left, the
   claim. Every number is the live constant: the odds, the night, the honey's
   lure and the ball's catch.

   A dialog and not a banner (asked for, 2026-10-19: "so players won't miss
   it"): the event is a fortnight long and a banner is two seconds.

   AND IT COUNTS DOWN (asked for, 2026-10-20: "so the users will get hyped"):
   in the `TEASE_DAYS` before it opens the same dialog, card and map chip say
   when it starts, ticking; while it runs, when it ends. Each countdown is its
   own small component with its own second's clock, so nothing else - App
   least of all - renders once a second for it. */
import { useEffect, useRef, useState } from "react";
import Sprite from "./Sprite.jsx";
import { DRIFT_LEFT } from "../data/drift.js";
import { useModalLock, useDismiss } from "./modal.js";
import { label, AREAS } from "../game/map.js";
import { speciesById, foundIn, dexIndex } from "../game/biomes.js";
import { eventShelf } from "../game/items.js";
import { shelfOf, eventAfter,
  eventOn, eventSoon, eventOpens, eventCloses, eventDaysLeft, eventHeld, eventDone, huntDue, huntNeed, huntWords,
  shareOf, EVENT_NIGHT, EVENT_PACKS, roamAreas,
} from "../game/events.js";

/* Seen per device, never the save - the teaser and the opening are two
   announcements, so each is seen once. The count of looks is in the key: a
   second wave of costumes (Hallowed Night's, 2026-10-24) is announced again to
   a device that saw the first. */
const driftUrl = (id) => new URL(`events/drift/${id}.png`, document.baseURI).href;
const SEEN = (ev, soon) => `dexora-event-seen:${ev.id}${soon ? ":soon" : ""}:${ev.looks.length}`;
const isSoon = (ev) => eventOn()?.id !== ev.id && eventOpens(ev) > Date.now();
export const seasonUnseen = (ev) => {
  try { return !!ev && localStorage.getItem(SEEN(ev, isSoon(ev))) !== "1"; } catch { return false; }
};
const markSeen = (ev) => {
  try { localStorage.setItem(SEEN(ev, isSoon(ev)), "1"); } catch { /* nothing to remember with */ }
};

// The time now, a second at a time, for this component alone.
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
const parts = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
};
// "3d 14h", "5h 20m", "4m 09s": the two biggest units, for a chip.
export const shortLeft = (ms) => {
  const [d, h, m, s] = parts(ms);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
};

/* THE COUNTDOWN: days, hours, minutes and seconds as four tiles, the
   seconds ticking. `to` is an instant; at it the tiles rest on zero and the
   page's next render finds the event open (or over). */
export function Countdown({ to, label: says }) {
  const now = useNow();
  const [d, h, m, s] = parts(to - now);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div className="sn-count" role="timer" aria-label={`${says} ${d} days ${h} hours ${m} minutes`}>
      <span className="sn-count-says">{says}</span>
      <span className="sn-count-tiles">
        {[[d, "days"], [pad(h), "hrs"], [pad(m), "min"], [pad(s), "sec"]].map(([v, u]) => (
          <span key={u} className={`sn-tile${u === "sec" ? " tick" : ""}`}>
            <b key={u === "sec" ? v : undefined}>{v}</b><i>{u}</i>
          </span>
        ))}
      </span>
    </div>
  );
}

/* THE MAP'S CHIP, in the HUD's tasks: the event's name and how long until
   it opens or closes; a tap opens its dialog. Its own clock, a minute's
   worth of change at most once a second. */
export function SeasonChip({ ev, onOpen }) {
  const now = useNow();
  const soon = eventOpens(ev) > now;
  const left = (soon ? eventOpens(ev) : eventCloses(ev)) - now;
  return (
    <button type="button" className="ms-tab ready dc-pill sn-pill" onClick={onOpen}
      data-tip={soon ? `${ev.name} starts in ${shortLeft(left)}` : `${ev.name} ends in ${shortLeft(left)}`}>
      <span className="ms-ic sn-pill-ic" aria-hidden="true">{ev.emblem ?? "🎃"}</span>
      <i>{ev.name.toUpperCase()}</i>
      <b>{soon ? "Starts" : "Ends"} {shortLeft(left)}<em className="ms-dot" aria-hidden="true">{shortLeft(left).split(" ")[0]}</em></b>
    </button>
  );
}

// "24 Oct - 7 Nov", from the event's own days.
const day = (k) => new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8))
  .toLocaleDateString(undefined, { day: "numeric", month: "short" });

/* The looks by line: a look's line is the species it dresses and the looks
   its event drew of the stages above (Witch Hat Gastly, Haunter, Gengar). */
function lines(ev) {
  const dressed = new Set(ev.looks.map((l) => speciesById(l.of).name));
  const firsts = ev.looks.filter((l) => !dressed.has(speciesById(l.of).from));
  return firsts.map((first) => {
    const line = [first];
    for (let at = first; ;) {
      const next = ev.looks.find((l) => speciesById(l.of).from === speciesById(at.of).name);
      if (!next) break;
      line.push(next);
      at = next;
    }
    // Where the first stage is met, which is where the costume starts - a roaming look's own maps.
    const where = (ev.roam ? roamAreas(first) : foundIn(first.of).areas).slice(0, 2).map((a) => a.name);
    return { line, where };
  });
}

/* THE HUNT'S TALLY: a tiny Poke Ball for every costume caught, a faint
   empty slot for each still to go (2026-10-30, asked for: the old discs went
   dark when caught, so a full row read as empty). */
function Moons({ n, of, says }) {
  return (
    <span className="sn-moons" role="img" aria-label={`${n} of ${of} ${says}`}>
      {Array.from({ length: of }, (_, k) => <i key={k} className={k < n ? "got" : ""} />)}
    </span>
  );
}

export function SeasonIntro({ ev, dex, onClose, onBoard, onNext }) {
  useModalLock();
  /* FOCUS WITHOUT SCROLLING: `autoFocus` scrolled a phone's card to its foot,
     past the lineup and the close button (found in QA, 2026-10-19). */
  const go = useRef(null);
  useEffect(() => { go.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    markSeen(ev);
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [ev, onClose]);
  const left = eventDaysLeft(ev);
  const live = eventOn()?.id === ev.id;
  const soon = isSoon(ev);
  const held = eventHeld(ev, dex);
  const [ball, honey] = [eventShelf(shelfOf(ev)).find((i) => i.bonus), eventShelf(shelfOf(ev)).find((i) => i.lure)];
  // THE NEXT WEEK, announced inside this one's poster while it runs (asked for, 2026-10-28).
  const next = live ? eventAfter(ev) : null;
  const cards = ev.looks.filter((l) => l.card).length;

  return (
    <div className="sheet sn-sheet" {...useDismiss(onClose)}>
      <div className={`sn-card ev-${ev.id}`} role="dialog" aria-modal="true" aria-labelledby="sn-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="sn-sky" aria-hidden="true">
          <i className="sn-moon" />
          <i className="sn-fog a" /><i className="sn-fog b" />
          {/* ITS POKEMON, where an event names them (`drift`): the Arena's own PMD walks
              (npm run drift), crisp at native pixels; the rest of the sky its bats. */}
          {[0, 1, 2, 3, 4].map((k) => {
            const id = ev.drift?.[k];
            if (!id) return <i key={k} className={`sn-bat b${k}`} />;
            // The second and fifth lanes fly leftward - but only in PMD's own left-facing walk, never a mirror.
            const left = (k === 1 || k === 4) && DRIFT_LEFT.includes(id);
            return <img key={k} className={`sn-bat sn-drift b${k}${left ? " left" : ""}`} src={driftUrl(left ? `${id}-l` : id)} alt="" />;
          })}
        </div>
        <button type="button" className="set-x sn-x" aria-label="Close" onClick={onClose}>✕</button>
        <span className="sn-kicker">{soon ? "Coming soon" : "Limited-time event"} · {day(ev.start)} – {day(ev.end)}</span>
        <h2 id="sn-title" className="sn-title">{ev.name}</h2>
        {ev.lore && <p className="sn-lore">{ev.lore}</p>}
        {(soon || live) && <Countdown to={soon ? eventOpens(ev) : eventCloses(ev)} label={soon ? "Starts in" : "Ends in"} />}
        <p className="sn-lede">
          {ev.roam ? (soon
            ? <>From {day(ev.start)}, Pikachu in ponchos turn up on every map - each where its poncho's Pokémon would live. One week only.</>
            : <>Pikachu in ponchos are out on every map! For {live ? (left === 1 ? "one last day" : `${left} more days`) : "a week"},
              {" "}each turns up where its poncho's Pokémon would live - and only then.</>)
            : soon
            ? <>Pokémon are coming out in costume! From {day(ev.start)}, any of these can turn up where its species lives - for one week only.</>
            : <>Pokémon are out in costume! For {live ? (left === 1 ? "one last day" : `${left} more days`) : "a week"},
              {" "}any of these can turn up where its species lives - and only then.</>}
        </p>

        {/* THE POSTER KEEPS THE SECRET (2026-10-26, asked for): a costume is a
            dark silhouette until you catch it - the names say what to hunt, the
            art is the reward. */}
        {lines(ev).some(({ line }) => line.length > 1) && <h3 className="sn-sub">{ev.evolves === false ? "Whole lines in costume · catch each" : "Evolve in costume"}</h3>}
        <div className="sn-lineup">
          {lines(ev).filter(({ line }) => line.length > 1).map(({ line, where }) => (
            <section key={line[0].id} className="sn-line">
              <div className="sn-mons">
                {line.map((l, k) => (
                  /* A look alone in its line is drawn bigger: it has the
                     room, and Mimikyu's art fills a third of its 96px canvas. */
                  <span key={l.id} className={`sn-mon${line.length === 1 ? " solo" : ""}${dex?.[dexIndex(l.id)] === 2 ? "" : " sn-dark"}`} style={{ "--k": k }}>
                    <Sprite id={l.id} alt={l.title} eager />
                    {dex?.[dexIndex(l.id)] === 2 && <i className="sn-got" aria-label="caught">✓</i>}
                  </span>
                ))}
              </div>
              <b>{line.length > 1 ? `${line[0].title.split(" ").slice(0, -1).join(" ")} line` : line[0].title}</b>
              <small>{where.length ? `Where ${label(speciesById(line[0].of))} lives: ${where.join(", ")}` : ""}</small>
            </section>
          ))}
        </div>
        {/* ONE OF A KIND: no costumed next stage, so each is a catch of its own -
            fourteen sections ran the dialog four screens long, so a grid. */}
        <h3 className="sn-sub">{ev.roam ? `${ev.looks.length} ponchos · catch each` : "One of a kind · catch each"}</h3>
        <div className="sn-solos">
          {lines(ev).filter(({ line }) => line.length === 1).map(({ line: [l], where }) => (
            <section key={l.id} className="sn-solo">
              <span className={`sn-mon${dex?.[dexIndex(l.id)] === 2 ? "" : " sn-dark"}`} style={{ "--k": l.id % 4 }}>
                <Sprite id={l.id} alt={l.title} eager />
                {dex?.[dexIndex(l.id)] === 2 && <i className="sn-got" aria-label="caught">✓</i>}
              </span>
              <b>{l.title}</b>
              <small>{l.rare < 1 ? <em className="sn-rare">Rare</em> : null}{where[0] ?? ""}{l.card && <em className="sn-card-tag" data-tip="Its real promo card is yours on the first catch">CARD</em>}</small>
            </section>
          ))}
        </div>

        {ev.hunt && (
          <section className="sn-hunt">
            <span className="sn-mon solo sn-shade"><Sprite id={ev.hunt.id} alt="" eager /></span>
            <span>
              <b>{ev.hunt.name}</b>
              Catch any {ev.hunt.dreams} costumed Pokémon of this event (repeats count). Then walk in
              {" "}{AREAS[ev.hunt.area]?.name} - the first Pokémon you meet there is it. Once you have
              {" "}met it, {ev.hunt.again} more costumes bring it back.
            </span>
          </section>
        )}

        <ul className="sn-how">
          {ev.daytime
            ? <li><em>🌞</em><span><b>{EVENT_NIGHT}× by day</b>The costumes come out in daylight.</span></li>
            : <li><em>🌙</em><span><b>{EVENT_NIGHT}× after dark</b>The costumes come out at night.</span></li>}
          {ev.roam
            ? <li><em>{ev.emblem}</em><span><b>1 meeting in {Math.round(1 / shareOf(ev))}</b>A poncho turns up on any map that matches its Pokémon's type.</span></li>
            : <li><em>{ev.emblem ?? "🎃"}</em><span><b>1 in {Math.round(1 / shareOf(ev))} wear one</b>{ev.evolves === false ? "Every stage is its own catch - the big ones turn up where their line starts." : "A line evolves in costume; the rest, catch each one."}</span></li>}
          {cards > 0 && <li><em>🃏</em><span><b>{cards} real promo cards</b>Catch a poncho marked CARD and its real promo card is yours, once.</span></li>}
          {honey && <li><em>🍯</em><span><b>{honey.name}</b>{honey.lure}× as likely for {honey.steps} steps.</span></li>}
          {ball && <li><em>🔮</em><span><b>{ball.name}</b>{ball.boost}× catch on costumed ones.</span></li>}
          <li><em>✨</em><span><b>Rare forms too</b>Shiny, Gold, Diamond and more can wear the costume.</span></li>
          <li><em>🏆</em><span><b>Catch all {ev.looks.length}{ev.hunt ? ` and ${ev.hunt.title.split(" ").pop()}` : ""}</b>The {ev.title} title and {EVENT_PACKS === 1 ? "a card pack" : `${EVENT_PACKS} card packs`}.</span></li>
        </ul>

        {next && (
          <button type="button" className="sn-next" onClick={() => onNext?.(next)}>
            <b>Next week: {next.emblem} {next.name}</b> · from {day(next.start)}<i aria-hidden="true">Preview ›</i>
          </button>
        )}

        <div className="sn-foot">
          <span className="sn-held">{soon ? `Opens ${day(ev.start)}` : `${held} / ${ev.looks.length} caught`}</span>
          <button ref={go} type="button" className="ci-go sn-go" onClick={onClose}>{soon ? "I'll be ready" : "Start the hunt"}</button>
          {onBoard && <button type="button" className="sn-board" onClick={onBoard}>Event board ›</button>}
        </div>
      </div>
    </div>
  );
}

/* THE BOARD'S CARD, first while the event runs, and after it while its
   claim waits. Each look is drawn when held and a shadow until then; a tap
   opens its Dex entry. */
export function SeasonCard({ ev, dex, medals = [], dreams = {}, onSelect, onClaim, onIntro }) {
  const live = eventOn()?.id === ev.id;
  const soon = isSoon(ev);
  const held = eventHeld(ev, dex);
  const done = medals.includes(`event:${ev.id}`);
  const due = eventDone(ev, dex, medals) && !done;
  const left = eventDaysLeft(ev);
  const next = eventAfter(ev);
  return (
    <section className={`ev-card sn-board-card ev-${ev.id}${live || due || soon ? " live" : ""}`}>
      <header className="ev-banner">
        <span className="sn-emblem" aria-hidden="true">{ev.emblem ?? "🎃"}</span>
        <h4>{ev.name}</h4>
        <span className={`ev-stamp${live || due || soon ? " live" : ""}`}>
          {due ? "CLAIM!" : soon ? "SOON" : live ? (left === 1 ? "LAST DAY" : `${left} DAYS`) : "OVER"}
        </span>
      </header>
      {(soon || live) && <Countdown to={soon ? eventOpens(ev) : eventCloses(ev)} label={soon ? "Starts in" : "Ends in"} />}
      <div className="sn-row">
        {ev.looks.map((l) => {
          const got = dex?.[dexIndex(l.id)] === 2;
          return (
            <button key={l.id} type="button" className={`sn-slot${got ? " got" : ""}`}
              data-tip={got ? l.title : "Not caught yet"} aria-label={got ? l.title : "Not caught yet"}
              onClick={() => onSelect(l.id)}>
              <Sprite id={l.id} alt="" />
            </button>
          );
        })}
      </div>
      {ev.hunt && (() => {
        const won = medals.includes(`event:${ev.hunt.medal}`);
        const n = dreams[ev.id] ?? 0, need = huntNeed(dreams, ev), met = Boolean(dreams[`${ev.id}+`]);
        const due = !!huntDue(dreams) && live;
        return (
          <div className={`sn-hunt-row${due ? " due" : ""}`}>
            <button type="button" className={`sn-slot${won ? " got" : ""}`} data-tip={won ? ev.hunt.title : "???"}
              aria-label={won ? ev.hunt.title : "Not caught yet"} onClick={() => onSelect(ev.hunt.id)}>
              <Sprite id={ev.hunt.id} alt="" />
            </button>
            <span>
              <b>{won ? `${ev.hunt.name} ✓` : due ? huntWords(ev.hunt).due : ev.hunt.name}</b>
              <small>{due ? `Walk in ${AREAS[ev.hunt.area]?.name} - your next meeting there`
                : `Catch ${need - n} more costumed Pokémon to call it${met ? " back" : ""} (${n} of ${need})`}</small>
            </span>
            {(!won || live) && <Moons n={n} of={need} says={huntWords(ev.hunt).tokens} />}
          </div>
        );
      })()}
      <div className="ev-meta">
        <span>{held} of {ev.looks.length} caught</span>
        <span>{done ? `${ev.title} ✓` : `All ${ev.looks.length}${ev.hunt ? ` + ${ev.hunt.title.split(" ").pop()}` : ""}: the ${ev.title} title`}</span>
      </div>
      {/* THE NEXT WEEK, while this one runs (eventAfter): new costumes are coming. */}
      {/* A button: the next week's poster, its costumes still silhouettes. */}
      {live && next && (
        <button type="button" className="sn-next" onClick={() => onIntro?.(next)}>
          <b>Next: {next.name}</b> · new costumes and a new legendary, from {day(next.start)}<i aria-hidden="true">Preview ›</i>
        </button>
      )}
      {due
        ? <button type="button" className="ev-go" onClick={onClaim}>Claim {ev.title} ›</button>
        : (live || soon) && <button type="button" className="ev-go" onClick={() => onIntro?.()}>{soon ? "Preview the event ›" : "About the event ›"}</button>}
    </section>
  );
}

/* The events to put on the board: the one running (or about to open), then
   every other whose claim waits - a week that ended finished must not lose
   its Claim to the next week's card. */
export const boardSeasons = (EVENTS, dex, medals = []) => {
  const now = eventOn() ?? eventSoon();
  return [now, ...EVENTS.filter((ev) => ev !== now && eventDone(ev, dex, medals) && !medals.includes(`event:${ev.id}`))].filter(Boolean);
};
