import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Boot from "./Boot.jsx";
import { applyTheme } from "./ui/theme.js";
import "./styles.css";

applyTheme();

/* THE PIXEL FACE IS GEIST PIXEL, SELF-HOSTED, AND REGISTERED HERE RATHER
   THAN IN styles.css. Two reasons, both recorded rules: a relative url() in the
   stylesheet resolves against the BUILT stylesheet and 404s (every other asset
   is built against `document.baseURI` for the same reason), and the game must
   work offline, so its lettering cannot be a request to Google.

   `sizeAdjust` is the one knob, and every size in styles.css keeps meaning
   what it meant. Measured against the two faces before it: Geist Pixel is
   PROPORTIONAL and 20% narrower than Silkscreen at the same size (Press Start
   2P, which it replaced, was 47% WIDER), so at 110% it is larger than either
   and still narrower than the Silkscreen every chip was sized for - the room
   that took back is what the horizontal scroll needed. Its own line box
   (ascent 1.01em, descent 0.30em) is normal and centred on the ink, so unlike
   Press Start 2P it needs no metric overrides. The font is OFL
   (public/fonts/OFL.txt). */
const pixel = new FontFace("Pixel",
  `url(${new URL("fonts/geist-pixel.woff2", document.baseURI).href})`,
  { sizeAdjust: "110%", display: "swap" });
document.fonts.add(pixel);
pixel.load().catch(() => {});   // a failed load falls back to --pixel's next face

/* THE TWO TEXT FACES, SELF-HOSTED (2026-09-29). They were a Google Fonts
   stylesheet: a render-blocking request to a third origin and then a second
   origin for the files, before the first paint - and a game that is fully
   playable offline lost its headings to the fallback there. Each is one
   variable woff2 (Latin, SIL OFL - public/fonts/OFL.txt), preloaded by
   index.html, registered here as the pixel face is, for the same reason: a
   url() in styles.css would resolve against the built stylesheet. */
for (const [family, file, weight] of [["Fredoka", "fredoka", "300 700"], ["Nunito Sans", "nunito-sans", "200 1000"]]) {
  const face = new FontFace(family, `url(${new URL(`fonts/${file}.woff2`, document.baseURI).href})`,
    { weight, display: "swap" });
  document.fonts.add(face);
  face.load().catch(() => {});   // a failed load keeps the next face in --display / --body
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Boot />
  </StrictMode>
);
