/* CRIES (2026-10-14): a Pokemon calls out when you meet it - the games' own
   cry, from public/cries (`npm run cries`). A per-device preference like the
   theme - localStorage, never the save - and on unless turned off on You.
   A browser that cannot play a file's format stays quiet (older iPhones and
   Ogg Vorbis): a cry is a flourish, never information. */
import { CRY_OF, CRY_MP3 } from "../data/cries.js";

const KEY = "dexora-cries";
const VOLUME = 0.35;

export function criesOn() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setCries(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode: this session only */ }
}

const can = typeof Audio === "function" ? new Audio() : null;
const plays = {
  ogg: !!can?.canPlayType('audio/ogg; codecs="vorbis"'),
  mp3: !!can?.canPlayType("audio/mpeg"),
};
let last = null;

export function playCry(id) {
  if (!criesOn()) return;
  const at = CRY_OF[id] ?? id;
  const kind = CRY_MP3.has(at) ? "mp3" : "ogg";
  if (!plays[kind]) return;
  last?.pause();
  last = new Audio(new URL(`cries/${at}.${kind}`, document.baseURI).href);
  last.volume = VOLUME;
  last.play().catch(() => { /* no gesture yet, or the file went missing: silence */ });
}
