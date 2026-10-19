# Making custom event Pokémon sprites (recolours, accessories, themed/fused looks) that match existing pixel sprites

Researched 2026-10-19. About 17 tool calls. Most sources are community or vendor pages; I found no official Game Freak documentation. Anything taken from my own background knowledge rather than a fetched source is marked **[unverified]**.

## Programmatic methods on existing sprites (palette swaps, accessory overlays, outline/glow, open-source tools)

### Takeaway
A palette swap is how official shinies work, and it is the cheapest method that reliably reads as "official": same pixels, new colours per palette index. In Aseprite this is native (indexed mode, edit an entry, every pixel using it changes), and in Pillow it is a few lines. The safe rule comes from Smogon CAP's shiny rules: change colours only, and keep each colour's relative hue and brightness. Accessory overlays need a per-species anchor point. I found no public source on how Pokémon GO or fan games place hats, so treat anchors as hand-entered data.

### Cited Findings
- Official shinies reuse the regular sprite and change only its colours ("uses the original sprites of the regular species with only a palette swap"). The stated reason was memory and colour limits on early hardware — [Giant Bomb: Palette Swap](https://giantbomb.com/wiki/Concepts/Palette_Swap); [Serebii forum post](https://forums.serebii.net/threads/breeding-to-change-the-appearance-of-hgss-egg-pokemon.393902/post-9708360). These are community explanations, not Game Freak documentation.
- Community analysis says Gen 2 shinies were picked from a constrained set of colours, and that Gen 3 onward had many more colours to work with. Some shinies look odd (for example, blues and yellows drifting toward green) because of encoding — [r/TheSilphRoad thread](https://nyc1.lr.ggtyler.dev/r/TheSilphRoad/comments/b62m0d/why_some_shinies_look_bad/ejib96g/?context=3); [Cyberpost](https://cyberpost.co/?p=1068980). This is secondary-source speculation.
- Smogon CAP shiny rules, the closest thing to a published "official-looking recolour" standard:
  - Shinies "must be submitted as palette swaps of the winning sprite entry. No other modifications to the image may be made."
  - "Colors in a shiny palette must have the same relative hue and brightness compared to the corresponding color on the original sprite." Swapping light blue for light red is acceptable; swapping it for dark green is not.
  - Sources: [CAP 36 Shiny Palette Submissions](https://www.smogon.com/forums/posts/10645412); [Sprite/Shiny palette suggestions](https://www.smogon.com/forums/goto/post?id=7970630).
- Aseprite's indexed mode: "each pixel has a number that references a palette color… if you modify the palette color, all pixels that are referencing that color will change their appearance." Transparency is a special index, "Generally this index is 0", which you can change in Sprite > Properties — [Aseprite docs: Color Mode](https://www.aseprite.org/docs/color-mode/).
- Aseprite extensions for building ramps and recolouring:
  - Smart Palette builds shading ramps that hue-shift warm at highlights and cool at shadows — [Aseprite community: Smart Palette](https://community.aseprite.org/t/extension-smart-palette/28320).
  - Heos ColorShift recolours animated sprites but does not support indexed or greyscale sprites — [itch.io: Heos ColorShift](https://heosphorus.itch.io/heos-color-shift).
  - Aseprite ColourShiftTool is another option — [itch.io](https://adkmfs-god.itch.io/aseprite-colourshifttool-by-adkmfs).
- Hue-shifting convention: brighter tones lean toward red/yellow and darker tones toward blue/purple — [Aseprite community thread](https://community.aseprite.org/t/how-do-i-make-cohesive-color-palettes-on-aseprite/7983/2). A counterpoint, attributed to Pixel Parmesan, says hue-shifting is "not a distinct concept", because light and local colour drive it — same thread. For palette-building theory, see [Slynyrd Pixelblog 1: Color Palettes](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes).
- Pokémon GO's event hats (Party Hat Pikachu and others) are reused across years. One 2018 article says the Pokémon Day Pikachu was "the same exact one they unleashed last year" — [Inverse](https://inverse.com/article/41690-pokemon-go-festive-hat-pikachu-anniversary); event list at [Bulbapedia: Event Pokémon (GO)](https://bulbapedia.bulbagarden.net/wiki/Event_Pok%C3%A9mon_(GO)). GO uses 3D models, so its hats are modelled assets, not 2D overlays **[inference]**.
- Fused looks: Pokémon Infinite Fusion makes "autogen" sprites by splicing one Pokémon as the head and another as the body. The community draws custom sprites over them. Infinite Dex counts 327,207 fusions, about 52% with at least one custom sprite, and "thousands of sprites are created each month" — [Infinite Dex FAQ](https://infinitefusiondex.com/faq); [Prima Games](https://primagames.com/tips/how-to-use-pokemon-infinite-fusion-generator). Prima also says autogen results are often unsuccessful ("not all combinations will be successful").

### Inferences
- **Recolour pipeline for Dexora (Pillow).** Collect the sprite's unique opaque colours, sort them into ramps by hue, and map each ramp to a target ramp of the same length and the same lightness order. Keep the outline colour(s) and pure white/black unless the theme demands otherwise. This matches Smogon's "same relative hue and brightness" rule. A hand-picked map per species beats a global hue rotation, because a rotation also moves outline and eye colours, which is what makes a recolour look fake.
  - Ponytail note: a global HSV hue shift on non-outline pixels is the one-line version. Expect it to work for monochrome-ish species and look wrong on multi-colour ones.
- **Sprite sizes differ by generation in Dexora.** FRLG/HGSS/BW sprites are 64–96px and PokeAPI renders are larger and may be anti-aliased. Recolours of GBA-era sprites will look most "official". PokeAPI renders with soft edges have too many colours to remap cleanly and need quantising first (e.g. Pillow `quantize`).
- **Accessories.** Draw each accessory once at native pixel scale with the game's outline colour. Store an (x, y, flip) anchor per species in a small JSON written by hand. Composite with `Image.alpha_composite` at integer offsets, never resized.
  - The anchor is cheap to enter by eye for "a few per event". Automatic head detection is not worth building at this volume.
  - Order matters: re-outline after compositing, so the hat and the body share one 1px dark outline.
- **Outline/glow ("corrupted", "shadow").** Dilate the alpha mask by 1px and fill the new ring with one colour. That gives the outline; repeat with lower alpha for a glow, though a glow breaks the pixel style unless it is kept to 1–2 solid rings.
  - Dexora already does mask dilation for the Diamond halo (`--dil`, see CLAUDE.md). The same idea can be baked at build time.

### Gaps
- I found no source on how Pokémon GO, Pokémon Showdown or fan games compute hat anchor points or detect heads. Some fan engines may store per-species offsets, but this is unverified.
- I found no maintained GitHub "Pokémon sprite palette swap" project to cite. PKHeX edits save data, not sprites, and does not apply **[unverified/background]**.
- GBA hardware palette facts were not confirmed by a fetched source: 16 colours per 4bpp palette, index 0 transparent, so at most 15 visible colours per sprite **[unverified]**. A Cornell GBA demo confirms the 16-colour and 256-colour sprite modes exist — [Cornell CS212 GBA notes](https://www.cs.cornell.edu/courses/cs212/2008sp/Sections/Week%205/AdvSprites.pdf). For confirmation, check GBATEK or count colours in Dexora's own FRLG PNGs.

## AI image generation for pixel-art sprites (tools, transparency, palette, post-processing, limits, licensing, IP)

### Takeaway
General models (Midjourney and the like) produce "fake pixel art": off-grid, blurry, too many colours. They need a grid-detect, quantise and downscale pass, then hand cleanup. Pixel-specific services (Retro Diffusion, PixelLab) claim uniform pixels, transparent backgrounds and palette locking, and PixelLab offers inpainting on a reference image. Inpainting an existing sprite is the best AI route for "this Pokémon in a hat". Generating a whole Pokémon from text will go off-model. Tool terms give you the output, but they put third-party IP responsibility on you, and the designs remain Nintendo's.

### Cited Findings
- **Why diffusion output is not real pixel art** — [DEV: How to tame your AI pixel art (unfake author)](https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5):
  - "There's no concept of hard edges, clean pixels, or fixed palettes."
  - The grid drifts, cells bleed, and the palette is oversized.
  - Naive nearest-neighbour resizing gives a "muddy" result.
- **Recommended cleanup pipeline** (same source):
  1. Detect the pixel scale from edge profiles.
  2. Align the grid offset.
  3. Quantise with Wu's algorithm to a small fixed palette.
  4. Downscale each block to its dominant colour.
  5. Run a morphological cleanup, then re-quantise.
  - It also says messy outputs "may still need manual tweaks… or a final pass in a pixel editor".
- **`unfake`** (pip, MIT, v1.0.7, Oct 2025) implements that pipeline — [PyPI: unfake](https://pypi.org/project/unfake/):
  - scale detection;
  - Wu quantisation, including to a *fixed palette file*;
  - "dominant" downscale (plus median, mode, mean and content-adaptive);
  - stray-pixel cleanup;
  - edge flood-fill to a transparent background;
  - grid snapping.
  - Python 3.10+, with both a CLI and an API.
- **Other cleanup tools:**
  - DeAI PixelKit, an Aseprite 1.3+ extension (Windows-only), snaps fake pixel grids to true resolution and removes backgrounds — [itch.io](https://onlyjasoncando.itch.io/deai-pixelkit).
  - PixelFixer, a standalone Windows app — [itch.io](https://pyezo.itch.io/pixelfixer).
  - Phaser's Tidy Pixel Art, a web tool — [phaser.io](https://phaser.io/tools/tidy-pixel-art).
  - Plain nearest-neighbour can "add new colors to your palette wherever two colors meet" — [Pixelizer, itch.io](https://dilligan.itch.io/pixelizer).
- **Midjourney and general models:** a vendor comparison says Midjourney's pixel look "drifts off-grid" — [SpriteCook comparison](https://www.spritecook.ai/compare/midjourney). This is a competitor's marketing page. Retro Diffusion, itself a vendor, says general models give uneven pixel sizes, wobbly outlines and blur — [Runware blog on Retro Diffusion](https://runware.ai/blog/retro-diffusion-creating-authentic-pixel-art-with-ai-at-scale).
- **Retro Diffusion:**
  - "RD Plus" accepts an uploaded limited-palette image so output uses only those colours, and can output a transparent background. It is "not ideal" for animation or tilesets — [Scenario help: Retro Diffusion Models](https://help.scenario.com/en/articles/retro-diffusion-models-the-essentials/).
  - Its MCP listing gives sizes of 16×16 to 384×384 and about $0.015 (RD Fast) to $0.18 (RD Pro) per image — [mcpservers.org listing](https://mcpservers.org/fr/servers/retro-diffusion/retro-diffusion-mcp).
  - The official site did not render for fetching, so prices are unverified against retrodiffusion.ai.
- **PixelLab:**
  - Its site lists "True inpainting", reference-based/style-consistent generation, 4- or 8-direction rotation, skeleton and text animation, and a free trial ("No credit card required"). Pricing did not load — [pixellab.ai](https://www.pixellab.ai/).
  - Terms (updated 2025-11-23): "You retain ownership of any content you create." Use is permitted "for both commercial and non-commercial purposes". Outputs may not train other models without permission. "you bear full legal responsibility for ensuring that the content… does not infringe on the rights of any third parties" — [PixelLab Terms of Service](https://www.pixellab.ai/termsofservice).
- **IP caution:**
  - Nintendo/TPC have issued DMCA notices against fan games and their distributors: Pokémon Uranium (2016), Pokémon Prism (2016), 562 Game Jolt games (2016), the Pokémon Essentials wiki, and the Relic Castle fan-game repository (March 2024) — [GGRecon](https://ggrecon.com/articles/hundreds-of-fan-made-pokemon-games-have-reportedly-been-culled); [BGR](https://www.bgr.com/entertainment/nintendo-dmca-fan-games-game-jolt/); [TechSpot](https://www.techspot.com/community/topics/nintendo-slaps-fan-game-creation-tool-pokemon-essentials-with-dmca-takedown.248798/).
  - Owning an AI output does not license the Pokémon design it depicts **[inference from PixelLab §3.3's third-party clause]**.

### Inferences
- **Best AI workflow for Dexora's owner, who generates art from prompts.** Give the tool the real sprite (upscaled ×4 nearest-neighbour) as the reference or inpaint base, and mask only the accessory region (hat, scarf, flower crown). Then bring it back with `unfake` (fixed palette = the species' own palette plus 2–4 accessory colours) and downscale to the original size. Final touch-ups go in Aseprite or LibreSprite. Text-to-image of a whole species will drift off-model, so avoid it for named species.
- **Prompt shape.** "<species> wearing a <red scarf>, Pokémon Gen 3 GBA front sprite, 64x64 pixel art, 1px dark outline, flat cel shading, max 16 colours, no anti-aliasing, transparent background, side-facing 3/4 view." Then verify the colour count by script; don't trust the prompt.
- Retro Diffusion's palette upload maps neatly onto "use this sprite's palette". PixelLab's inpainting maps onto "add a hat to this sprite". Which one is cleaner is untested.
- Dexora already Scale2x's small Showdown sources (`strip_frames.py`). Never let an AI or bilinear upscale reach the shipped file: ship native pixels and let CSS `image-rendering: pixelated` scale them.

### Gaps
- I found no independent side-by-side quality test of Retro Diffusion vs PixelLab vs Midjourney on Pokémon-style sprites.
- I did not retrieve Retro Diffusion's or Midjourney's current terms for non-commercial use.
- I did not retrieve PixelLab's plan prices or canvas size limits; the page loaded them dynamically.
- I found no source on whether any tool refuses Pokémon names in prompts (content filters on trademarked characters) **[unverified]**.

## Hand-drawing and editing (Aseprite, LibreSprite, Piskel, frankensprites, time per sprite)

### Takeaway
Editing an official sprite by hand is the fan-community norm: recolours, splices and "frankensprites" built from parts of existing sprites. Aseprite's indexed mode makes recolours a palette edit. Infinite Fusion shows a splice starts as an automatic head/body cut and becomes a good sprite only after a human redraw. I found no sourced per-sprite time estimate.

### Cited Findings
- Aseprite indexed mode and the transparent index (see above) — [Aseprite docs](https://www.aseprite.org/docs/color-mode/).
- Infinite Fusion's autogen splices are fan-generated and "not all combinations will be successful". Community artists replace them with custom sprites, and over half of 327k fusions now have one — [Prima Games](https://primagames.com/tips/how-to-use-pokemon-infinite-fusion-generator); [Infinite Dex FAQ](https://infinitefusiondex.com/faq).
- Pixel art "by definition, does not utilize anti-aliased tools" in the automatic sense; any anti-aliasing is placed by hand — [Pixel Parmesan: Anti-Aliasing Fundamentals](https://pixelparmesan.com/anti-aliasing-fundamentals-for-pixel-artists).

### Inferences
- **Tools [background, unverified here].** Aseprite is paid, about $20 on Steam/itch, or free if you compile it from source. LibreSprite is a free GPL fork of an older Aseprite. Piskel is free and runs in a browser. All three are enough for 64–96px edits.
- **Rough effort guesses [unverified, my estimate].**
  - A recolour of one sprite: minutes.
  - An accessory added by hand: well under an hour per species once the accessory is drawn.
  - A two-species splice cleaned to an official standard: hours.

### Gaps
- No sourced time per sprite.
- I found no PokéCommunity or r/PokemonRMXP splicing tutorial (searches were not run for these; budget limit).

## Commissions (prices, turnaround)

### Takeaway
Pokémon-style sprite commissions seen in October 2026 listings run about $12 for a small 50×50 sprite and about $30 for a 128×128 BW-style sprite on an artist's own page. Fiverr gigs run roughly $20/hour, or up to about $50 for a front, back and icon set. I found no turnaround data.

### Cited Findings
- $12 for a 50×50 full-body sprite (basic shading, static or animated); $30 for "Pokémon BW Style (128 x 128 px)" — [Tigerhorse's Pixel Commissions](https://tigerhorse-pixel-commissions.carrd.co).
- A Fiverr 64×64 fakemon sprite gig, with buyer-reported orders "Up to $50"; back and overworld sprites are quoted separately — [Fiverr: pollorenz](https://fiverr.com/pollorenz/make-sprite-of-custom-pokemon).
- Another Fiverr seller charges $20/hour — [Fiverr: yogurcomics](https://fiverr.com/yogurcomics/create-a-sprite-sheet).

### Inferences
- A handful of event variants a season is cheap to commission ($15–50 each). Specify:
  - the source sprite;
  - native pixel size;
  - "palette = source palette plus N colours";
  - "same 1px outline colour as the source";
  - "no anti-aliasing against transparency".

### Gaps
- No turnaround times found.
- Listing prices change and may be stale.
- I did not check Reddit r/HungryArtists-style rates.

## Quality bar: what makes a custom variant read as official

### Takeaway
A variant reads as "official" when it keeps:
- the source's size and pose;
- its outline colour;
- a colour count near the source's;
- its shading direction and ramp structure;
- a hard (aliased) edge against transparency.

Smogon's rules (same relative hue and brightness, nothing changed but colour) are the published version for recolours. For new parts, the parts must be drawn at the same pixel scale with the same outline.

### Cited Findings
- Smogon CAP:
  - "All sprites (front and back) must use the same color palette".
  - One CAP recommends "no more than 15 unique colors" on a sprite's palette, "though this limit may be broken for complex designs".
  - Shinies keep relative hue and brightness and change nothing else.
  - Sources: [Smogon post 9043514](https://www.smogon.com/forums/posts/9043514/); [CAP 36 shiny rules](https://www.smogon.com/forums/posts/10645412).
- Pixel-art AI output fails mostly on grid, wobbly outlines and a bloated palette — [DEV: unfake author](https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5); [Runware/Retro Diffusion](https://runware.ai/blog/retro-diffusion-creating-authentic-pixel-art-with-ai-at-scale). These are exactly the tells that separate a custom sprite from an official one.
- Anti-aliasing in pixel art is hand-placed and limited — [Pixel Parmesan](https://pixelparmesan.com/anti-aliasing-fundamentals-for-pixel-artists).

### Inferences
- **A build-time checklist Dexora could assert in a script (cheap with Pillow):**
  - same canvas size as the source;
  - unique opaque colours ≤ source count + a small allowance (e.g. +4 for an accessory), and ≤ 15–16 for FRLG-era sources;
  - alpha is only 0 or 255 (no semi-transparent edge pixels);
  - every opaque pixel touching transparency uses an outline colour the source uses;
  - no pixel outside the source's alpha mask dilated by the accessory's area.
- Match the source generation's style per species. A BW-style hat on an FRLG Charizard will look pasted on, because GBA and DS sprites shade differently **[inference]**.
- Event "corrupted" looks fit Dexora's existing pattern: tiers are CSS filters plus layers (CLAUDE.md, `VariantFx`). A one-off event look done as a filter costs no art. Baked art is only needed where the silhouette changes (hats, crowns).

### Gaps
- No primary source gives Game Freak's internal sprite style guide.
- The Smogon Sprite Project's own style-guide thread was not located; only CAP contest rules were found.
