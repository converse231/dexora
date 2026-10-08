/* NOTHING MAY BLANK THE GAME.

   React unmounts the whole tree when render throws, and with no boundary
   anywhere that left an empty page - which is what accepting a trade did on
   2026-10-08. The tab had been open across a deploy, so `TradeScene`'s lazy
   chunk was no longer on the CDN; the 404 rejected the import, Suspense
   rethrew it, and the game vanished. The trade itself had completed on the
   server and the save was never in danger - the player simply had nothing
   left to look at, and no way to know a reload would fix it.

   Two parts, because there are two failures:

   - A LAZY CHUNK THAT IS GONE means this tab is running a build the server
     has replaced, and the fix for that is literally a reload - so it reloads
     itself, once. Every `lazy()` in the game goes through `lazyPage`; a new
     one that does not is a page that can still blank on the next deploy.
   - ANYTHING ELSE gets a card with a Reload button instead of a void. It
     reuses `.sheet` and `.confirm`, so a crash screen can never itself be a
     missing-stylesheet bug. */
import { Component, lazy } from "react";

const RELOADED = "dexora-stale";          // sessionStorage: one reload, never a loop

// Every engine words this differently; all of them are a module that would not load.
const stale = (e) => /dynamically imported module|importing a module script failed|error loading dynamically|failed to fetch/i
  .test(String(e?.message ?? e));

const once = () => {
  try {
    if (sessionStorage.getItem(RELOADED)) return false;
    sessionStorage.setItem(RELOADED, "1");
  } catch { /* a private window has no sessionStorage; one reload is still worth it */ }
  return true;
};

export const lazyPage = (load) => lazy(() => load().catch((e) => {
  if (stale(e) && once()) location.reload();
  throw e;                                // the boundary still has something to show
}));

export class Boundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    /* INLINE STYLES, AND NOT `.sheet`. Two reasons, both load-bearing: a
       stylesheet that failed to load is itself a thing that can get here, so
       the one screen that reports a failure may not depend on CSS; and a
       `.sheet` is a DIALOG, which tools/play rightly holds to `useDismiss` -
       this is a dead end with nothing to dismiss, and a class component has no
       hooks to dismiss it with. */
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 2147483647, display: "grid", placeItems: "center",
        padding: 20, background: "rgba(6, 10, 20, .86)",
        font: "16px/1.5 Rubik, 'Segoe UI', system-ui, sans-serif",
      }}>
        <div role="alert" style={{
          maxWidth: 380, padding: "20px 22px 18px", borderRadius: 18,
          background: "#fff", color: "#141413", boxShadow: "0 24px 60px rgba(0, 0, 0, .5)",
        }}>
          <h3 style={{ margin: "0 0 8px", font: "600 19px/1.25 inherit" }}>Something went wrong</h3>
          <p style={{ margin: "0 0 16px", color: "#4a4a46" }}>
            Your Pok&eacute;mon are saved. Reloading picks the game up where it was.
          </p>
          <button type="button" autoFocus onClick={() => location.reload()} style={{
            width: "100%", minHeight: 44, border: 0, borderRadius: 999, cursor: "pointer",
            background: "#d97757", color: "#fff", font: "600 16px inherit",
          }}>Reload</button>
        </div>
      </div>
    );
  }
}
