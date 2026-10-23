# Arena move art: image prompts

Each sheet is one row of frames on a transparent ground, saved to the path
over its prompt. `npm run fx` builds it; the frame count is `MOVES` in
tools/build_fx.py and must match the drawing. Until a file exists the
renderer draws its own version of the effect.

## Effects (the renderer already asks for these)

`art/arena/fx/moves/fire-blast.png` - 6 frames, played once where it lands

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Fire Blast, 6 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 3:1 canvas. Frame 1: a small white-hot fireball. Frame 2: it swells, short flame tongues licking off it. Frame 3: it bursts open into the Japanese character 大 drawn in flame - one horizontal arm, a head above it and two legs splaying down, each arm a thick flame tongue. Frame 4: the 大 at full blaze, white-yellow core, orange body, red tips, embers flying off the ends. Frame 5: the five arms tear apart into separate flame tongues and sparks. Frame 6: scattered embers and two thin grey smoke wisps. Emerald fire palette only: white, pale yellow, yellow-orange, orange, red, dark crimson 1-pixel outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text other than the flame 大 shape, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/hyper-beam-charge.png` - 6 frames, looping in front of the user while Hyper Beam charges

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of a Hyper Beam charging orb in the style of a Kamehameha charge, 6 frames side by side in ONE horizontal row, each frame the same size with the orb exactly centred in its own cell, clear empty transparent space between frames, wide 3:1 canvas. Every frame is the SAME size orb so it loops: a round orb of golden-orange energy with a white-hot core, thin streaks of energy being sucked inward from all sides toward the centre, two or three small crackling arcs on its rim, a faint ring of light around it. Across the six frames the inward streaks move closer to the core, the arcs jump to new places and the core pulses brighter then softer, so frame 6 flows back into frame 1. Palette: white, pale cream, gold, orange, deep amber outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/solar-beam-charge.png` - 6 frames, looping while Solar Beam soaks up sunlight

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of Solar Beam gathering sunlight, 6 frames side by side in ONE horizontal row, each frame the same size with the orb exactly centred in its own cell, clear empty transparent space between frames, wide 3:1 canvas. Every frame is the SAME size so it loops: a bright sun-orb with a white core and a rim of golden petals of light, small golden motes and tiny green leaves spiralling inward toward it, short sun rays pointing outward. Across the six frames the motes and leaves travel along the spiral into the core and the rays turn slowly, so frame 6 flows back into frame 1. Palette: white, sunlight yellow, gold, leaf green, dark green outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/boulder.png` - 4 frames, the rock lifted and thrown by Rock Throw, Rock Tomb and Rock Wrecker

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of one thrown boulder tumbling through the air, 4 frames side by side in ONE horizontal row, each frame the same size with the boulder exactly centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. The same rough round boulder in every frame, turned a quarter turn further each frame so the four loop as a spin: chunky faceted grey-brown stone, light top-left, dark bottom-right, two cracks, one mossy patch, two tiny pebbles chipping off behind it. Palette: light tan, warm grey, brown, dark brown, near-black outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/stun.png` - 4 frames, looping over a flinched Pokémon's head

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of dizzy stars circling over a stunned Pokémon's head, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. In each frame three small five-pointed yellow stars sit on a flat ellipse seen from slightly above, with a faint white dotted orbit line; the stars move a quarter of the way round the ellipse each frame so the four loop, the star at the back smaller than the ones in front, each star with a single white twinkle pixel. Palette: white, bright yellow, gold, orange outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/confused.png` - 4 frames, looping over a confused Pokémon's head

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the classic Pokémon confusion status effect, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. In each frame three tiny cartoon yellow ducks circle on a flat ellipse seen from slightly above, around a small swirling purple spiral in the middle; the ducks move a quarter of the way round each frame and the spiral turns a quarter turn, so the four loop; the duck at the back is smaller. Palette: white, yellow, orange beak, lilac, purple, dark purple outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/smoke.png` - 6 frames, looping on a Smokescreen cloud

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of a Smokescreen cloud, 6 frames side by side in ONE horizontal row, each frame the same size with the cloud exactly centred in its own cell, clear empty transparent space between frames, wide 3:1 canvas. Every frame is the SAME size dense billowing cloud of black ink-smoke, as Horsea and Octillery spray: round puffs in near-black, charcoal and dark slate, lighter grey tops, a few dark purple shadows, small wisps curling off the edges. Across the six frames the puffs roll and churn in place and the wisps curl and drift, so frame 6 flows back into frame 1; the cloud never grows or shrinks. Palette: light grey, mid grey, charcoal, dark slate, dark purple, black outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/psychic-lift.png` - 6 frames, looping round a Pokémon held up by Psychic

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of a psychic grip that holds a Pokémon in the air, 6 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 3:1 canvas. Each frame is a HOLLOW glowing outline shaped like a tall rounded body with an empty transparent middle (the Pokémon goes inside it), made of wavy pink-magenta psychic energy, plus a flat glowing ring underneath like a hovering platform and small psychic sparkles rising off it. Across the six frames the outline ripples and wobbles in waves, the ring pulses and the sparkles rise, so frame 6 flows back into frame 1. Palette: white, pale pink, hot pink, magenta, violet, deep purple outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

## Moves (each replaces the drawn-by-code look of that move)

`art/arena/fx/moves/aura-sphere.png` - 4 frames, a projectile looping as it flies right

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of Lucario's Aura Sphere flying to the right, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. Every frame is the SAME size: a sphere of blue aura with a white-hot core, a ring of blue aura flames licking backwards off it like a comet, and a short tail streaming to the LEFT. Across the four frames the flames flicker and the inner swirl turns a quarter turn, so the four loop. Palette: white, ice blue, sky blue, royal blue, navy outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/focus-blast.png` - 4 frames, a projectile looping as it flies right

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Focus Blast flying to the right, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. Every frame is the SAME size: a heavy sphere of concentrated fighting energy, pale yellow core, orange body, a spinning ring of energy wrapped round it at an angle, short speed lines trailing to the LEFT and crackles on its rim. Across the four frames the ring spins a quarter turn and the crackles jump, so the four loop. Palette: white, pale yellow, gold, orange, red-brown outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/energy-ball.png` - 4 frames, a projectile looping as it flies right

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Energy Ball flying to the right, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. Every frame is the SAME size: a glowing sphere of nature energy, pale lime core, bright green body, three tiny leaves orbiting it and a trail of green motes to the LEFT. Across the four frames the leaves move a quarter of the way round and the core pulses, so the four loop. Palette: white, pale lime, leaf green, forest green, dark green outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/sludge-bomb.png` - 4 frames, a projectile looping as it flies right

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Sludge Bomb flying to the right, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. Every frame is the SAME size: a wobbling glob of toxic purple sludge with a glossy white highlight, bubbles on its skin, and sludge drips flung off behind it to the LEFT. Across the four frames the glob squashes and stretches like jelly and a bubble pops and re-forms, so the four loop. Palette: white, lilac, violet, purple, dark plum outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/moonblast.png` - 4 frames, a projectile looping as it flies right

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Moonblast flying to the right, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. Every frame is the SAME size: a pale glowing moon orb with a crescent shadow, soft pink halo around it, little four-pointed sparkles and tiny hearts trailing to the LEFT. Across the four frames the sparkles twinkle on and off and the crescent shadow turns slightly, so the four loop. Palette: white, pale pink, pink, rose, mauve outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/air-slash.png` - 4 frames, a projectile looping as it flies right

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Air Slash flying to the right, 4 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 2:1 canvas. Every frame is the SAME size: a spinning crescent blade of compressed wind, sharp white edge, pale blue body, curved wind streaks trailing to the LEFT and a couple of small leaves caught in it. Across the four frames the crescent turns a quarter turn, so the four loop as a spin. Palette: white, pale cyan, sky blue, slate blue outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/dragon-pulse.png` - 1 frame, a beam stream stretched from the user to its end

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Dragon Pulse as ONE long straight horizontal beam running edge to edge across a wide 3:1 transparent canvas, the beam about one sixth of the canvas tall, both ends cut straight so it can be stretched. The beam is a river of draconic energy: a bright teal-white core, swirling bands of teal and violet twisting around it like a dragon's body, small scale-shaped sparks peeling off the edges. Palette: white, pale teal, teal, violet, deep indigo outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/dark-pulse.png` - 1 frame, a beam stream stretched from the user to its end

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Dark Pulse as ONE long straight horizontal beam running edge to edge across a wide 3:1 transparent canvas, the beam about one sixth of the canvas tall, both ends cut straight so it can be stretched. The beam is a chain of overlapping rings of dark energy seen side-on, black and deep purple with crimson inner edges, and small dark wisps curling off it. Palette: crimson, magenta, deep purple, charcoal, black outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/flash-cannon.png` - 1 frame, a beam stream stretched from the user to its end

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Flash Cannon as ONE long straight horizontal beam running edge to edge across a wide 3:1 transparent canvas, the beam about one sixth of the canvas tall, both ends cut straight so it can be stretched. The beam is polished steel light: a white-hot core, silver bands with hard metallic glints along its top edge, small square sparks flaking off. Palette: white, pale silver, steel grey, blue-grey, dark slate outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no ground, no shadow, fully transparent background (PNG alpha).
```

`art/arena/fx/moves/stone-edge.png` - 5 frames, played once at the blow's reach

```
Game Boy Advance Pokémon Emerald battle-animation pixel art of the move Stone Edge erupting from the ground, 5 frames side by side in ONE horizontal row, each frame the same size and centred in its own cell, clear empty transparent space between frames, wide 5:2 canvas. Frame 1: a crack opens with three small pebbles jumping up. Frame 2: two sharp stone spears stab up out of the crack. Frame 3: a full jagged cluster of five pale stone spears at different heights and angles, a glint on the tallest tip. Frame 4: the spears crack across with chips flying. Frame 5: the spears crumble into falling rubble and dust. Palette: white, pale stone, warm grey, brown, dark brown outline. Crisp hard-edged pixels, no anti-aliasing, no blur, no gradients, no text, no Pokémon, no shadow, fully transparent background (PNG alpha).
```

## Evolving in a match (optional - the game draws its own until these exist)

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

## Families: one sheet for many moves (render.js FAMILY / SHARED)

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
