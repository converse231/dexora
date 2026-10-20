/* THE SHELL (docs/admin.md): the sign-in gate, the nav - a side bar on a
   desktop, a bottom tab bar on a phone, as the game does it - and the pages,
   each a lazy chunk reached by its hash (no rewrites needed on Vercel). */
import { lazy, Suspense, useEffect, useState } from "react";
import { configured, sb, forget } from "./api.js";
import { useSession, useLevel, SignIn, Challenge, Enroll, NotAdmin, NotConfigured, signOut } from "./Auth.jsx";
import { Loading } from "./ui.jsx";

const PAGES = [
  { id: "overview", name: "Overview", range: true, icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z", Page: lazy(() => import("./pages/Overview.jsx")) },
  { id: "players", name: "Players", icon: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-8 1.3-8 4v3h8v-3c0-1 .4-2.1 1.3-3A11 11 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4z", Page: lazy(() => import("./pages/Players.jsx")) },
  { id: "leaders", name: "Leaders", icon: "M7 21h10v-2H7zm5-4a5 5 0 0 0 5-5V3H7v9a5 5 0 0 0 5 5zM19 4v6a3 3 0 0 0 2-3V4zM3 4v3a3 3 0 0 0 2 3V4z", Page: lazy(() => import("./pages/Leaders.jsx")) },
  { id: "social", name: "Social", range: true, icon: "M7 7h10l-3-3 1.4-1.4L21 8l-5.6 5.4L14 12l3-3H7zm10 10H7l3 3-1.4 1.4L3 16l5.6-5.4L10 12l-3 3h10z", Page: lazy(() => import("./pages/Social.jsx")) },
  { id: "ranked", name: "Ranked", icon: "M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z", Page: lazy(() => import("./pages/Ranked.jsx")) },
  { id: "collection", name: "Collection", range: true, icon: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 2a8 8 0 0 1 7.9 7h-4.1a4 4 0 0 0-7.6 0H4.1A8 8 0 0 1 12 4zm0 6a2 2 0 1 1-2 2 2 2 0 0 1 2-2zm0 10a8 8 0 0 1-7.9-7h4.1a4 4 0 0 0 7.6 0h4.1A8 8 0 0 1 12 20z", Page: lazy(() => import("./pages/Collection.jsx")) },
  { id: "events", name: "Events", range: true, icon: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14zM7 12h5v5H7z", Page: lazy(() => import("./pages/Events.jsx")) },
  { id: "moderation", name: "Moderation", icon: "M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5zm-1 6h2v6h-2zm0 8h2v2h-2z", Page: lazy(() => import("./pages/Moderation.jsx")) },
  { id: "health", name: "Health", icon: "M3 13h4l2-6 4 12 2-6h6v-2h-4.6L15 8l-4 12-2-6H3z", Page: lazy(() => import("./pages/Health.jsx")) },
];
const TRAINER = lazy(() => import("./pages/Trainer.jsx"));
const PHONE_TABS = ["overview", "players", "leaders", "moderation"];
const RANGES = [7, 30, 90];

const Icon = ({ d }) => <svg viewBox="0 0 24 24" aria-hidden="true" className="ico"><path d={d} /></svg>;

function useHash() {
  const read = () => location.hash.replace(/^#\/?/, "").split("/");
  const [h, setH] = useState(read);
  useEffect(() => {
    const on = () => setH(read());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h;
}

const stored = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not kept: the default next time */ } };

export default function App() {
  if (!configured) return <NotConfigured />;
  return <Gate />;
}

/* Signed in, the database says whether this is an admin, and whether it
   wants two-factor first (`admin.mfa_required()`, parked off for now). Only
   then does the dashboard walk an account to aal2. */
function Gate() {
  const { ready, session } = useSession();
  const [level, recheck] = useLevel(session);
  const [access, setAccess] = useState(null);   // { admin, mfa }
  useEffect(() => {
    setAccess(null);
    if (!session) return;
    let live = true;
    Promise.all([sb.rpc("is_admin"), sb.rpc("dashboard_mfa")])
      .then(([a, m]) => live && setAccess({ admin: a.data === true, mfa: m.data === true }));
    return () => { live = false; };
  }, [level?.currentLevel, session?.user?.id]);
  // A different account forgets the last one's numbers.
  useEffect(() => { forget(); }, [session?.user?.id]);

  if (!ready) return <Loading />;
  if (!session) return <SignIn />;
  if (!access || !level) return <Loading />;
  if (access.admin) return <Dashboard user={session.user} />;
  if (access.mfa && level.currentLevel !== "aal2") {
    return level.nextLevel === "aal2" ? <Challenge onDone={recheck} /> : <Enroll onDone={recheck} />;
  }
  return <NotAdmin />;
}

function Dashboard({ user }) {
  const [route, arg] = useHash();
  const page = PAGES.find((p) => p.id === route) ?? (route === "trainer" ? null : PAGES[0]);
  const [days, setDays] = useState(() => Number(stored("dexora-admin-days", 30)) || 30);
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "dark");
  useEffect(() => { document.documentElement.dataset.theme = theme; keep("dexora-admin-theme", theme); }, [theme]);
  useEffect(() => { keep("dexora-admin-days", String(days)); }, [days]);
  useEffect(() => { setMore(false); scrollTo(0, 0); }, [route, arg]);
  const title = page?.name ?? "Trainer";
  const Body = page?.Page ?? TRAINER;

  const link = (p) => (
    <a key={p.id} href={`#/${p.id}`} className={page?.id === p.id ? "on" : ""} aria-current={page?.id === p.id ? "page" : undefined}>
      <Icon d={p.icon} /><span>{p.name}</span>
    </a>
  );
  return (
    <div className="shell">
      <nav className="side" aria-label="Pages">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Dexora <b>Admin</b></div>
        {PAGES.map(link)}
        <div className="side-foot">
          <span className="sub" title={user.email}>Signed in</span>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div className="main">
        <header className="top">
          <h1>{title}</h1>
          <div className="top-acts">
            {page?.range && (
              <div className="seg" role="group" aria-label="Range">
                {RANGES.map((r) => (
                  <button key={r} className={days === r ? "on" : ""} aria-pressed={days === r} onClick={() => setDays(r)}>{r}d</button>
                ))}
              </div>
            )}
            <button className="btn icon" onClick={() => setTick((t) => t + 1)} aria-label="Refresh" title="Refresh">
              <Icon d="M17.7 6.3A8 8 0 1 0 19.9 13h-2.1a6 6 0 1 1-1.5-5.3L13 11h7V4z" />
            </button>
            <button className="btn icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Theme" title="Day / night">
              <Icon d={theme === "dark" ? "M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5zm0-5 1.5 3h-3zm0 20-1.5-3h3zM2 12l3-1.5v3zm20 0-3 1.5v-3z" : "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"} />
            </button>
          </div>
        </header>
        <main className="content">
          <Suspense fallback={<Loading />}>
            <Body days={days} tick={tick} arg={arg} />
          </Suspense>
        </main>
      </div>

      <nav className="tabs" aria-label="Pages">
        {PAGES.filter((p) => PHONE_TABS.includes(p.id)).map(link)}
        <button className={`more${more ? " on" : ""}`} onClick={() => setMore(!more)} aria-expanded={more}>
          <Icon d="M6 10a2 2 0 1 0 2 2 2 2 0 0 0-2-2zm6 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2zm6 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2z" /><span>More</span>
        </button>
      </nav>
      {more && (
        <div className="more-sheet" role="dialog" aria-label="More pages" onClick={() => setMore(false)}>
          <div className="more-card" onClick={(e) => e.stopPropagation()}>
            {PAGES.filter((p) => !PHONE_TABS.includes(p.id)).map(link)}
            <button className="btn ghost" onClick={signOut}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
