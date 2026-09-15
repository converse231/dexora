import { useEffect, useReducer, useRef, useState } from "react";
import { createEngine, VIEW_W, VIEW_H } from "./game/engine.js";
import { TILE } from "./game/tileset.js";
import TopBar from "./ui/TopBar.jsx";
import Rail from "./ui/Rail.jsx";
import Encounter from "./ui/Encounter.jsx";
import BallRail from "./ui/BallRail.jsx";
import { BALLS, FIELD, canRun, stepReward } from "./game/items.js";
import {
  biomeFor, levelFromXp, TIERS, originReady, dexIndex,
} from "./game/biomes.js";
import DexSheet from "./ui/DexSheet.jsx";
import { modalOpen } from "./ui/modal.js";
import Cheer from "./ui/Cheer.jsx";
import Types from "./ui/Types.jsx";
import Evolve from "./ui/Evolve.jsx";

/* One hotkey per ball, derived rather than typed. It was the literal "1234",
   which was right for four balls and silently wrong for eight: the rail prints
   `key 5` through `key 8` on the situational ones and nothing happened when you
   pressed them. `BallRail` numbers off `BALLS.indexOf`, so this has to as well
   or the label and the key disagree - and check.mjs holds BALLS to nine, which
   is as many as single digits can address. */
const BALL_KEYS = BALLS.map((_, i) => String(i + 1));

const KEYS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right",
};

/* Whether the ball rail is expanded is a preference, not game state, so it
   lives beside the save rather than in it - and it has to survive a reload, or
   collapsing it is a chore you redo every session. */
// How long a floating counter change stays up. Matches `delta-fly` in the CSS.
const LIFE = 1200;

const RAIL_KEY = "meadow-route:balls";
const readRail = () => {
  try { return localStorage.getItem(RAIL_KEY) !== "0"; } catch { return true; }
};

/* The keyboard listeners are on `window`, so they fire wherever focus is - and
   the Dex and Box both have a search field. Typing "pidgey" walked the trainer
   two tiles left and one down, "b" got on the bicycle, "f" cast a rod into the
   grass, and holding shift for a capital broke into a run. Encounters would
   start while you were trying to look something up.

   So: if the keystroke belongs to a text field, it is not a game input. */
const typing = (ev) => {
  const el = ev.target;
  if (!el || el === document.body) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  );
};

/* Which tier's portrait a dex entry should wear: the best one registered.
   `TIERS` is rarest first and comes from `biomes.js`, so this agrees with the
   roll, the Box and the Dex by construction rather than by four files
   happening to have been edited on the same day. */
const rarestOf = (st, id) => TIERS.find((t) => st?.[t]?.[dexIndex(id)]) ?? null;

const DPAD = [
  { dir: "up", glyph: "▲", label: "Walk up" },
  { dir: "left", glyph: "◀", label: "Walk left" },
  { dir: "down", glyph: "▼", label: "Walk down" },
  { dir: "right", glyph: "▶", label: "Walk right" },
];

export default function App() {
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const [engine, setEngine] = useState(null);
  const [, force] = useReducer((n) => n + 1, 0);
  const [entry, setEntry] = useState(null);
  /* "See in Box" crosses two components that do not know each other: the sheet
     lives here and the tab lives in the Rail. A species id parked here is the
     smallest thing that can travel between them, and the Rail clears it once it
     has acted so pressing the button twice works twice. */
  const [boxJump, setBoxJump] = useState(null);
  // The key handler is installed once, so it reads the open entry from a ref
  // rather than closing over stale state.
  const entryRef = useRef(null);
  entryRef.current = entry;

  const [ballsOpen, setBallsOpen] = useState(readRail);
  const toggleBalls = () => {
    const next = !ballsOpen;
    setBallsOpen(next);
    try { localStorage.setItem(RAIL_KEY, next ? "1" : "0"); } catch { /* private mode */ }
  };

  useEffect(() => {
    const e = createEngine(canvasRef.current, force, miniRef.current);
    setEngine(e);

    const down = (ev) => {
      if (typing(ev)) return;                // a search box has the keyboard
      if (entryRef.current !== null) return; // dex sheet has the keyboard
      if (modalOpen()) return;               // so does any confirm dialog
      if (e.state.evolution) return;         // so does the evolution scene
      const enc = e.state.encounter;
      if (enc) {
        // During an encounter the keyboard drives the encounter, not walking.
        if (["throw", "suck", "drop", "wait", "shake"].includes(enc.phase)) {
          ev.preventDefault();
          e.skip();
        } else if (enc.phase === "idle" && (ev.key === " " || ev.key === "Enter")) {
          ev.preventDefault();
          // Space throws whatever you actually have, cheapest first.
          const ball = BALLS.find((b) => e.state.bag[b.id] > 0);
          if (ball) e.throwBall(ball.id);
        } else if (enc.phase === "idle" && BALL_KEYS.includes(ev.key)) {
          ev.preventDefault();
          const pick = BALLS[Number(ev.key) - 1];
          if (pick) e.throwBall(pick.id);
        /* R for run, as well as Escape. Escape is the correct key for
           "dismiss this" and stays; R is the one a hand already on WASD can
           reach without looking, and it is what the word on the button says.
           `r` is not a movement key and not taken by fishing (F) or the bike
           (B), so nothing had to move to make room. */
        } else if (enc.phase === "idle"
                   && (ev.key === "Escape" || ev.key === "r" || ev.key === "R")) {
          ev.preventDefault();
          e.flee();
        }
        return;
      }

      // A line is out: the cast owns the next second and a half.
      if (e.state.fishing) return;

      // Out on the map: cast a rod, or get on and off the bike.
      if (ev.key === "f" || ev.key === "F") {
        ev.preventDefault();
        e.fish();
        return;
      }
      if (ev.key === "b" || ev.key === "B") {
        ev.preventDefault();
        e.toggleBike();
        return;
      }

      if (ev.key === "Shift") { e.setRunning(true); return; }

      const dir = KEYS[ev.key];
      if (!dir) return;
      ev.preventDefault();
      e.press(dir);
    };
    /* Releases are NOT gated on `typing`, deliberately: releasing a key that
       was never pressed is a no-op, but missing a release because focus moved
       into a field mid-stride leaves the trainer walking on his own. */
    const up = (ev) => {
      if (ev.key === "Shift") e.setRunning(false);
      const dir = KEYS[ev.key];
      if (dir) e.release(dir);
    };
    const blur = () => {
      e.clearHeld();      // don't keep walking after a tab switch
      e.setRunning(false); // ...or keep running
    };

    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", blur);
      e.destroy();
    };
  }, []);

  const st = engine?.state;
  const enc = st?.encounter ?? null;
  const evo = st?.evolution ?? null;
  const fishing = st?.fishing ?? null;
  const cheer = st?.cheers?.[0] ?? null;
  /* Recomputed every render rather than stored: it depends on which way you are
     facing, and every step already re-renders. */
  const rod = engine && !enc && !evo && !fishing ? engine.castable() : null;

  // Announce a genuinely new species, once, when the ball actually clicks shut.
  /* Money is the clearest signal the game has that something worked, so a
     change to it is announced on the counter itself rather than in a corner. */
  const money = st?.money;
  const prevMoney = useRef(null);
  const [deltas, setDeltas] = useState([]);
  useEffect(() => {
    if (money == null) return;
    const before = prevMoney.current;
    prevMoney.current = money;
    if (before == null || before === money) return;
    /* Pruned on the way in, not only by a timer. The timer was being cancelled
       by this effect's own cleanup the next time money changed - so every
       delta but the last one stayed on screen for the rest of the session,
       stacked on the same spot, and the array grew all session with it. Sell
       twice in a second and you could watch it happen.

       Filtering by age on each insert makes it self-healing; the timer is only
       there to clear the final one when nothing else follows. */
    const now = Date.now();
    const entry = { id: `${now}-${Math.random()}`, amount: money - before, at: now };
    setDeltas((all) => [...all.filter((d) => now - d.at < LIFE), entry]);
    const t = setTimeout(
      () => setDeltas((all) => all.filter((d) => d.id !== entry.id)),
      LIFE
    );
    return () => clearTimeout(t);
  }, [money]);

  const caught = st ? st.dex.filter((v) => v === 2).length : 0;
  const level = levelFromXp(st?.xp ?? 0);
  const biome = biomeFor(st?.areaId);

  return (
    <div className="app">
      {/* Above every other overlay: it can land during an encounter or an
          evolution, and both of those already own the middle of the screen. */}
      {cheer && <Cheer cheer={cheer} onDone={() => engine.dropCheer()} />}

      <TopBar
        caught={caught}
        total={st?.caught ?? 0}
        steps={st?.steps ?? 0}
        money={st?.money ?? 0}
        candy={st?.candy ?? 0}
        deltas={deltas}
        xp={st?.xp ?? 0}
        onReset={() => engine?.reset()}
      />

      <div className="stage">
        <div className="screen">
          <div className="viewport">
            <canvas
              ref={canvasRef}
              width={VIEW_W * TILE * 2}
              height={VIEW_H * TILE * 2}
              aria-label="The route. Walk with the arrow keys; Pokémon appear anywhere you can walk."
            />
            {/* Where you are, at a glance. Hidden the moment anything takes
                over the screen: during an encounter the question is which
                ball, not which corner of the map, and a camera box tracking a
                player who cannot move is noise.

                HIDDEN, not unmounted. The engine is handed this canvas once,
                at `createEngine`, and holds the element - so unmounting it
                would hand the engine a detached canvas and every minimap
                after the first encounter would be a dead grey box. A class is
                the whole fix; the engine goes on drawing to it, which costs
                one `drawImage` nobody sees. */}
            {/* No caption. It carried the area name for one build, and the
                area name is the string ALREADY on screen in the biome tag
                eight tiles above it - identical for all eight areas, checked
                rather than assumed. The tag says where you are; this says
                where in it, and saying the first thing twice was the only
                thing on it that was not information. */}
            {/* A RUNNING EFFECT IS SPENT IN STEPS, so it is counted down
                where the steps happen rather than on the shelf that sold it.
                Nothing is drawn when nothing is running - a readout that is
                always there saying "no" is a readout nobody reads - and it
                hides with the minimap for an encounter, because the count
                cannot move while you are not walking. */}
            {!enc && !evo && FIELD.some((f) => (st?.field?.[f.id] ?? 0) > 0) && (
              <div className="fieldbox" role="status">
                {FIELD.filter((f) => (st?.field?.[f.id] ?? 0) > 0).map((f) => (
                  <span key={f.id} title={`${f.name}: ${st.field[f.id]} steps left`}>
                    <img src={`items/${f.id}.png`} alt={f.name} />
                    {st.field[f.id]}
                  </span>
                ))}
              </div>
            )}

            <div className={`minimap${enc || evo ? " gone" : ""}`}>
              <canvas ref={miniRef} aria-hidden="true" />
            </div>

            {/* Above the battle overlay, so it is the one control that never
                leaves: a bag readout while walking, the throw buttons once
                something appears. Hidden only for the evolution scene, which
                owns the whole screen. */}
            {!evo && (
              <BallRail
                bag={st?.bag}
                /* The rail prices each ball against what is standing there,
                   so it needs the encounter, not just the bag. */
                enc={enc}
                open={ballsOpen}
                onToggle={toggleBalls}
                pinned={Boolean(enc)}
                onThrow={
                  enc?.phase === "idle" ? (id) => engine.throwBall(id) : null
                }
              />
            )}

            {/* What the cast is doing. The float on the water carries the
                waiting; this says how it ended, because "nothing happened" has
                to be said out loud or it reads as a bug. */}
            {fishing && (
              <div className={`castbox ${fishing.phase}`} role="status">
                <b>{fishing.name}</b>
                <span>
                  {fishing.phase === "bite"
                    ? "Oh! A bite!"
                    : fishing.phase === "miss"
                      ? "Not even a nibble\u2026"
                      : "\u2026"}
                </span>
              </div>
            )}

            {biome && !enc && (
              <div className="biome-tag">
                <span>{biome.name}</span>
                <Types of={biome.types} />
              </div>
            )}

            {evo && (
              <Evolve evo={evo} onDone={() => engine.closeEvolution()} />
            )}

            {enc && (
              <Encounter
                enc={enc}
                bag={st?.bag}
                onFlee={() => engine.flee()}
                onSkip={() => engine.skip()}
              />
            )}
          </div>

          {rod ? (
            /* A button, not a caption: the keyboard has F but a touch player
               had no way to cast at all. */
            <button className="hint hint-act" onClick={() => engine.fish()}>
              <b>{rod.name}</b> ready — <kbd>F</kbd> to cast
            </button>
          ) : (
            <div className="hint">
              ARROW KEYS OR WASD TO WALK · ANYWHERE CAN SPAWN
              {st?.biking && <> · <b>RIDING</b> <kbd>B</kbd></>}
              {!st?.biking && canRun(level, st?.bag) && (
                <> · <b className={st?.running ? "lit" : ""}>RUN</b> <kbd>SHIFT</kbd></>
              )}
            </div>
          )}

          <div className="dpad">
            {DPAD.map(({ dir, glyph, label }) => (
              <button
                key={dir}
                className={`dpad-${dir}`}
                aria-label={label}
                onPointerDown={(ev) => { ev.preventDefault(); engine?.press(dir); }}
                onPointerUp={() => engine?.release(dir)}
                onPointerLeave={() => engine?.release(dir)}
                onPointerCancel={() => engine?.release(dir)}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>

        <Rail
          state={st}
          caught={caught}
          level={level}
          busy={!!enc || !!evo}
          onTravel={(id) => engine.travel(id)}
          onSelect={setEntry}
          onSell={(uids) => engine.sell(uids)}
          onConvert={(uids) => engine.convert(uids)}
          onLevelUp={(uid, n) => engine.levelUp(uid, n)}
          onBuy={(id, n) => engine.buy(id, n)}
          onBuyCandy={(n) => engine.buyCandy(n)}
          onEvolve={(uid, to) => engine.evolve(uid, to)}
          onUseField={(id) => engine.useField(id)}
          daily={engine?.daily?.()}
          onClaimDaily={() => engine.claimDaily()}
          jumpTo={boxJump}
          onJumped={() => setBoxJump(null)}
          onSpend={(id) => engine.spend(id)}
          onBike={() => engine.toggleBike()}
          /* The three save-file calls, handed over as one object so the panel
             does not need the engine itself. */
          save={engine && {
            read: () => engine.exportSave(),
            inspect: (obj) => engine.inspectSave(obj),
            write: (obj) => engine.importSave(obj),
          }}
        />
      </div>

      {entry !== null && (
        <DexSheet
          id={entry}
          state={st?.dex[dexIndex(entry)] ?? 0}
          variant={rarestOf(st, entry)}
          /* Which variants of THIS species are registered. Built from the
             list so the sheet grows a column when a tier is added and nothing
             here has to be remembered. */
          /* `dexIndex`, not `entry - 1`. The sweep that replaced every id-as-
             index missed this one, so a Johto or Sinnoh entry read its variant
             marks out of whichever species happens to sit at that POSITION -
             Arceus' row answering for Chikorita. */
          held={Object.fromEntries(
            TIERS.map((t) => [t, !!st?.[t]?.[dexIndex(entry)]]))}
          /* So the sheet can say "finish the dex" rather than "not yet" for a
             variant that cannot currently spawn at all. */
          originLocked={!originReady(st?.dex, entry)}
          owned={st?.box?.filter((m) => m.species === entry).length ?? 0}
          onFindInBox={(id) => { setBoxJump(id); setEntry(null); }}
          onClose={() => setEntry(null)}
        />
      )}

    </div>
  );
}
