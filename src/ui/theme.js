/* NIGHT MODE. A per-device preference like "seen" news - localStorage, never
   the save - resolved to `data-theme` on <html>, which is all styles.css
   reads. "auto" follows the system and keeps following it. index.html runs
   the same two lines before the first paint, so a dark page never flashes
   white while the bundle loads. */
const KEY = "dexora-theme";
const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

export const THEMES = ["auto", "dark", "light"];

export function themeChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(choice = themeChoice()) {
  const dark = choice === "dark" || (choice === "auto" && !!media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // The browser's own chrome (the phone's status bar) follows along.
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#111915" : "#2f6b4c");
}

export function setTheme(choice) {
  try { localStorage.setItem(KEY, choice); } catch { /* private mode: this session only */ }
  applyTheme(choice);
}

media?.addEventListener?.("change", () => applyTheme());
