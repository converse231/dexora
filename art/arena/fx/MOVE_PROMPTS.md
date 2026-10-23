# Arena move art: still to draw

Only the sheets the game asks for that are not drawn yet (2026-10-24) - remove a prompt once its sheet is in the folder. Each sheet is one row of frames on a transparent ground, saved to the path over its prompt; `npm run fx` builds it, and its frame count is `MOVES` in tools/build_fx.py. Until a file exists the game draws its own version of the effect.

`art/arena/fx/moves/evolve.png` - 8 frames, played behind the Pokemon across its 1.6 s evolution

```
Game Boy Advance Pokémon Emerald pixel art of the classic Pokémon evolution light, 8 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 4:1 canvas. NO Pokémon in any frame - the middle of every frame is EMPTY, a creature will be drawn there. Frame 1: a faint ring of light on the ground. Frame 2: a thin pillar of pale blue-white light rises from the ring. Frames 3 to 6: the pillar widens and brightens, small sparkles and light motes spiral up and inward toward the empty centre, a second ring pulses outward on the ground. Frame 7: the pillar at its brightest, white-hot edges, the motes gathered tight around the empty centre. Frame 8: the pillar bursts outward into a ring of sparkles and short rays. Palette: white, pale cyan, ice blue, soft gold sparkles, light blue outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground texture, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/mega-evolve.png` - 8 frames, behind a Pokemon as it Mega Evolves

```
Game Boy Advance Pokémon Emerald pixel art of Mega Evolution energy, 8 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 4:1 canvas. NO Pokémon in any frame - the middle of every frame is EMPTY, a creature will be drawn there. Frame 1: a small rainbow Key Stone glint at the top of the frame. Frame 2: rainbow ribbons of light (pink, orange, yellow, green, cyan, purple) shoot down from it. Frames 3 to 6: the ribbons wrap around the empty centre as a twisting double helix and close into a glowing rainbow-edged sphere of light, crackling with white sparks. Frame 7: the sphere at full size, cracks of white light across its surface. Frame 8: the sphere shatters outward into rainbow shards and sparkles. Palette: white, hot pink, orange, yellow, green, cyan, violet, deep purple outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/mega-symbol.png` - 1 frame, shown over a new Mega

```
Game Boy Advance Pokémon Emerald pixel art of the Mega Evolution symbol as a single icon centred on a square transparent canvas: a round emblem whose outer ring is a rainbow (pink, orange, yellow, green, cyan, violet), inside it the classic Mega Evolution mark - two curved strands rising like a stylised DNA helix that meet at the top in a point, with a small round gem between them near the bottom. Bold white highlights, a thin dark outline, a soft glow ring. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/slam.png` - 5 frames, played at the blow's reach (Take Down, Double-Edge, Body Slam, Thrash, Headbutt, Giga Impact and more)

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of a heavy full-body slam impact, 5 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 5:2 canvas. Frame 1: a small white star of impact. Frame 2: a big jagged white-and-yellow starburst with thick speed lines bursting outward. Frame 3: the starburst at full size with a cracked shockwave ring around it and three flying debris chips. Frame 4: the ring widens and breaks into curved dust puffs. Frame 5: a few fading dust puffs and sparkles. Palette: white, pale yellow, warm orange, light grey dust, dark brown outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/claw.png` - 4 frames, played at the blow's reach (Slash, Scratch, Fury Swipes, Crush Claw, Aerial Ace, Psycho Cut and more)

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of three claw slashes raking diagonally from top-left to bottom-right, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. Frame 1: three thin white slash lines just starting at the top-left. Frame 2: the three slashes fully drawn, bright white cores with pale blue edges, small sparks where they cut. Frame 3: the slashes at their thickest with a white flash between them. Frame 4: the slashes thinning and breaking into small fading shards. Palette: white, ice blue, steel grey, dark slate outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/heal.png` - 6 frames, round any Pokemon that heals (Recover, Roost, Synthesis, Soft-Boiled, and every drain move)

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of a healing effect around a Pokémon, 6 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 3:1 canvas. NO Pokémon - the middle of every frame is EMPTY, a creature will be drawn there. Frame 1: a soft green ring of light on the ground. Frames 2 to 4: glowing green and white sparkles and small plus-shaped crosses rise up and spiral around the empty centre, the ring pulsing. Frame 5: the sparkles gather at the top in a bright twinkle. Frame 6: a last few twinkles fading. Palette: white, mint green, leaf green, pale pink twinkles, dark green outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/power-up.png` - 6 frames, round a Pokemon whose stats rise (Swords Dance, Agility, Nasty Plot, Calm Mind, Dragon Dance, Iron Defense and more)

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of a stat-boost aura, 6 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 3:1 canvas. NO Pokémon - the middle of every frame is EMPTY, a creature will be drawn there. Frame 1: a flat orange-red ring of energy on the ground. Frames 2 to 4: flames of red and orange energy rise from the ring, with chevron arrows pointing UP climbing through them. Frame 5: the aura at its tallest, a bright white flash at the top. Frame 6: the flames sinking back, two arrows fading. Palette: white, yellow, orange, red, deep crimson outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/stat-drop.png` - 6 frames, round a Pokemon whose stats fall (Screech, Scary Face, Charm, Growl, Leer, Close Combat's own drops and more)

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of a stat-drop effect, 6 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 3:1 canvas. NO Pokémon - the middle of every frame is EMPTY, a creature will be drawn there. Frame 1: a faint blue haze appears above the empty centre. Frames 2 to 4: cold blue-violet energy streams fall DOWN around the empty centre, with chevron arrows pointing DOWN sinking through them. Frame 5: the streams pool into a dim ring on the ground. Frame 6: the ring fading. Palette: pale blue, cornflower blue, violet, deep navy outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, fully transparent background (PNG alpha).
```
