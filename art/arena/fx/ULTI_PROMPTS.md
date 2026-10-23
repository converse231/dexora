# ULTI impact panels - centred (2026-10-23)

One panel per Pokemon, the same black-and-white manga art as the first panels, with the Pokemon in the middle. Attach the current `art/arena/fx/ult-<id>.png` as a style reference when generating. Save over the old panel, then run `npm run fx`.

## Pikachu - Thunder - `art/arena/fx/ult-25.png`

```
Black-and-white Japanese manga impact panel, clean black ink line art with grey halftone screentone shading, the same style as the attached reference image. Pikachu (a small chubby mouse with long pointed black-tipped ears, round red cheek pouches crackling with electricity and a lightning-bolt shaped tail) stands EXACTLY IN THE CENTRE of the image, full body, facing the viewer in a fierce three-quarter view, mouth open in a battle cry, unleashing Thunder: jagged white lightning bolts crash down from the top of the frame onto it and arc outward to both sides. Dense black speed lines radiate from the centre out to every edge of the image, framing Pikachu like a spotlight. Cracked ground and flying rock debris around its feet. Big bold outlined katakana sound effects in grey screentone: ドォン!! across the top left and top right corners, ドン!! in the lower left and lower right corners, all kept clear of Pikachu. Pikachu fills about 40% of the image height, the centre of its body on the centre of the image, symmetrical composition. Bottom fifth of the image calmer, with only debris and speed lines. No colour, no panel border, no watermark, no other characters. 16:9, 1376x768 pixels.
```

## Charizard - Blast Burn - `art/arena/fx/ult-6.png`

```
Black-and-white Japanese manga impact panel, clean black ink line art with grey halftone screentone shading, the same style as the attached reference image. Charizard (an orange dragon with a cream belly, huge wings with dark teal undersides, two horns, and a flame burning on the tip of its tail) stands EXACTLY IN THE CENTRE of the image, full body, facing the viewer, wings spread wide and symmetrical, head thrown back roaring, unleashing Blast Burn: a column of fire erupts from the ground around it and towering flames billow up behind its wings on both sides. Dense black speed lines radiate from the centre out to every edge of the image, framing Charizard like a spotlight. Cracked, scorched ground and flying rock debris around its feet. Big bold outlined katakana sound effects in grey screentone: ドォン!! across the top left and top right corners, ドン!! in the lower left and lower right corners, all kept clear of Charizard. Charizard fills about 55% of the image height, the centre of its body on the centre of the image, symmetrical composition. Bottom fifth of the image calmer, with only debris and speed lines. No colour, no panel border, no watermark, no other characters. 16:9, 1376x768 pixels.
```

## Blastoise - Hydro Cannon - `art/arena/fx/ult-9.png`

```
Black-and-white Japanese manga impact panel, clean black ink line art with grey halftone screentone shading, the same style as the attached reference image. Blastoise (a large bipedal blue tortoise with a heavy brown shell and two water cannons sticking up out of its shell over its shoulders) stands EXACTLY IN THE CENTRE of the image, full body, facing the viewer, feet planted wide, mouth open, unleashing Hydro Cannon: both shoulder cannons blast enormous jets of water straight toward the viewer, spraying and curling outward to both sides in great splashes. Dense black speed lines radiate from the centre out to every edge of the image, framing Blastoise like a spotlight. Cracked wet ground, water droplets and rock debris around its feet. Big bold outlined katakana sound effects in grey screentone: ドォン!! across the top left and top right corners, ドン!! in the lower left and lower right corners, all kept clear of Blastoise. Blastoise fills about 55% of the image height, the centre of its body on the centre of the image, symmetrical composition. Bottom fifth of the image calmer, with only debris and speed lines. No colour, no panel border, no watermark, no other characters. 16:9, 1376x768 pixels.
```

## Venusaur - Frenzy Plant - `art/arena/fx/ult-3.png`

```
Black-and-white Japanese manga impact panel, clean black ink line art with grey halftone screentone shading, the same style as the attached reference image. Venusaur (a large squat four-legged blue-green reptile with a huge pink flower in full bloom on its back, surrounded by broad palm-like leaves) stands EXACTLY IN THE CENTRE of the image, full body, facing the viewer head-on, glaring, unleashing Frenzy Plant: enormous thorny vines and roots burst up out of the ground on both sides of it and whip outward toward the edges. Dense black speed lines radiate from the centre out to every edge of the image, framing Venusaur like a spotlight. Cracked ground and flying rock debris around its feet. Big bold outlined katakana sound effects in grey screentone: ドォン!! across the top left and top right corners, ドン!! in the lower left and lower right corners, all kept clear of Venusaur. Venusaur fills about 50% of the image height, the centre of its body on the centre of the image, symmetrical composition. Bottom fifth of the image calmer, with only debris and speed lines. No colour, no panel border, no watermark, no other characters. 16:9, 1376x768 pixels.
```

# ULTI impact sequences - image prompts

Each famous Pokemon's ULTI can play a SEQUENCE of up to four stills (the game cuts between them every third of a second, then the move's name lands low and centred).
Save each still under the exact path shown, then run `npm run fx`. A Pokemon with any `ult-<id>-<n>.png` plays its sequence instead of its single panel.

**Keeping one character across the stills:** generate still 1 first, then attach it as a reference image when generating 2 and 3, and add "the same character as the reference image". One image with several panels on it is not reliable - the generator changes the character between panels - so make each still its own image.

## Pikachu - Thunder

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-25-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Pikachu (a small chubby mouse with long pointed ears tipped black, round cheek pouches crackling with electricity and a lightning-bolt shaped tail) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Thunder starts to gather around it - the first signs of jagged lightning bolts crashing down from the sky around it. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-25-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat electric yellow background, Pikachu (a small chubby mouse with long pointed ears tipped black, round cheek pouches crackling with electricity and a lightning-bolt shaped tail) drawn as a near-black silhouette with its inner details picked out in glowing white-hot lines and a bright white-hot rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Thunder - jagged lightning bolts crashing down from the sky around it, rendered as bold flame-like white-hot shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-25-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat electric yellow, cyan and white, plus a few glowing yellow-orange light orbs and curved motion streaks. Pikachu (a small chubby mouse with long pointed ears tipped black, round cheek pouches crackling with electricity and a lightning-bolt shaped tail) in a full-body dramatic low-angle hero shot, Thunder exploding toward the camera - jagged lightning bolts crashing down from the sky around it. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Charizard - Blast Burn

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-6-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Charizard (an upright orange dragon with large bat-like wings, a long neck, two horns at the back of its head, a cream belly and a flame burning on the tip of its tail) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Blast Burn starts to gather around it - the first signs of a huge eruption of fire exploding outward from where it stands. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-6-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat crimson red background, Charizard (an upright orange dragon with large bat-like wings, a long neck, two horns at the back of its head, a cream belly and a flame burning on the tip of its tail) drawn as a near-black silhouette with its inner details picked out in glowing orange lines and a bright orange rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Blast Burn - a huge eruption of fire exploding outward from where it stands, rendered as bold flame-like orange shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-6-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat flame orange, blood red and hot yellow, plus a few glowing yellow-orange light orbs and curved motion streaks. Charizard (an upright orange dragon with large bat-like wings, a long neck, two horns at the back of its head, a cream belly and a flame burning on the tip of its tail) in a full-body dramatic low-angle hero shot, Blast Burn exploding toward the camera - a huge eruption of fire exploding outward from where it stands. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Blastoise - Hydro Cannon

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-9-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Blastoise (a large bipedal blue turtle with a heavy brown shell, two steel water cannons jutting from the top of the shell, small ears and a cream belly) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Hydro Cannon starts to gather around it - the first signs of two enormous blasts of water firing from its shell cannons. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-9-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat cobalt blue background, Blastoise (a large bipedal blue turtle with a heavy brown shell, two steel water cannons jutting from the top of the shell, small ears and a cream belly) drawn as a near-black silhouette with its inner details picked out in glowing aqua lines and a bright aqua rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Hydro Cannon - two enormous blasts of water firing from its shell cannons, rendered as bold flame-like aqua shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-9-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat deep blue, teal and white, plus a few glowing yellow-orange light orbs and curved motion streaks. Blastoise (a large bipedal blue turtle with a heavy brown shell, two steel water cannons jutting from the top of the shell, small ears and a cream belly) in a full-body dramatic low-angle hero shot, Hydro Cannon exploding toward the camera - two enormous blasts of water firing from its shell cannons. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Venusaur - Frenzy Plant

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-3-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Venusaur (a squat four-legged blue-green toad-like body with a huge pink flower and broad leaves blooming on its back over a thick trunk) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Frenzy Plant starts to gather around it - the first signs of giant thorned roots and vines bursting up out of the ground around it. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-3-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat lime green background, Venusaur (a squat four-legged blue-green toad-like body with a huge pink flower and broad leaves blooming on its back over a thick trunk) drawn as a near-black silhouette with its inner details picked out in glowing white lines and a bright white rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Frenzy Plant - giant thorned roots and vines bursting up out of the ground around it, rendered as bold flame-like white shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-3-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat emerald green, flower pink and leaf yellow, plus a few glowing yellow-orange light orbs and curved motion streaks. Venusaur (a squat four-legged blue-green toad-like body with a huge pink flower and broad leaves blooming on its back over a thick trunk) in a full-body dramatic low-angle hero shot, Frenzy Plant exploding toward the camera - giant thorned roots and vines bursting up out of the ground around it. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Mewtwo - Psystrike

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-150-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Mewtwo (a tall pale humanoid feline with a tube running from the back of its skull to its neck, three-fingered hands with round tips and a long thick purple tail) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Psystrike starts to gather around it - the first signs of a warped shockwave of psychic force rippling out from its raised hand. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-150-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat magenta background, Mewtwo (a tall pale humanoid feline with a tube running from the back of its skull to its neck, three-fingered hands with round tips and a long thick purple tail) drawn as a near-black silhouette with its inner details picked out in glowing violet lines and a bright violet rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Psystrike - a warped shockwave of psychic force rippling out from its raised hand, rendered as bold flame-like violet shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-150-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat purple, hot pink and white, plus a few glowing yellow-orange light orbs and curved motion streaks. Mewtwo (a tall pale humanoid feline with a tube running from the back of its skull to its neck, three-fingered hands with round tips and a long thick purple tail) in a full-body dramatic low-angle hero shot, Psystrike exploding toward the camera - a warped shockwave of psychic force rippling out from its raised hand. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Gengar - Shadow Storm

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-94-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Gengar (a round purple ghost with no neck, a spiky back, pointed ears, narrow red eyes and a wide sinister grin full of teeth) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Shadow Storm starts to gather around it - the first signs of a storm of shadow orbs and grasping ghostly hands surging out around it. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-94-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat deep violet background, Gengar (a round purple ghost with no neck, a spiky back, pointed ears, narrow red eyes and a wide sinister grin full of teeth) drawn as a near-black silhouette with its inner details picked out in glowing red lines and a bright red rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Shadow Storm - a storm of shadow orbs and grasping ghostly hands surging out around it, rendered as bold flame-like red shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-94-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat dark purple, blood red and lilac, plus a few glowing yellow-orange light orbs and curved motion streaks. Gengar (a round purple ghost with no neck, a spiky back, pointed ears, narrow red eyes and a wide sinister grin full of teeth) in a full-body dramatic low-angle hero shot, Shadow Storm exploding toward the camera - a storm of shadow orbs and grasping ghostly hands surging out around it. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Lucario - Aura Sphere

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-448-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Lucario (a bipedal blue-and-black jackal with a cream chest tuft, a spike on the back of each paw and one on its chest, and four black appendages hanging from the back of its head) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Aura Sphere starts to gather around it - the first signs of a blazing sphere of blue aura gathering between its palms. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-448-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat royal blue background, Lucario (a bipedal blue-and-black jackal with a cream chest tuft, a spike on the back of each paw and one on its chest, and four black appendages hanging from the back of its head) drawn as a near-black silhouette with its inner details picked out in glowing cyan lines and a bright cyan rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Aura Sphere - a blazing sphere of blue aura gathering between its palms, rendered as bold flame-like cyan shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-448-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat royal blue, cyan and white, plus a few glowing yellow-orange light orbs and curved motion streaks. Lucario (a bipedal blue-and-black jackal with a cream chest tuft, a spike on the back of each paw and one on its chest, and four black appendages hanging from the back of its head) in a full-body dramatic low-angle hero shot, Aura Sphere exploding toward the camera - a blazing sphere of blue aura gathering between its palms. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Gyarados - Hyper Beam

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-130-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Gyarados (a huge blue serpentine sea dragon with a wide gaping mouth, long whisker barbels, a crown-like crest on its head and fin ridges down its back) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Hyper Beam starts to gather around it - the first signs of a colossal beam of energy blasting from its jaws. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-130-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat navy blue background, Gyarados (a huge blue serpentine sea dragon with a wide gaping mouth, long whisker barbels, a crown-like crest on its head and fin ridges down its back) drawn as a near-black silhouette with its inner details picked out in glowing orange lines and a bright orange rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Hyper Beam - a colossal beam of energy blasting from its jaws, rendered as bold flame-like orange shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-130-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat ocean blue, gold and white, plus a few glowing yellow-orange light orbs and curved motion streaks. Gyarados (a huge blue serpentine sea dragon with a wide gaping mouth, long whisker barbels, a crown-like crest on its head and fin ridges down its back) in a full-body dramatic low-angle hero shot, Hyper Beam exploding toward the camera - a colossal beam of energy blasting from its jaws. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Snorlax - Giga Impact

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-143-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Snorlax (an enormous round sleepy bear-like Pokémon with a dark teal body, a cream belly and face, pointed ears, closed eyes and tiny clawed feet) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Giga Impact starts to gather around it - the first signs of a crushing shockwave of force as it charges belly-first. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-143-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat deep teal background, Snorlax (an enormous round sleepy bear-like Pokémon with a dark teal body, a cream belly and face, pointed ears, closed eyes and tiny clawed feet) drawn as a near-black silhouette with its inner details picked out in glowing cream lines and a bright cream rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Giga Impact - a crushing shockwave of force as it charges belly-first, rendered as bold flame-like cream shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-143-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat dark teal, cream and orange, plus a few glowing yellow-orange light orbs and curved motion streaks. Snorlax (an enormous round sleepy bear-like Pokémon with a dark teal body, a cream belly and face, pointed ears, closed eyes and tiny clawed feet) in a full-body dramatic low-angle hero shot, Giga Impact exploding toward the camera - a crushing shockwave of force as it charges belly-first. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Rayquaza - Dragon Ascent

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-384-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Rayquaza (a very long green serpentine sky dragon with yellow ring markings along its body, fin-like wings and a long head with ridged horns and a mask-like jaw) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Dragon Ascent starts to gather around it - the first signs of a spiralling vortex of dragon energy as it plunges from the sky. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-384-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat emerald green background, Rayquaza (a very long green serpentine sky dragon with yellow ring markings along its body, fin-like wings and a long head with ridged horns and a mask-like jaw) drawn as a near-black silhouette with its inner details picked out in glowing gold lines and a bright gold rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Dragon Ascent - a spiralling vortex of dragon energy as it plunges from the sky, rendered as bold flame-like gold shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-384-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat emerald green, gold and red, plus a few glowing yellow-orange light orbs and curved motion streaks. Rayquaza (a very long green serpentine sky dragon with yellow ring markings along its body, fin-like wings and a long head with ridged horns and a mask-like jaw) in a full-body dramatic low-angle hero shot, Dragon Ascent exploding toward the camera - a spiralling vortex of dragon energy as it plunges from the sky. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Tyranitar - Stone Edge

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-248-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Tyranitar (a huge armoured green bipedal kaiju with spiked back plates, a horn on its head, a blue diamond-shaped hole in its chest plates and a thick tail) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Stone Edge starts to gather around it - the first signs of giant jagged stone spikes erupting out of the ground around it. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-248-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat sandy ochre background, Tyranitar (a huge armoured green bipedal kaiju with spiked back plates, a horn on its head, a blue diamond-shaped hole in its chest plates and a thick tail) drawn as a near-black silhouette with its inner details picked out in glowing white lines and a bright white rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Stone Edge - giant jagged stone spikes erupting out of the ground around it, rendered as bold flame-like white shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-248-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat olive green, ochre and stone grey, plus a few glowing yellow-orange light orbs and curved motion streaks. Tyranitar (a huge armoured green bipedal kaiju with spiked back plates, a horn on its head, a blue diamond-shaped hole in its chest plates and a thick tail) in a full-body dramatic low-angle hero shot, Stone Edge exploding toward the camera - giant jagged stone spikes erupting out of the ground around it. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Garchomp - Dragon Rush

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-445-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Garchomp (a sleek dark blue land-shark dragon with hammer-shaped head fins, jet-like fins with claws on its arms, a red belly and a notch in its dorsal fin) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Dragon Rush starts to gather around it - the first signs of a roaring aura of dragon energy wrapped around it as it rockets forward. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-445-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat indigo background, Garchomp (a sleek dark blue land-shark dragon with hammer-shaped head fins, jet-like fins with claws on its arms, a red belly and a notch in its dorsal fin) drawn as a near-black silhouette with its inner details picked out in glowing red lines and a bright red rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Dragon Rush - a roaring aura of dragon energy wrapped around it as it rockets forward, rendered as bold flame-like red shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-445-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat indigo, crimson and gold, plus a few glowing yellow-orange light orbs and curved motion streaks. Garchomp (a sleek dark blue land-shark dragon with hammer-shaped head fins, jet-like fins with claws on its arms, a red belly and a notch in its dorsal fin) in a full-body dramatic low-angle hero shot, Dragon Rush exploding toward the camera - a roaring aura of dragon energy wrapped around it as it rockets forward. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Greninja - Water Shuriken

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-658-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Greninja (a slender blue ninja frog with a long pink tongue wrapped around its neck like a scarf, a crest on its head and webbed hands and feet) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Water Shuriken starts to gather around it - the first signs of a giant spinning shuriken of water held ready to throw. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-658-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat deep blue background, Greninja (a slender blue ninja frog with a long pink tongue wrapped around its neck like a scarf, a crest on its head and webbed hands and feet) drawn as a near-black silhouette with its inner details picked out in glowing white lines and a bright white rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Water Shuriken - a giant spinning shuriken of water held ready to throw, rendered as bold flame-like white shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-658-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat deep blue, tongue pink and white, plus a few glowing yellow-orange light orbs and curved motion streaks. Greninja (a slender blue ninja frog with a long pink tongue wrapped around its neck like a scarf, a crest on its head and webbed hands and feet) in a full-body dramatic low-angle hero shot, Water Shuriken exploding toward the camera - a giant spinning shuriken of water held ready to throw. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Gardevoir - Moonblast

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-282-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Gardevoir (an elegant white humanoid with a flowing gown-like lower body, green hair framing her face and a red horn-like fin on her chest and back) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Moonblast starts to gather around it - the first signs of a blazing pale moon of fairy light gathering between her outstretched hands. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-282-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat pale pink background, Gardevoir (an elegant white humanoid with a flowing gown-like lower body, green hair framing her face and a red horn-like fin on her chest and back) drawn as a near-black silhouette with its inner details picked out in glowing white lines and a bright white rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Moonblast - a blazing pale moon of fairy light gathering between her outstretched hands, rendered as bold flame-like white shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-282-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat rose pink, mint green and white, plus a few glowing yellow-orange light orbs and curved motion streaks. Gardevoir (an elegant white humanoid with a flowing gown-like lower body, green hair framing her face and a red horn-like fin on her chest and back) in a full-body dramatic low-angle hero shot, Moonblast exploding toward the camera - a blazing pale moon of fairy light gathering between her outstretched hands. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

## Blaziken - Blaze Kick

**Still 1: The gather - pencil sketch, face to face** - save as `art/arena/fx/ult-257-1.png`

```
Anime impact frame drawn as a rough pencil and charcoal sketch on white paper, heavy graphite hatching and smudged shading, grayscale only, in the style of the One Piece Gear 5 sketch-animation cuts. Blaziken (a tall bipedal red fighting bird with a cream feathered mane, long V-shaped head feathers, talon feet and wrists bursting into flame) faces the camera head-on in a close-up from the chest up, eyes glowing pure white, as the power of Blaze Kick starts to gather around it - the first signs of a flaming kick with fire trailing from its leg. Rough speed lines burst outward from behind it toward every edge. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 2: The inversion - colour-inverted, low angle** - save as `art/arena/fx/ult-257-2.png`

```
Inverted-colour anime impact frame in two or three flat colours, in the style of One Piece's inverted Gear 5 cuts: a flat scarlet red background, Blaziken (a tall bipedal red fighting bird with a cream feathered mane, long V-shaped head feathers, talon feet and wrists bursting into flame) drawn as a near-black silhouette with its inner details picked out in glowing yellow lines and a bright yellow rim light, seen in three-quarter view from a low angle, mid-motion, unleashing Blaze Kick - a flaming kick with fire trailing from its leg, rendered as bold flame-like yellow shapes. High contrast, no gradients beyond the glow. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```

**Still 3: The strike - limited-palette cel shading, hero shot** - save as `art/arena/fx/ult-257-3.png`

```
Limited-palette cel-shaded anime impact frame on a PURE BLACK background, in the style of Zoro's Asura cuts in the One Piece anime: only flat scarlet, orange and yellow, plus a few glowing yellow-orange light orbs and curved motion streaks. Blaziken (a tall bipedal red fighting bird with a cream feathered mane, long V-shaped head feathers, talon feet and wrists bursting into flame) in a full-body dramatic low-angle hero shot, Blaze Kick exploding toward the camera - a flaming kick with fire trailing from its leg. Sharp graphic shapes and flat fills, no gradients, no texture. The subject is CENTRED: its body sits in the middle of the frame, the image's centre on it. Keep the bottom fifth of the image calmer and less detailed, because the game writes the move's name there. No text, no lettering, no sound effects, no panel border, no watermark. 16:9, 1920x1080 pixels.
```
