/* SIGN-IN, AND TWO-FACTOR WHEN IT IS ON (docs/admin.md, Security). The
   database answers only a listed admin - at aal2 while `admin.mfa_required()`
   is true (parked off for now) - so these screens are a convenience: they walk
   you there, enrolling an authenticator the first time and challenging every
   time after, and say plainly when an account is not an admin.

   Enrolling TOTP on your game account changes nothing in the game: no policy
   there reads `aal`, so the game keeps signing in with the password alone. */
import { useEffect, useState } from "react";
import { sb, forget } from "./api.js";

export function useSession() {
  const [s, setS] = useState({ ready: false, session: null });
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setS({ ready: true, session: data.session }));
    const { data } = sb.auth.onAuthStateChange((_e, session) => setS({ ready: true, session }));
    return () => data.subscription.unsubscribe();
  }, []);
  return s;
}

export async function signOut() {
  forget();
  await sb.auth.signOut();
}

function Shell({ title, sub, children }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Dexora <b>Admin</b></div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
    </main>
  );
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message);
  };
  return (
    <Shell title="Sign in" sub="Your Dexora account - the one you play with.">
      <form onSubmit={go} className="form">
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="bad" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
      </form>
    </Shell>
  );
}

/* Where the session stands: needs a code, needs an authenticator, or done.
   `onLevel` re-reads after a verify (the session changes underneath). */
export function useLevel(session) {
  const [level, setLevel] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) { setLevel(null); return; }
    let live = true;
    sb.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => live && setLevel(data));
    return () => { live = false; };
  }, [session, tick]);
  return [level, () => setTick((t) => t + 1)];
}

const Code = ({ value, onChange }) => (
  <label>Authenticator code
    <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
      value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
  </label>
);

export function Challenge({ onDone }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data: f } = await sb.auth.mfa.listFactors();
    const factor = f?.totp?.find((x) => x.status === "verified");
    const { error } = factor ? await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
      : { error: { message: "No authenticator on this account." } };
    setBusy(false);
    if (error) { setError(error.message); setCode(""); } else onDone();
  };
  return (
    <Shell title="Two-factor" sub="Enter the 6-digit code from your authenticator app.">
      <form onSubmit={go} className="form">
        <Code value={code} onChange={setCode} />
        {error && <p className="bad" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
        <button type="button" className="btn ghost" onClick={signOut}>Use another account</button>
      </form>
    </Shell>
  );
}

/* ONE ENROLMENT A PAGE LOAD, shared: an effect that runs twice (StrictMode,
   a remount) made two factors at once and the second was refused as a name
   conflict. An enrolment abandoned half-way leaves an unverified factor;
   the next one clears it first. */
let enrolling = null;
const startEnrol = () => (enrolling ??= (async () => {
  const { data: f } = await sb.auth.mfa.listFactors();
  for (const x of f?.all ?? []) if (x.status !== "verified") await sb.auth.mfa.unenroll({ factorId: x.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Dexora Admin ${new Date().toISOString()}` });
  if (error) throw error;
  return data;
})().catch((e) => { enrolling = null; throw e; }));

export function Enroll({ onDone }) {
  const [factor, setFactor] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    startEnrol().then((f) => live && setFactor(f), (e) => live && setError(e.message || "Could not start two-factor."));
    return () => { live = false; };
  }, []);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (error) { setError(error.message); setCode(""); } else { enrolling = null; onDone(); }
  };
  return (
    <Shell title="Set up two-factor" sub="The dashboard needs an authenticator app (Google Authenticator, 1Password, Authy…). Scan the code, then enter the 6 digits it shows.">
      {factor ? (
        <form onSubmit={go} className="form">
          <img className="qr" src={factor.totp.qr_code} alt="Authenticator QR code" width="180" height="180" />
          <details className="secret"><summary>Can't scan? Type this key</summary><code>{factor.totp.secret}</code></details>
          <Code value={code} onChange={setCode} />
          {error && <p className="bad" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Turn on two-factor"}</button>
        </form>
      ) : error ? <p className="bad" role="alert">{error}</p> : <p className="sub">Preparing…</p>}
      <button type="button" className="btn ghost" onClick={signOut}>Cancel</button>
    </Shell>
  );
}

export function NotAdmin() {
  return (
    <Shell title="Not an admin" sub="This account is signed in, but it is not on the dashboard's list. The database refuses every request from it.">
      <button className="btn primary" onClick={signOut}>Sign out</button>
    </Shell>
  );
}

export function NotConfigured() {
  return (
    <Shell title="No Supabase project" sub="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the game's public keys) in the root .env, or in the Vercel project's environment variables." />
  );
}
