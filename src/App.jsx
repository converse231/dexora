import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createEngine, VIEW_W, VIEW_H } from "./game/engine.js";
import { TILE } from "./game/tileset.js";
import TopBar from "./ui/TopBar.jsx";
import Tip from "./ui/Tip.jsx";
import { phaseAt, timeLabel } from "./game/clock.js";
import Rail from "./ui/Rail.jsx";
import { RAIL_KEY, ORDER_KEY, read, write } from "./game/store.js";
import Pad from "./ui/Pad.jsx";
import Hint from "./ui/Hint.jsx";
import Confirm from "./ui/Confirm.jsx";
import Settings from "./ui/Settings.jsx";
import Help from "./ui/Help.jsx";
import Variants from "./ui/Variants.jsx";
import Bag from "./ui/Bag.jsx";
import Encounter from "./ui/Encounter.jsx";
import BallRail from "./ui/BallRail.jsx";
import {
  BALLS, FAMILIES, fieldById, stepReward, ballOrder, promoteBall, defaultBall,
} from "./game/items.js";
import { ItemIcon } from "./ui/Sprite.jsx";
import {
  biomeFor, levelFromXp, TIERS, dexIndex,
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
/* One hotkey per ball, derived rather than typed - see the note that was
   here: the literal "1234" was right for four balls and silently wrong for
   eight. WHICH ball each one throws is the player's, and lives in
   `ballOrder`. */
/* How long the "wore off" card stays. Shorter than a cheer's 3200ms, because
   there is nothing to read but two words and nothing to do about it. */
const WORN_HOLD = 2600;

const BALL_KEYS = BALLS.map((_, i) => String(i + 1));

/* The arranged order, read once and kept in state so a promotion re-renders
   the rail. Parsed defensively for the reason `ballOrder` filters: this is a
   `localStorage` string and a bad one must cost nothing. */
const readOrder = () => {
  try {
    const raw = JSON.parse(read(ORDER_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

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

const readRail = () => read(RAIL_KEY) !== "0";

/* The keyboard listeners are on `window`, so they fire wherever focus is - and
   the Dex and Box both have a search field. Typing "pidgey" walked the trainer
   two tiles left and one down, "f" cast a rod into the grass, and holding
   shift for a capital broke into a run. Encounters would start while you were
   trying to look something up.

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

export default function App({
  onLogOut = null, onEngine = null, trainerName = null, account = null,
}) {
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const [engine, setEngine] = useState(null);

  /* STABLE, BECAUSE A MEMO CANNOT SEE PAST A NEW FUNCTION.

     These were inline arrows on the `<Rail>` element, so every render of `App`
     handed the Box four brand-new props - and `App` renders on every STEP.
     `colRev` had already stopped the Box's heavy grouping memo recomputing,
     which is why the first pass helped and did not fix it: the component
     itself still re-rendered seven times a second, re-filtering and
     re-SORTING its rows (the name sort calls `label(speciesById(...))` per
     comparison) and rebuilding every row's sprite.

     `memo(Box)` is what stops that, and `memo` compares props by identity -
     so one inline arrow anywhere in the list defeats the whole thing. They
     close over `engine`, which is `useState` and set exactly once, so the
     dependency is honest rather than a lie told to the linter. */
  const onSell = useCallback((uids) => engine?.sell(uids), [engine]);
  const onConvert = useCallback((uids) => engine?.convert(uids), [engine]);
  const onLevelUp = useCallback((uid, n) => engine?.levelUp(uid, n), [engine]);
  const onEvolve = useCallback((uid, to) => engine?.evolve(uid, to), [engine]);
  const onJumped = useCallback(() => setBoxJump(null), []);
  const [, force] = useReducer((n) => n + 1, 0);
  const [entry, setEntry] = useState(null);
  /* LOGGING OUT ASKS FIRST. It is not destructive - the account keeps the save
     - but it does end the session and wipe this browser's copy, and it sits one
     slip away from the stat buttons. The dialog also carries the one fact worth
     knowing before leaving: whether everything reached the server. */
  const [leaving, setLeaving] = useState(false);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [forms, setForms] = useState(false);
  /* THE TOUCH BAG, and it is deliberately not the rail's `ballsOpen`. That one
     is a desktop preference and is PERSISTED - the rail remembers whether you
     left it open. This is a sheet you summon and dismiss, it starts closed
     every time, and only one of the two is ever on screen: the rail is hidden
     on a coarse pointer and the pad that opens this only exists there.
     `null` | `"all"` (the BAG key) | `"balls"` (holding A). */
  const [bagView, setBagView] = useState(null);
  /* "See in Box" crosses two components that do not know each other: the sheet
     lives here and the tab lives in the Rail. A species id parked here is the
     smallest thing that can travel between them, and the Rail clears it once it
     has acted so pressing the button twice works twice. */
  const [boxJump, setBoxJump] = useState(null);
  // The key handler is installed once, so it reads the open entry from a ref
  // rather than closing over stale state.
  const entryRef = useRef(null);
  entryRef.current = entry;

  const [order, setOrder] = useState(readOrder);
  const orderRef = useRef(order);
  orderRef.current = order;
  /* Promote a ball to slot 1: it takes key 1 and becomes what a bare throw
     uses, on the keyboard and on the pad alike. */
  const promote = (id) => {
    const next = promoteBall(orderRef.current, id);
    setOrder(next);
    write(ORDER_KEY, JSON.stringify(next));
  };

  const [ballsOpen, setBallsOpen] = useState(readRail);
  const toggleBalls = () => {
    const next = !ballsOpen;
    setBallsOpen(next);
    write(RAIL_KEY, next ? "1" : "0");
  };

  useEffect(() => {
    const e = createEngine(canvasRef.current, force, miniRef.current);
    setEngine(e);
    // Boot needs a handle to report a failed upload into - see onSyncTrouble.
    onEngine?.(e);

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
          /* Your slot-1 ball if you hold any, else the cheapest you have -
             which is what this did before the order could be arranged. The
             pad's A calls the same function, so the two cannot drift. */
          const ball = defaultBall(e.state.bag, orderRef.current);
          if (ball) e.throwBall(ball.id);
        } else if (enc.phase === "idle" && BALL_KEYS.includes(ev.key)) {
          ev.preventDefault();
          const pick = ballOrder(orderRef.current)[Number(ev.key) - 1];
          if (pick) e.throwBall(pick.id);
        /* R for run, as well as Escape. Escape is the correct key for
           "dismiss this" and stays; R is the one a hand already on WASD can
           reach without looking, and it is what the word on the button says.
           `r` is not a movement key and not taken by fishing (F), so nothing
           had to move to make room. */
        } else if (enc.phase === "idle"
                   && (ev.key === "Escape" || ev.key === "r" || ev.key === "R")) {
          ev.preventDefault();
          e.flee();
        }
        return;
      }

      // A line is out: the cast owns the next second and a half.
      if (e.state.fishing) return;

      // Out on the map: cast a rod.
      if (ev.key === "f" || ev.key === "F") {
        ev.preventDefault();
        e.fish();
        return;
      }

      /* C RIDES OUT ONTO IT, and it was S for exactly one commit - which is
         WASD's DOWN. This handler runs before the `KEYS` lookup, so it ate the
         key and walking south simply stopped working. Reported immediately,
         and it should never have been written: this file's own `KEYS` table is
         eight lines above.

         Its own key rather than a second meaning for F, because at a shoreline
         BOTH are offered, and one key that did either depending on what you
         are carrying is a control you cannot trust. **Check `KEYS` before
         claiming a letter.** */
      if (ev.key === "c" || ev.key === "C") {
        ev.preventDefault();
        e.surf();
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
  /* WHAT JUST RAN OUT. Not a cheer: a cheer is a celebration that holds the
     screen for three seconds with sparks on it, and an effect ending is news
     rather than an occasion. It is the one event in the game with no tell at
     all - the card in the corner stops being there, which is exactly what
     "nothing happened" also looks like - so it gets a card of its own, in the
     same corner the running one was in, and then goes. */
  const worn = st?.worn?.[0] ?? null;
  /* Recomputed every render rather than stored: it depends on which way you are
     facing, and every step already re-renders. */
  const rod = engine && !enc && !evo && !fishing ? engine.castable() : null;
  /* Same shape as the rod prompt and for the same reason: the keyboard has S
     and a touch player would otherwise have no way to ride at all. It returns
     the character of the liquid, so the prompt can say which. */
  const ride = engine && !enc && !evo && !fishing ? engine.surfable() : null;

  /* Keyed on `worn.n` rather than on the item, so using the same repel again
     and wearing it out again restarts the clock instead of inheriting the
     tail of the last one's - a flag that is already true cannot say "again",
     which is the note `e.ate` carries for the same reason. */
  useEffect(() => {
    if (!worn) return undefined;
    const t = setTimeout(() => engine?.dropWorn(), WORN_HOLD);
    return () => clearTimeout(t);
  }, [worn?.n, engine]);

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

  /* AND THE PARCEL FLOATS OVER THE STEPS COUNTER, which `TopBar` has taken a
     prop for since it was written - nothing ever passed one. `stepReward` was
     imported here and never called: the import is what CLAUDE.md's "the top
     bar calls the same function on the same step count" was describing, and
     the call had gone.

     SAME FUNCTION, SAME STEP COUNT, so the balls granted in `onArrive` and the
     `+N` drawn here cannot disagree - there is no number passed between them.
     It returns null on every step that is not a parcel boundary, which is the
     whole condition.

     The CASH half needs nothing: the wage moves `state.money`, so the effect
     above already floats it over the counter it belongs to. One reward, two
     counters, each announcing its own kind.

     THE TIMER IS A REF AND THE EFFECT RETURNS NO CLEANUP, which is not a slip
     - it is the bug this file already paid for one effect up. Returning
     `clearTimeout` here would cancel the parcel's own removal on the very
     next STEP, and a step always follows a parcel immediately, so the label
     would stick on the counter for the rest of the session. */
  const steps = st?.steps ?? 0;
  const [parcel, setParcel] = useState(null);
  const parcelTimer = useRef(null);
  useEffect(() => {
    const won = steps ? stepReward(steps, levelFromXp(st?.xp ?? 0)) : null;
    if (!won) return;
    clearTimeout(parcelTimer.current);
    setParcel(won);
    parcelTimer.current = setTimeout(() => setParcel(null), LIFE);
  }, [steps]);
  useEffect(() => () => clearTimeout(parcelTimer.current), []);

  const caught = st ? st.dex.filter((v) => v === 2).length : 0;
  const level = levelFromXp(st?.xp ?? 0);

  /* The claim says what it paid, in the one alert the game uses. Without it a
     claim is a button that greys itself out and three numbers that moved
     somewhere else on screen. */
  const [claimNote, setClaimNote] = useState("");
  const claimDaily = () => {
    const won = engine?.claimDaily();
    if (!won) return null;
    /* WHAT IT PAID, WITH THE THINGS IT PAID IN. Three numbers and two words
       is a sentence you have to parse; the candy and the balls have icons
       everywhere else in the game and this was the one place they arrived as
       text. `Note` renders it, so the parts come through as nodes. */
    setClaimNote(
      <>
        <b>+¥{won.money.toLocaleString()}</b>
        <span><img src="items/rare-candy.png" alt="candy" />+{won.candy}</span>
        {Object.entries(won.items ?? {}).map(([id, n]) => (
          <span key={id}><img src={`items/${id}.png`} alt={id} />+{n}</span>
        ))}
      </>);
    return won;
  };
  // Clears itself, and only ever the last one - see the money-delta bug.
  useEffect(() => {
    if (!claimNote) return undefined;
    const t = setTimeout(() => setClaimNote(""), 4200);
    return () => clearTimeout(t);
  }, [claimNote]);
  const biome = biomeFor(st?.areaId);

  return (
    <div className="app">
      {/* ONE of these, at the root, for the whole app - see Tip.jsx for why it
          is an attribute rather than a wrapper. It renders nothing until
          something is hovered or focused. */}
      <Tip />

      {/* A PRESS THAT CANNOT BE TAKEN BACK ASKS FIRST, and the engine is what
          decided to ask - see `ask()` there. App renders ONE dialog for both
          questions rather than one per call site, which is the whole point:
          the Master Ball and the legendary RUN are reached from five and three
          places respectively, and a dialog per place is eight chances to miss
          one.

          `st.encounter` is in the condition as well, because the question is
          about an encounter and the frame loop keeps running underneath an open
          dialog. The engine clears `ask` when an encounter ends, so this is the
          belt to that braces - and a stale question about a Pokemon that has
          gone would be a dialog whose YES does nothing. */}
      {st?.ask && st?.encounter && (
        <Confirm
          title={st.ask.title}
          tone="warn"
          note={st.ask.body}
          confirmLabel={st.ask.kind === "flee" ? "RUN" : "THROW"}
          onCancel={() => engine.answerAsk(false)}
          onConfirm={() => engine.answerAsk(true)}
        />
      )}

      {/* Above every other overlay: it can land during an encounter or an
          evolution, and both of those already own the middle of the screen. */}
      {leaving && (
        <Confirm
          title="Log out?"
          tone="warn"
          lines={[
            ["Trainer", trainerName ?? "—"],
            ["Pokédex", `${caught} caught`],
            ["Saved to", "your account"],
          ]}
          note="Your game stays on your account. This browser's copy is cleared, so log back in to carry on."
          confirmLabel="LOG OUT"
          onCancel={() => setLeaving(false)}
          onConfirm={() => { setLeaving(false); onLogOut(); }}
        />
      )}

      {/* THIS ONE IS NOT A WARNING, IT IS THE END OF THE SESSION - so it is a
          dialog rather than a line in the top bar. The account is being played
          somewhere else and has taken the save with it; the engine has already
          stopped writing, locally as well as upward, because an abandoned tab
          that keeps writing overwrites the copy the live one is keeping. There
          is exactly one useful action and this offers only that. */}
      {st?.stale === "taken" && (
        <Confirm
          title="You are playing somewhere else"
          tone="warn"
          lines={[
            ["Trainer", trainerName ?? "—"],
            ["This tab", "no longer saving"],
          ]}
          note="Your game was opened on another device or in another tab, and that one now owns the save. Nothing here is being kept. Reload to pick up where that session is."
          confirmLabel="RELOAD"
          onCancel={() => location.reload()}
          onConfirm={() => location.reload()}
        />
      )}

      {/* Touch only - see `.bagsheet` in styles.css, gated on the same coarse
          pointer the pad is. An encounter does NOT open it by itself the way
          an encounter pins the rail open: the rail lives down one edge and
          this covers the bottom third, which is where the Pokemon is. */}
      {bagView && (
        <Bag
          bag={st?.bag}
          enc={enc}
          field={st?.field}
          view={bagView}
          order={order}
          onThrow={enc?.phase === "idle" ? (id) => engine.throwBall(id) : null}
          onPromote={promote}
          onUseField={(id) => engine.useField(id)}
          onUseBerry={(id) => engine.useBerry(id)}
          onClose={() => setBagView(null)}
        />
      )}

      {help && <Help onClose={() => setHelp(false)} />}
      {forms && <Variants onClose={() => setForms(false)} />}

      {settings && account && (
        <Settings
          account={{ ...account, caught }}
          onClose={() => setSettings(false)}
        />
      )}

      {cheer && <Cheer cheer={cheer} onDone={() => engine.dropCheer()} />}

      {/* A TIP, NOT A TUTORIAL - one line, the first time you reach the thing
          it is about, never again. See hints.js for why there is no sequence,
          and Hint.jsx for why it is a dialog rather than the bar it started as:
          a tip somebody scrolls past is a tip nobody read. */}
      {st?.hint && (
        <Hint text={st.hint.text} onClose={() => engine.clearHint()} />
      )}

      <TopBar
        /* The quest lives here now rather than on the YOU tab - see Missions in
           TopBar.jsx. The claim and its note live here too, because the top bar
           is the only thing on screen in every state of the game. */
        daily={engine?.daily?.()}
        onClaimDaily={claimDaily}
        claimNote={claimNote}
        caught={caught}
        total={st?.caught ?? 0}
        stale={st?.stale ?? null}
        steps={steps}
        parcel={parcel}
        money={st?.money ?? 0}
        candy={st?.candy ?? 0}
        deltas={deltas}
        xp={st?.xp ?? 0}
        /* LOG OUT REPLACES RESET once there is an account. Reset wiped the
           save, which was the only way out when the save WAS the account; with
           one it is a button that destroys a synced collection and calls it a
           preference. The account owns the save now, so leaving is logging out
           and the data stays. Reset survives only in local mode, where there is
           nothing to log out of. */
        onReset={onLogOut ? null : () => engine?.reset()}
        onLogOut={onLogOut ? () => setLeaving(true) : null}
        onSettings={account ? () => setSettings(true) : null}
        onHelp={() => setHelp(true)}
        onForms={() => setForms(true)}
        trainerName={trainerName}
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
            {/* ONE STACK, NOT TWO THINGS PINNED TO THE SAME CORNER. Both of
                these were `position: absolute; right: 10px; top: 10px`, and
                what kept them apart was `.fieldbox ~ .worldclock { top: 40px }`
                - a typed offset for a card that was 31px tall when it was
                written. The card grew, the offset did not, and they printed on
                top of each other. Reported from play.

                A column with a gap cannot overlap whatever either one ends up
                measuring, which is the whole reason to do it this way rather
                than to measure the card again and type 48. */}
            {!enc && !evo && (
              <div className="hud-right">
            {/* IN THE STACK, ABOVE THE RUNNING ONES. It replaces the card it
                is about - the effect it names has just left this column - so
                putting it anywhere else would make the player look somewhere
                new to be told something about here. Long enough to read and
                gone without a click: there is nothing to decide. */}
            {worn && (
              <div className="fieldbox worn" role="status" key={worn.n}>
                <span>
                  <ItemIcon item={fieldById(worn.id)} />
                  <u>
                    <b>{fieldById(worn.id)?.name ?? "Effect"}</b>
                    <i>WORE OFF</i>
                  </u>
                </span>
              </div>
            )}

            {FAMILIES.some((f) => st?.field?.[f]) && (
              <div className="fieldbox" role="status">
                {FAMILIES.map((fam) => {
                  const run = st.field[fam];
                  const item = run && fieldById(run.id);
                  if (!item) return null;
                  return (
                    <span
                      key={fam}
                      data-tip={`${item.name} — ${item.blurb}. ${run.steps} steps left.`}
                    >
                      <ItemIcon item={item} />
                      <u>
                        <b>{run.steps}</b>
                        <i>STEPS</i>
                      </u>
                    </span>
                  );
                })}
              </div>
            )}

            {/* THE CLOCK, OVER THE WORLD IT LIGHTS. It sat in the top bar
                among the money and the step count, which is a row of things you
                read; the time of day is a thing you SEE, and the sky it belongs
                to is on this screen. Hidden with everything else for an
                encounter - the phase is frozen on the encounter itself by then,
                so a clock ticking over a paused world would be lying. */}
              <div
                className={`worldclock ph-${phaseAt(st?.steps ?? 0).id}`}
                data-tip={`${phaseAt(st?.steps ?? 0).name} — the world's clock runs as you walk`}
              >
                <b aria-hidden="true">
                  {["dusk", "night"].includes(phaseAt(st?.steps ?? 0).id) ? "☾" : "☀"}
                </b>
                <i>{timeLabel(st?.steps ?? 0)}</i>
              </div>
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
                /* Which effects are already running, so a field item that is
                   up says so rather than looking like an unused stack. */
                field={st?.field}
                onUseField={(id) => engine.useField(id)}
                onUseBerry={(id) => engine.useBerry(id)}
                /* The rail prices each ball against what is standing there,
                   so it needs the encounter, not just the bag. */
                enc={enc}
                open={ballsOpen}
                onToggle={toggleBalls}
                order={order}
                onPromote={promote}
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

          {/* WHAT YOU CAN DO FROM WHERE YOU ARE STANDING, as buttons rather
              than captions: the keyboard has F and C, and a touch player had
              no other way to reach either.

              They are built out of the app's own button, not a shape of their
              own - `--pixel`, a 2px border, the `0 2px 0` lip everything else
              here has, hover fills, gold focus ring. They were two identical
              pink pills before, which said nothing about which was which and
              matched nothing else on screen. The ICON is what tells them
              apart now, because "Super Rod" and "Surf" are both just words
              until you have read them. */}
          {(rod || ride) && (
            <div className="hint-row">
              {rod ? (
                <button className="hint-act" onClick={() => engine.fish()}
                        data-tip={`Cast the ${rod.name} into the water`}>
                  <img src={`items/${rod.id}.png`} alt="" />
                  <span><b>{rod.name}</b> ready</span>
                  <kbd>F</kbd>
                </button>
              ) : null}

              {ride ? (
                <button className={`hint-act${ride === "V" ? " hot" : ""}`}
                        onClick={() => engine.surf()}
                        data-tip={`Ride out onto the ${ride === "V" ? "lava" : "water"}`}>
                  <img src="items/surf.png" alt="" />
                  <span>Surf the <b>{ride === "V" ? "lava" : "water"}</b></span>
                  <kbd>C</kbd>
                </button>
              ) : null}
            </div>
          )}

          {/* Touch only - see `.pad` in styles.css. It drives the same engine
              calls the keyboard does and adds no action of its own. */}
          <Pad
            engine={engine}
            state={st}
            enc={enc}
            level={level}
            ride={ride}
            order={order}
            bagOpen={bagView === "all"}
            onBag={() => setBagView((v) => (v === "all" ? null : "all"))}
            onPickBall={() => setBagView("balls")}
          />
        </div>

        <Rail
          state={st}
          caught={caught}
          level={level}
          busy={!!enc || !!evo}
          onTravel={(id) => engine.travel(id)}
          onSelect={setEntry}
          onSell={onSell}
          onConvert={onConvert}
          onLevelUp={onLevelUp}
          onBuy={(id, n) => engine.buy(id, n)}
          onBuyCandy={(n) => engine.buyCandy(n)}
          onEvolve={onEvolve}
          jumpTo={boxJump}
          onJumped={onJumped}
          onSpend={(id) => engine.spend(id)}
          /* The three save-file calls, handed over as one object so the panel
             does not need the engine itself. */
          save={engine && {
            read: () => engine.exportSave(),
            inspect: (obj) => engine.inspectSave(obj),
            write: (obj) => engine.importSave(obj),
            recover: () => engine.recoverable(),
            restore: (which) => engine.restore(which),
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
          owned={st?.box?.filter((m) => m.species === entry).length ?? 0}
          onFindInBox={(id) => { setBoxJump(id); setEntry(null); }}
          /* Travelling closes the sheet, because the answer to "where do I
             find one" has been acted on and leaving the entry open over the
             map you just arrived at is a dialog with nothing left to say. */
          level={level}
          here={st?.areaId}
          busy={Boolean(enc || evo)}
          onTravel={(id) => { if (engine.travel(id)) setEntry(null); }}
          onClose={() => setEntry(null)}
        />
      )}

    </div>
  );
}
