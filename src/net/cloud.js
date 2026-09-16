/* THE ACCOUNT AND THE SAVE THAT FOLLOWS IT.

   One module owns the Supabase client, the session and the remote save. Not
   because a wrapper is nice, but because every other file in the game is
   supposed to keep working with no account at all - see LOCAL MODE below - and
   that is only true if there is exactly one place that knows whether there IS a
   backend.

   LOCAL MODE IS NOT A FALLBACK, IT IS THE GAME. With no credentials configured
   the whole of this file answers "no account", `signedIn()` is false, and the
   app runs exactly as it did before any of this existed: one save, this
   browser, nothing over the wire. That matters for three reasons and only the
   third is about development - it keeps the game playable offline, it keeps a
   dropped connection from being a dead screen, and it means the suite can drive
   every path without a network.

   WHAT IS AUTHORITATIVE, stated plainly because the answer is uncomfortable:
   the browser is. Every roll, price and dex write is computed client-side and
   this file uploads the result. A determined player can edit their own save.
   That is fine for a save that follows one person between devices, and it is
   NOT fine for a leaderboard - so nothing here writes one. The rules layer is
   already browser-free (check.mjs asserts it), so the day a score has to be
   trusted, deciding a catch moves into an edge function and this file starts
   sending the throw rather than the outcome. */

/* THE UMBRELLA CLIENT, DELIBERATELY - and this was measured, not assumed.

   `createClient` builds a realtime socket, a storage client and a functions
   client this game never uses, so wiring `auth-js` and `postgrest-js` together
   by hand looked like an easy win. It is not: measured, it saved 27KB gzipped
   out of 248, and it bought that by hand-rolling the one path that cannot be
   tested here without a live project - PostgREST needs the session's access
   token on every request, refreshed behind our backs, and getting that subtly
   wrong reads as "no save yet" rather than as an error. Twenty-seven kilobytes
   is not worth an untestable auth path in the feature everything else depends
   on. */
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env?.VITE_SUPABASE_URL ?? "";
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? "";

/* Configured, not "reachable". Whether the network is up is a per-request
   question and every call below answers it by failing softly. */
export const CLOUD = Boolean(URL && KEY);

export const supabase = CLOUD
  ? createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /* One page, no redirect flow, so there is never a token in the URL to
           pick up - and looking for one makes every load parse the hash. */
        detectSessionInUrl: false,
      },
    })
  : null;

/* ------------------------------------------------------------------ session */

let session = null;

export const signedIn = () => Boolean(session);
export const currentUser = () => session?.user ?? null;
export const email = () => session?.user?.email ?? null;

/* Read once at boot. Returns the session or null; never throws, because a
   backend that is down must not stop the game starting. */
/* A TOKEN OUTLIVES THE USER IT NAMES, and `getSession` cannot tell.

   It reads the JWT out of localStorage and hands it back without asking
   anybody: the token stays structurally valid until it expires, so an account
   deleted in the meantime - on another device, by the owner, or by somebody
   clearing the table - comes back as a perfectly good session pointing at a row
   that is gone. What happens next is not a clean failure. `getProfile` finds
   nothing, so the app asks who you are, and then the insert dies on a foreign
   key to `auth.users` with a message no player can act on, on a screen with no
   way out. Which is exactly what shipped.

   `getUser` asks the server, so it is the one that knows. One extra request at
   boot, once, and it is the difference between a stale token being a non-event
   and being a trap. A NETWORK failure must not sign anybody out, though - being
   offline is not the same as being deleted - so only an explicit rejection
   counts. */
export async function restore() {
  if (!CLOUD) return null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data?.session ?? null;
    if (!session) return null;

    const { data: live, error } = await supabase.auth.getUser();
    if (live?.user) return session;

    /* OFFLINE IS NOT DELETED, and the difference is the error's CLASS, not its
       wording. auth-js raises `AuthRetryableFetchError` for a dropped
       connection, a 5xx and a 429 - everything it would retry - and an
       `AuthApiError` for a rejection the server meant. Matching on the message
       would have signed out anybody on a train, because the text of a failed
       fetch is whatever the browser felt like saying. */
    if (!error || error.name === "AuthRetryableFetchError") return session;

    // The server says this user is not there. The token is worthless.
    await signOut();
    return null;
  } catch {
    return session;
  }
}

/* Supabase refreshes tokens on its own and signs out in other tabs; both arrive
   here so the app can re-render rather than discover it on the next save. */
export function onAuth(fn) {
  if (!CLOUD) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_evt, next) => {
    session = next ?? null;
    fn(session);
  });
  return () => data?.subscription?.unsubscribe();
}

/* ONE SHAPE FOR EVERY OUTCOME: `{ ok, error }`. The callers are forms, and a
   form needs a line to print, not an exception to catch - so the messages are
   written for the person reading them rather than passed through from
   PostgREST, which says things like "AuthApiError: Invalid login credentials". */
const fail = (e, fallback) => ({ ok: false, error: say(e) || fallback });

function say(e) {
  const m = String(e?.message ?? e ?? "");
  if (/already registered|already been registered/i.test(m)) {
    return "That email already has an account. Try logging in.";
  }
  if (/invalid login/i.test(m)) return "Wrong email or password.";
  if (/email not confirmed/i.test(m)) {
    return "Check your email and confirm the address first.";
  }
  if (/password.*(6|short|least)/i.test(m)) {
    return "Passwords need at least six characters.";
  }
  /* TWO DIFFERENT RATE LIMITS, AND TELLING THEM APART IS THE WHOLE POINT.
     Both say "rate limit" and the first version collapsed them into "Too many
     tries. Wait a minute." - which is true of one and actively misleading about
     the other. The EMAIL cap is per project per hour and is spent by the
     confirmation mail every sign-up sends: waiting a minute does nothing, and
     it will block every new player until confirmation is turned off or real
     SMTP is configured. Sending somebody away to wait on that is sending them
     away forever. */
  if (/email.*rate limit|over_email_send_rate_limit/i.test(m)) {
    return "The account server has hit its hourly email limit, so sign-up is "
      + "blocked. Turn off “Confirm email” in Supabase, or set up SMTP.";
  }
  if (/rate|too many/i.test(m)) return "Too many tries. Wait a minute.";
  /* Supabase rejects domains it considers fake, `example.com` among them, and
     says so in a sentence that quotes the address back - which reads like the
     address is malformed rather than the domain being refused. */
  if (/email.*invalid|email_address_invalid/i.test(m)) {
    return "That email was rejected. Some domains are not accepted - try another.";
  }
  if (/fetch|network|Failed to fetch/i.test(m)) {
    return "Cannot reach the server. Check your connection.";
  }
  return m;
}

export async function signUp(addr, password) {
  if (!CLOUD) return { ok: false, error: "No account server is configured." };
  try {
    const { data, error } = await supabase.auth.signUp({ email: addr, password });
    if (error) return fail(error, "Could not create that account.");
    session = data.session ?? null;
    /* WITH EMAIL CONFIRMATION ON, A SIGN-UP RETURNS NO SESSION. That is not an
       error and must not read as one - the account exists and is waiting on a
       click in an inbox, which is a different thing to say. */
    return { ok: true, pending: !data.session };
  } catch (e) {
    return fail(e, "Could not create that account.");
  }
}

export async function signIn(addr, password) {
  if (!CLOUD) return { ok: false, error: "No account server is configured." };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: addr, password,
    });
    if (error) return fail(error, "Could not log in.");
    session = data.session ?? null;
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not log in.");
  }
}

export async function signOut() {
  if (!CLOUD) return { ok: true };
  try {
    await supabase.auth.signOut();
  } catch { /* the token is dead either way */ }
  session = null;
  return { ok: true };
}

/* --------------------------------------------------------------- the save */

/* ONE ROW PER PLAYER, holding the save as it already is.
     saves ( user_id uuid primary key, data jsonb, updated_at timestamptz )
   The save is one JSON object and always has been; splitting it into columns
   would put the shape in two places and buy nothing, because nothing queries
   INTO it - the whole row is read at login and written on change. */
const TABLE = "saves";

/* Pull returns the raw save STRING, so it drops into the same loader
   localStorage feeds. Null means "no row yet", which is what a new account is
   and is handled the same way an empty browser is. */
export async function pull() {
  if (!CLOUD || !session) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error || !data?.data) return null;
    return JSON.stringify(data.data);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- the profile */

/* WHO YOU ARE, kept in its own table rather than inside the save blob.

   The save is one opaque JSON object and nothing queries into it, which is
   right for a dex and wrong for a name: a username has to be unique across
   players, and uniqueness is a thing a database does with an index, not
   something a blob can promise. It is also the row a leaderboard would join
   against the day there is one, and it survives the save being reset.

   `profiles ( user_id, username, char, created_at )`, with the shape and the
   case-insensitive uniqueness enforced by constraints - the form checks the
   same rules first, but the form is a convenience and the table is the rule. */
const PROFILES = "profiles";

export async function getProfile() {
  if (!CLOUD || !session) return null;
  try {
    const { data, error } = await supabase
      .from(PROFILES)
      .select("username, char")
      .eq("user_id", session.user.id)
      .maybeSingle();
    return error ? null : data;
  } catch {
    return null;
  }
}

/* CREATING IT IS WHERE A DUPLICATE NAME IS CAUGHT, not a check beforehand.
   Asking "is this free?" and then inserting is two round trips with a race
   between them; the unique index answers both at once, and 23505 is the answer
   to "somebody took it while you were typing". */
export async function createProfile(username, char) {
  if (!CLOUD || !session) return { ok: false, error: "No account server is configured." };
  try {
    const { error } = await supabase.from(PROFILES).insert({
      user_id: session.user.id,
      username: username.trim(),
      char,
    });
    if (!error) return { ok: true };
    if (error.code === "23505") {
      return { ok: false, error: "That name is taken. Try another." };
    }
    if (error.code === "23514") {
      return { ok: false, error: "Letters, numbers, spaces and dashes only." };
    }
    /* 23503 IS A FOREIGN KEY TO A USER THAT IS NOT THERE. The session is a
       token for a deleted account - see `restore`, which catches this at boot -
       and the only way out is a new one. `gone` tells Boot to drop back to the
       login screen rather than leaving somebody staring at the word
       "constraint". */
    if (error.code === "23503") {
      await signOut();
      return { ok: false, gone: true, error: "That account no longer exists. Please sign up again." };
    }
    return { ok: false, error: say(error) || "Could not save that name." };
  } catch (e) {
    return { ok: false, error: say(e) || "Could not save that name." };
  }
}

/* RENAMING IS THE SAME INSERT ONE STEP LATER, so it fails the same way: the
   unique index is what answers "is this taken", and 23505 is that answer. */
export async function renameTrainer(username) {
  if (!CLOUD || !session) return { ok: false, error: "No account server is configured." };
  try {
    const { error } = await supabase
      .from(PROFILES)
      .update({ username: username.trim() })
      .eq("user_id", session.user.id);
    if (!error) return { ok: true };
    if (error.code === "23505") return { ok: false, error: "That name is taken. Try another." };
    if (error.code === "23514") return { ok: false, error: "Letters, numbers, spaces and dashes only." };
    return { ok: false, error: say(error) || "Could not change that name." };
  } catch (e) {
    return { ok: false, error: say(e) || "Could not change that name." };
  }
}

/* DELETING AN ACCOUNT IS A PRIVILEGE THE BROWSER MUST NOT HAVE. Removing a row
   from `auth.users` is an admin action and the only key shipped to a browser is
   the public one, so the privilege lives in one SECURITY DEFINER function
   instead of in a key. It takes no argument - there is nothing to point at
   somebody else - and its body can only reach `auth.uid()`. The profile and the
   save go with it on the foreign key's cascade.

   The session is dropped afterwards whatever happened: if the row is gone the
   token refers to nobody, and holding on to it would leave the app signed in as
   a user that does not exist. */
export async function deleteAccount() {
  if (!CLOUD || !session) return { ok: false, error: "No account server is configured." };
  try {
    const { error } = await supabase.rpc("delete_own_account");
    if (error) return { ok: false, error: say(error) || "Could not delete the account." };
    await signOut();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: say(e) || "Could not delete the account." };
  }
}

/* Push reports like `store.write` does - `{ ok, why }` - because the caller
   needs to say NOT SAVING when it fails, and for the same reason: a write that
   silently does nothing is the failure that costs a collection. */
export async function push(raw) {
  if (!CLOUD || !session) return { ok: true, skipped: true };
  try {
    const { error } = await supabase.from(TABLE).upsert({
      user_id: session.user.id,
      data: JSON.parse(raw),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return { ok: false, why: "offline" };
    return { ok: true };
  } catch {
    return { ok: false, why: "offline" };
  }
}
