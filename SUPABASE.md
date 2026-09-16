# Setting up the account backend

Everything here is done once, in the Supabase dashboard. The game runs without
it — with no credentials configured it saves to the browser exactly as it always
did — so nothing below is needed to develop or to play locally.

## 1. Make the project

1. <https://supabase.com> → **New project**. Any name; pick the region closest
   to you, because every save round-trip crosses it.
2. Wait for it to finish provisioning (a minute or two).

## 2. Copy the two keys

**Project Settings → API**, then copy:

| Dashboard field | Goes in `.env` as |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| Project API keys → `anon` `public` | `VITE_SUPABASE_ANON_KEY` |

Create a file called `.env` beside `package.json`:

```
VITE_SUPABASE_URL=https://YOURPROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`.env` is gitignored and must stay that way. **The `anon` key is the only one
that belongs here** — it is designed to be public and is safe in a browser
bundle. The `service_role` key is not: it bypasses every rule below, so it never
goes in `.env`, in the repo, or in anything shipped to a browser.

## 3. Make the table

**SQL Editor → New query**, paste all of this, **Run**:

```sql
-- One row per player. The save is one JSON object and always has been, so it
-- stays one: nothing queries INTO it, the whole row is read at login and
-- written on change.
create table if not exists public.saves (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ROW LEVEL SECURITY IS THE WHOLE SECURITY MODEL HERE. Without it the anon key
-- can read every row in the table, and the anon key is public by design.
alter table public.saves enable row level security;

-- Each policy says the same thing: you only ever touch your own row.
create policy "read own save"   on public.saves for select
  using (auth.uid() = user_id);
create policy "insert own save" on public.saves for insert
  with check (auth.uid() = user_id);
create policy "update own save" on public.saves for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Check it took: **Table Editor → saves** should show the table with a green
**RLS enabled** badge. If that badge says *Unrestricted*, stop and re-run the
`alter table` line — an unrestricted table with a public key is every save in
the project readable by anyone.

## 4. Decide about email confirmation

**Authentication → Providers → Email.**

- **Confirm email ON** (the default) — safer, and what you want if anyone but
  you signs up. Sign-up then shows "check your email" rather than logging
  straight in; the game already handles that path.
- **Confirm email OFF** — sign-up logs you in immediately. Fine while it is
  only you, and it makes testing much faster.

While you are there, **Authentication → URL Configuration → Site URL** should be
wherever the game is actually hosted, or confirmation links will point at
`localhost`.

## 5. Run it

```
npm run dev
```

You should get the login screen instead of the game. Make an account, pick a
trainer, and you are in. To check the save is really landing: play for a few
seconds, then **Table Editor → saves** — there should be one row, with
`updated_at` moving as you walk.

---

## What is actually protected, and what is not

Worth being plain about, because it decides what can safely be built next.

**Protected.** Nobody can read or write anyone else's save. That is RLS, and it
is enforced by the database rather than by the game.

**Not protected.** Every number in the save is computed in the browser and
uploaded — the catch roll, the money, the dex. Someone determined can edit their
own save. For a save that follows one person between devices that is fine, and
it is why **there is no leaderboard**: a score nobody can trust is worse than no
score.

The day one is wanted, the fix is already set up rather than a rewrite. Ten of
the thirteen modules in `src/game` are browser-free — `check.mjs` asserts it — so
deciding a catch moves into an edge function that imports the same rules, and
the client starts sending the throw rather than the outcome.

## If something goes wrong

| What you see | What it is |
|---|---|
| Login screen never appears, game loads straight in | `.env` is missing or misnamed, or the dev server was not restarted after creating it — Vite reads `.env` at startup only |
| "Cannot reach the server" | URL typo, or the project is paused (free projects pause after inactivity — open the dashboard to wake it) |
| Sign-up works, login says "email not confirmed" | Confirmation is on and the email has not been clicked — see step 4 |
| Logged in, but the save does not appear in the table | RLS policies missing; re-run step 3 |
| `NOT SAVING` in the top bar | The local write failed (full or blocked storage). The cloud sync is separate and fails quietly |
