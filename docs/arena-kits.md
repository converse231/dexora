# Arena kits: one fixed move set per Pokémon

Status: phase 1 under review (2026-10-27). `node tools/build_kits.mjs` writes the full map, `reports/Arena kits.md`: the rules for every line, and 100 hand-written kits (`FIXED` in the tool, each move checked against the Pokemon's learnset). The Arena does not play it yet.

**Decided (2026-10-27, your calls):** the Arena only (the League keeps its learnsets and Move Tutor); one kit per evolution line; the Arena's Move Tutor is replaced by **kit mastery levels**.

## Why

Today a Pokémon fights in the Arena with its four League moves, which change as it levels and can be swapped at the Move Tutor. Two players' Pikachu can play completely differently, and a player's own Pikachu changes under them. In a MOBA (Mobile Legends, Dota) a hero's kit never changes, so a player can learn it, master it and read it on the enemy. That is the goal: **every Pokémon has one kit, the same for everybody, forever.**

## The kit: four slots, each with a job

| Key | Slot | Job | Examples |
|---|---|---|---|
| RMB | **Main** | Its signature damage, on a short cooldown | Thunderbolt, Flamethrower, Shadow Ball |
| Q | **Move** | Mobility: engage or escape | Quick Attack, Flare Blitz, Dig, Fly, Double Team, Rapid Spin |
| E | **Control** | Set up the foe: stun, sleep, slow, confuse, grab | Thunder Wave, Hypnosis, Bulldoze, Vine Whip (grab), Water Pulse |
| R | **Power** | The big finisher, or the Pokémon's utility | Discharge, Close Combat, Solar Beam, Life Dew, Iron Defense |

Plus, unchanged: the **basic attack** (LMB, its first type) and its **ULTI** (F, already one per species).

Every move comes from the Pokémon's own learnset. Nothing is invented; the kit is a fixed choice from moves it really learns.

## Classes (like MOBA roles)

Each Pokémon gets a class from its base stats and its learnset. The class decides what goes in the Power slot and how the kit is tuned:

- **Fighter**: melee damage and sustain (Lucario, Machamp)
- **Assassin**: fast, mobile, bursts a single target (Greninja, Gengar)
- **Mage**: area damage at range (Gardevoir, Alakazam)
- **Marksman**: long-range sustained damage (Pikachu, Blastoise)
- **Tank**: control plus defence: shields, big HP (Snorlax, Blastoise)
- **Support**: heals, buffs, decoys (Blissey, Gardevoir's support build)

Brawler and Blaster stay as they are (the basic attack's style). The class sits on top of that.

## Combos

**The rotation every kit teaches: Control, then Power.** A Control move marks the foe for 2.5 seconds. A Main or Power move that lands on a marked foe consumes the mark for +30% damage. The kit card says each Pokémon's combo in one line ("Thunder Wave, then Discharge").

The existing combos keep working: Water soaks and Electric shocks, Water on a burn makes steam, a grab or a heavy blow into a wall is a wall-splat.

Some Pokémon get a **signature combo** where its real moves already fit:
- Gengar: Hypnosis puts the foe to sleep, and Dream Eater hits a sleeping foe hardest.
- Greninja: Smokescreen hides it, and Night Slash out of the cloud always crits.
- Garchomp: Bulldoze slows, and Dig lands on a slowed foe.

## Evolution: one kit across the line

A line shares one kit, and each stage's move in a slot is that stage's version of it. Charmander's Main is Ember, Charmeleon's Flame Burst, Charizard's Flamethrower. The slots, keys and combo never change, so mastering Charmander is mastering Charizard. Evolving in a match keeps the kit and upgrades its moves.

## Sample kits (all from the real learnsets)

| Pokémon | Class | Main (RMB) | Move (Q) | Control (E) | Power (R) | Combo |
|---|---|---|---|---|---|---|
| Pikachu | Marksman | Thunderbolt | Quick Attack | Thunder Wave | Discharge | Thunder Wave, then Discharge |
| Charizard | Mage | Flamethrower (held) | Flare Blitz | Dragon Breath (paralyse) | Heat Wave | Dragon Breath, then Heat Wave |
| Blastoise | Tank | Hydro Pump (held) | Rapid Spin | Water Pulse (confuse) | Iron Defense | Water Pulse, then Hydro Pump |
| Venusaur | Mage | Seed Bomb | Take Down | Sleep Powder | Solar Beam (held) | Sleep Powder, then Solar Beam |
| Gengar | Assassin | Shadow Ball | Sucker Punch | Hypnosis | Dream Eater | Hypnosis, then Dream Eater |
| Lucario | Fighter | Aura Sphere | Extreme Speed | Force Palm (paralyse) | Close Combat | Force Palm, then Close Combat |
| Gardevoir | Support | Psychic | Double Team | Hypnosis | Life Dew | Hypnosis, then Psychic |
| Garchomp | Fighter | Dragon Claw | Dragon Rush | Bulldoze (slow) | Dig | Bulldoze, then Dig |
| Snorlax | Tank | Crunch | Body Slam (paralyse) | Amnesia | Giga Impact | Body Slam, then Giga Impact |
| Greninja | Assassin | Water Shuriken | Bounce | Smokescreen | Night Slash | Smokescreen, then Night Slash |

## How 1,000+ Pokémon get kits

1. **A generator** picks each slot from the line's learnset by rules: Main is its strongest same-type move that fits its role; Move is its best dash, vanish or decoy; Control is the move with the strongest control effect; Power follows its class. This gives every Arena-ready Pokémon a legal kit on day one.
2. **Hand-written kits** override the generator for the famous ones (starters, pseudo-legendaries, the popular picks, every legendary): about 100 to start, more over time.
3. **check.mjs holds every kit**: four slots, each slot doing its job, every move learnable by the line, and each class's win rate inside a band in a Hard-vs-Hard sweep.

## What changes elsewhere

- **The Arena's Move Tutor becomes Kit Mastery**: a fixed kit has nothing to teach, so the money sink is mastery levels instead. A Pokémon's kit is raised with money and Rare Candy, a level at a time, each a small step (a slightly shorter cooldown or a little more damage on one slot), capped low enough that a mastered kit is better, never a different game. Like hero levels in a MOBA. Mastery is per Box entry and plays only against the CPU and the Ladder; online and ranked play the Fair format, unmastered.
- **The League is untouched**: turn-based battles keep the games' own learnsets and the League's Move Tutor.
- **The team card and the fighter select** show the kit as four labelled slots with the combo line, like a MOBA hero page.
- **Online play** (the Fair format) already plays species, not saves, so it gets the fixed kits for free.

## Phases

1. The kit model, the generator, the class rules, and the 10 sample kits above. The Arena plays fixed kits; the team card shows them.
2. The mark-and-consume combo and the signature combos.
3. Hand-written kits for about 100 famous Pokémon; the class balance sweep in check.mjs.
4. A kit page per Pokémon (the hero page): its slots, combo, class and a short tip.
5. Kit Mastery, replacing the Arena's Move Tutor.
