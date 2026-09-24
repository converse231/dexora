import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Boot from "./Boot.jsx";
import "./styles.css";

/* THE PIXEL FACE IS PRESS START 2P, SELF-HOSTED, AND REGISTERED HERE RATHER
   THAN IN styles.css. Two reasons, both recorded rules: a relative url() in the
   stylesheet resolves against the BUILT stylesheet and 404s (every other asset
   is built against `document.baseURI` for the same reason), and the game must
   work offline, so its lettering cannot be a request to Google.

   `sizeAdjust` is the one knob. Press Start 2P fills its whole em square where
   Silkscreen, which it replaced, drew caps 0.63em tall - so at the same
   font-size it is 1.47x wider, and every tag, chip and nameplate in this game
   was sized for Silkscreen. Scaling the FACE rather than 103 declarations keeps
   every size in styles.css meaning what it meant. The font is OFL
   (public/fonts/OFL.txt).

   AND ITS LINE BOX IS SET HERE, because its own is barely taller than its
   glyphs: every rule in this game leaves pixel text at `line-height: normal`,
   so a label that wrapped drew its second line on top of its first - the
   Box's SELL button and its summary line both did. The ascent and descent
   make "normal" 1.4em, balanced around the ink (caps sit 0.875em above the
   baseline, descenders 0.125em below), so a one-line label stays centred in
   the padding it was tuned with. */
const pixel = new FontFace("Pixel",
  `url(${new URL("fonts/press-start-2p.woff2", document.baseURI).href})`,
  { sizeAdjust: "90%", ascentOverride: "108%", descentOverride: "32%",
    lineGapOverride: "0%", display: "swap" });
document.fonts.add(pixel);
pixel.load().catch(() => {});   // a failed load falls back to --pixel's next face

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Boot />
  </StrictMode>
);
