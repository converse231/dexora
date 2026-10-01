import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Boot from "./Boot.jsx";
import { applyTheme } from "./ui/theme.js";
import "./styles.css";

applyTheme();

/* THE ROTOM FACES, SELF-HOSTED (2026-10-01): Rubik for words, Chakra Petch for
   labels and numbers - the "screen" voice that took over from the pixel face
   (`--pixel` keeps its name, so every rule and check.mjs's floor on it still
   apply). Registered here rather than in styles.css because a url() there
   resolves against the BUILT stylesheet and 404s, and self-hosted because the
   game is fully playable offline and a third-party font host was a
   render-blocking request from two more origins. Each file is Latin, SIL OFL
   (public/fonts/OFL.txt), preloaded by index.html. Chakra Petch ships three
   weights, so each file answers for a RANGE: a rule asking 400 gets the 500.
   "Symbols" is the marks neither draws (tools/build_symbols.py). */
for (const [family, file, weight] of [
  ["Rubik", "rubik", "300 900"],
  ["Chakra Petch", "chakra-petch-500", "100 550"],
  ["Chakra Petch", "chakra-petch-600", "551 650"],
  ["Chakra Petch", "chakra-petch-700", "651 900"],
  ["Symbols", "symbols", "100 900"],
]) {
  const face = new FontFace(family, `url(${new URL(`fonts/${file}.woff2`, document.baseURI).href})`,
    { weight, display: "swap" });
  document.fonts.add(face);
  face.load().catch(() => {});   // a failed load keeps the next face in --body / --pixel
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Boot />
  </StrictMode>
);
