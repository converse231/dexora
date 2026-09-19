/* WHAT THE RARE FORMS ARE, AND HOW OFTEN YOU MEET ONE.

   The game's whole second half is hunting these and it had nowhere that says
   what they are. A player met a Glitched Pikachu, read a four-word chip on the
   catch banner, and that was the entire explanation available - and the Dex
   sheet's FORMS strip, which does draw all eight, only ever draws them for a
   species you have already opened, as silhouettes you have not earned. You
   could play for hours without learning that Noir exists.

   So this is the reference: every tier, drawn in its real treatment on a
   creature you recognise, with its odds next to it. It sits in the menu beside
   How to play, because that is where a thing you consult belongs and the same
   argument applies - a reference nobody needs twice should be reachable rather
   than resident.

   THE ORDER, THE NAMES, THE ODDS AND THE PROSE ALL COME FROM `TIERS`,
   `TIER_ODDS` and `TIER_TELL`. This is the THIRD screen in the game that draws
   a row of tiers, and the other two are the reason that sentence is in capital
   letters: the FORMS strip kept its own list and shipped missing four of them,
   and the catch banner kept its own text table and headed a 1-in-210 Showdown
   with the word POKEDEX. Neither failed loudly. check.mjs holds this file to
   the same two rules.

   AND THE ODDS ARE COMPUTED, NEVER WRITTEN. `TIER_TELL` is forbidden from
   quoting a number for exactly this reason - two of its strings used to, and
   both were wrong the day the ladder was divided by 4/3. The one place in the
   game that reads the odds out loud should be reading them. */

import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import Sprite from "./Sprite.jsx";
import { label } from "../game/map.js";
import {
  TIERS, TIER_ODDS, TIER_TELL, tiersFor, speciesById,
  ROSETTE_NEED, PITY_AFTER, PITY_CAP,
} from "../game/biomes.js";

/* FIVE CREATURES EVERYBODY KNOWS. The point of a preview is recognition - you
   are here to learn what a treatment looks like, and you can only see that on
   a silhouette you already have in your head. Asked for by name.

   They are also all Gen 1, which is not incidental: `tiersFor` drops Origin
   from anything whose ordinary art is no older than its debut, so a Sinnoh
   sample would quietly show seven columns where this one shows eight. The
   grid honours `tiersFor` anyway - see below - but a sample that cannot wear
   the whole ladder is a poor advertisement for it. */
const CAST = [25, 143, 94, 6, 130];

const LABEL = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/* "1 in 105". `TIER_ODDS` is a probability per encounter, and a reciprocal is
   the only form of it anybody thinks in. */
const oneIn = (odds) => Math.round(1 / odds);

export default function Variants({ onClose }) {
  useModalLock();
  const [who, setWho] = useState(CAST[0]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const sp = speciesById(who);
  /* KINDEST FIRST, so the grid reads as a ladder from the one you will meet
     today to the one worth a screenshot - the same order the FORMS strip uses,
     and from the same list, so the two cannot disagree about which is rarer.

     Intersected with `tiersFor`, which is the answer the ROLL uses: a sample
     that cannot wear a tier must not advertise it. Every creature in `CAST`
     wears all eight today, so this is doing nothing - and it is here so that
     swapping one for a Sinnoh species stays honest rather than becoming a lie
     nobody notices. */
  const wearable = tiersFor(who);
  const ladder = [...TIERS].reverse().filter((t) => wearable.includes(t));

  /* HOW OFTEN ANY OF THEM HAPPENS, which is the number that decides whether a
     player thinks this is worth chasing at all. Eight tiers at about 1 in 150
     each sounds hopeless one at a time and is 1 in 18 together, and the second
     is the true one. Summed rather than stated, because the ladder has been
     retuned three times and a written headline would have been wrong after the
     first. */
  const any = oneIn(TIER_ODDS.reduce((n, [, odds]) => n + odds, 0));

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div
        className="varcard"
        role="dialog"
        aria-modal="true"
        aria-label="Rare forms"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="set-top">
          <h3>Rare forms</h3>
          <span className="set-mail">
            About one Pok&eacute;mon in {any} is wearing one
          </span>
          <button className="set-x" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        <div className="vr-body">
          {/* WHO YOU ARE LOOKING AT. A picker rather than a fixed creature,
              because half of what a treatment does depends on the palette
              underneath it - Noir is obvious on Charizard and nearly invisible
              on Gengar, which is a thing worth being able to find out. */}
          <div className="vr-cast" role="group" aria-label="Preview Pok&eacute;mon">
            {CAST.map((id) => (
              <button
                type="button"
                key={id}
                className={`vr-who${id === who ? " on" : ""}`}
                aria-pressed={id === who}
                onClick={() => setWho(id)}
              >
                <Sprite id={id} alt="" />
                <span>{label(speciesById(id))}</span>
              </button>
            ))}
          </div>

          <div className="vr-grid">
            {ladder.map((t) => (
              <div className="vr-one" key={t}>
                {/* The real treatment, not a filter approximation. `Sprite fx`
                    is what wraps the image so the moving layers have something
                    to be absolute inside, and it is the same call the Box, the
                    encounter and the FORMS strip make - the one place that
                    knows a tier is both a folder AND a class. Re-deriving
                    either half is how an Astral evolution once played out in
                    entirely ordinary art. */}
                <div className="vr-art">
                  <Sprite id={who} variant={t} fx alt={`${LABEL(t)} ${label(sp)}`} />
                </div>
                <span className="vr-name">{LABEL(t)}</span>
                <span className="vr-odds">1 in {oneIn(TIER_ODDS.find(([x]) => x === t)[1])}</span>
                <span className="vr-tell">{TIER_TELL[t]}</span>
              </div>
            ))}
          </div>

          {/* THE THREE THINGS THAT MAKE IT A HUNT RATHER THAN A WAIT, and two
              of them the game has never said out loud anywhere.

              Pity in particular: `state.dry` has counted encounters since the
              last variant since the day the tier ladder was written, and
              nothing on any screen has ever mentioned that the odds climb. A
              mercy nobody knows about is a mercy that does no work. */}
          <h4>Worth knowing</h4>
          <ul className="vr-notes">
            <li>
              <b>They are kinds, not ranks.</b> The rarest is only about twice
              the wait of the kindest, so chase whichever one you like the look
              of rather than working up a ladder.
            </li>
            <li>
              <b>A dry run gets easier.</b> Go {PITY_AFTER} encounters without
              meeting any rare form and the odds start climbing, up to{" "}
              {PITY_CAP}&times;. Meeting one resets it &mdash; catching it is
              not required.
            </li>
            <li>
              <b>Honey aims the roll.</b> A coloured jar from the shop makes its
              own kind about three times likelier for {" "}
              600 steps, and damps the others so most of what turns up is what
              you paid for.
            </li>
            <li>
              <b>Any {ROSETTE_NEED} earns the rosette.</b> Collect{" "}
              {ROSETTE_NEED} different forms of one Pok&eacute;mon &mdash; any{" "}
              {ROSETTE_NEED} &mdash; and its Dex entry is marked complete. Going
              wide beats getting lucky once.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
