# The admin dashboard

A private dashboard for the game's numbers: how many trainers there are, who
plays when, how far they get, who leads, what trading, ranked, cards and
events are doing - and the moderation queue the `reports` table has been
waiting for ("No policies: nobody reads reports through the API. The
dashboard does.").

Change a decision here first, as with docs/battles.md and docs/trading.md.

## The decision

**A separate Vite + React app in `admin/`, its own Vercel project, guarded by
the DATABASE.** Not `/admin` inside the game, not Next.js.

| Option | Why not / why |
|---|---|
| `/admin` in the game | Its code and chart library would ship in the players' deploy (a lazy chunk is still a public file), its CSS joins the game's 10,000-line sheet, and a broken admin page could fail the game's build or its check.mjs. |
| Next.js | Its gift is server code that holds secrets. We hold none: the guard is in SQL, so the dashboard needs only the public anon key, like the game. A second framework for one page. |
| **Vite + React in `admin/`** | The stack the game already uses, a different origin (its own localStorage, its own CSP), zero bytes in the game, and it can import the game's browser-free rule modules (`src/game`, `src/data`) instead of copying them - `levelFromXp`, `tierName`, `label`, the rank names. |

**The browser is never the guard.** A login screen stops nobody: the anon key
is public and anyone can call any function with it. Every number the
dashboard shows comes from an `admin_*` SQL function that refuses everyone
but you, in the database, before it reads a row.

## How it affects the game

| | Effect |
|---|---|
| Bundle | None. `admin/` is never imported by `src/` (check.mjs asserts it). |
| Game requests | None. The dashboard is never linked from the game. |
| Save path | One small trigger on `saves` (Activity, below): two `insert ... on conflict do nothing` per upload, which only WRITE on a trainer's first save of the hour and of the day. Wrapped so it can never fail an upload (the save trigger's rule). |
| Database load | The `admin_*` functions run only while you have the dashboard open. The heavy pass over every save runs once a night at a quiet hour. |
| Existing SQL | `db/admin.sql` is applied AFTER trading.sql, ranked.sql and referrals.sql and redefines none of their functions (the rule that keeps re-running trading.sql safe). |
| Player data | Nothing new is collected. The dashboard shows usernames, never an email or a birthdate. It **never writes a save** - collections are never lost or overwritten, and no admin action edits one. |
| Vercel | A second Hobby project. Its traffic is one person's and is negligible against the 1M monthly requests. |

## Security

1. **`admin` schema, not `public`.** Its tables (`admins`, `audit`,
   `active_days`, `active_hours`, `daily`) live in a schema PostgREST does not
   expose, with RLS on, no policies and everything revoked from `anon` and
   `authenticated`. Only the `admin_*` functions in `public` can reach them.
2. **`admin.admins` holds your user id**, inserted by hand in the SQL editor.
   No function adds an admin, so a bug cannot create one.
3. **`public.is_admin()`** (security definer, `search_path = ''`): true only
   when `auth.uid()` is in `admin.admins` - and, while `admin.mfa_required()`
   says so, the session passed two-factor (`auth.jwt() ->> 'aal' = 'aal2'`).
4. **Every `admin_*` function starts with the guard** and raises otherwise:
   `security definer`, `set search_path = ''`, revoked from `public` and
   `anon`, granted to `authenticated`. A slow query is capped by Supabase's own
   8s `statement_timeout` on the `authenticated` role (a `set statement_timeout`
   on the function itself would not apply to the statement calling it). tradedb enumerates every `admin_%` function in
   `pg_proc` and calls each as a stranger and as anon, expecting a refusal - a
   new function without its guard fails the test.
5. **Two-factor is built and PARKED** (2026-10-20, your call: not needed
   yet). `admin.mfa_required()` returns `false`, so a listed admin signs in
   with the password alone. Turned to `true`, the guard asks for an aal2
   session, `dashboard_mfa()` tells the dashboard so, and its screens enrol an
   authenticator (Supabase's TOTP, free) on the next sign-in and challenge on
   every one after. It never touches the game: no policy there reads `aal`.
   Lost an authenticator: delete the row in `auth.mfa_factors`, enrol again.
6. **Actions are audited.** Each moderation write (below) is one function that
   also inserts into `admin.audit` (who, what, target, why, when), read on the
   Moderation page. Nothing deletes from it.
7. **The origin is locked down** in `admin/vercel.json`: a strict CSP
   (`default-src 'self'`, `connect-src` only the Supabase project, no inline
   script), `X-Robots-Tag: noindex`, `frame-ancestors 'none'`,
   `Referrer-Policy: no-referrer`, and a `robots.txt` that disallows all. No
   service-role key anywhere, ever.
8. **No sign-up form.** Accounts are project-wide (the dashboard signs in with
   your game account); it simply offers sign-in only, and a non-admin who signs
   in sees "Not an admin" and every call refused anyway.

## The data

### What already exists (read live, indexed, cheap)

| Table | Gives |
|---|---|
| `profiles` | accounts, `created_at` (sign-ups, full history), `played_at` (last upload), `dex_count`, `caught`, `steps`, `xp`, `flagged_at`/`flag_reason` |
| `trainer_cards` | `variants`, `stars`, `trades`, `badges`/`badge_ids`, `titles`, `joined_at` |
| `trades`, `trade_log` | trades by kind and status, per day |
| `listings` | open, done, withdrawn board listings |
| `friends`, `blocks` | friend links, pending requests, blocks |
| `referrals` | links, qualified invites |
| `ranked_battles`, `ranked_ratings` | games per day, outcomes, ratings per season, voided |
| `reports` | the moderation queue |
| `saves` | everything else, as one jsonb per player - read only by the nightly pass |

### What is new

- **Activity** - `admin.active_days(day, user_id)` and
  `admin.active_hours(hour, user_id)`, filled by the `saves` trigger. `played_at`
  keeps only the LAST time someone played, so without these there is no
  history: DAU last Tuesday, retention and the busy hours cannot be
  reconstructed later. Recorded from the day `admin.sql` is applied - sign-ups
  are the only series with history before it.
- **The nightly snapshot** - `admin.daily(day, metrics jsonb)`, one row a day,
  written by `admin_snapshot()` under `pg_cron` (included in the free tier) at
  04:00 UTC: a single pass over `saves` for what only the save knows - rare
  tier finds by tier, Pokemon held, money and candy (median, p90), research
  stars, medals, cards held and packs, the event's costumes and the hunt, the
  check-in streaks, save sizes (`pg_column_size`). It is idempotent (an upsert
  on `day`), so a re-run is harmless, and the Health page shows its last run so
  a stopped job is seen, not forgotten. Each metric names the save field it
  reads; tradedb loads a real save and checks every one resolves, so a renamed
  field fails a test instead of drawing zeros.
- **Indexes** - `profiles(created_at)`, `profiles(played_at)`,
  `profiles(flagged_at) where flagged_at is not null`, `trades(created_at)`,
  `ranked_battles(created_at)`, `reports(created_at)`.
- **Retention of the new tables** - `active_hours` is kept 90 days,
  `active_days` 400, `daily` forever (one small row a day); the nightly job
  prunes.

### The functions (each one page's data, one round trip)

| Function | Returns |
|---|---|
| `admin_overview(days)` | the KPI cards and their sparklines |
| `admin_players()` | sign-ups, actives, retention cohorts, level and progress spreads |
| `admin_leaders(board, n)` | a top-N list (dex, level, steps, caught, variants, stars, trades, badges, ranked) |
| `admin_trainer(name)` | one trainer's card, activity calendar, trades, reports, flags |
| `admin_social(days)` | trades, listings, friends, referrals |
| `admin_ranked(season)` | games, outcomes, rating spread, ranks |
| `admin_find(name)` | trainers whose name starts so |
| `admin_daily(days)` | the nightly snapshots - Collection and Events read them |
| `admin_snapshot()` | today's snapshot, now (Health's Run now) |
| `admin_moderation()` | open reports by trainer, flagged accounts, the audit log |
| `admin_health()` | table sizes against the 500MB cap, rows, largest saves, the nightly job's last run |
| `admin_flag(who, why)`, `admin_unflag(who, why)`, `admin_void(who, why)`, `admin_dismiss(ids, why)` | moderation writes, each audited |

Each returns one jsonb document under ~30KB. Leaders and trainers come back as
usernames and short ids only.

## The pages

Charts are Recharts (declarative, themeable through CSS variables, responsive
containers); heatmaps are a CSS grid, no library. Every chart has a range
picker (7 / 30 / 90 days / all), a hover readout, and its numbers available as
a table for screen readers.

1. **Overview** - KPI cards with the change against the previous period and a
   sparkline: total trainers, new today, playing now (saved in the last 2
   minutes), DAU, WAU, MAU, stickiness (DAU / MAU), average hours active per
   player-day. Below: actives over time (area), sign-ups (bars).
2. **Players** - retention cohorts (heatmap: week joined x D1 / D7 / D30), the
   week's busy hours (7 x 24 heatmap, your time zone), trainer level spread
   (histogram), the progress funnel (signed up -> first catch -> 100 caught ->
   first badge -> a region's Champion -> hard mode), how far the maps have
   been opened (bars by area).
3. **Leaderboards** - tabs per board, top 50, rank / trainer / value / level /
   last played, flagged accounts hidden (a toggle shows them, marked). A
   trainer opens **Trainer**: their card, activity calendar, trades, reports
   and flags.
4. **Social** - trades per day by kind (stacked bars) and outcome, open
   listings, friend links and pending requests, the invite funnel (linked ->
   qualified).
5. **Ranked** - games per day, win rate of challengers, rating spread for the
   season (histogram with the rank floors drawn), players per rank.
6. **Collection** - rare tiers found (bars, rarest first, from `TIERS`), Pokemon
   held per trainer, money and candy (median and p90 over time), research
   stars, medals, cards and packs.
7. **Events** - for each event in `eventforms.js`: costumes caught per day,
   trainers who caught one, the hunt (dreams, Darkrai caught), claims.
8. **Moderation** - reports (reason from `REPORT_REASONS`, reporter, reported,
   date; dismiss), flagged accounts (reason; unflag), the audit log.
9. **Health** - database size against the free cap, rows per table, the
   biggest saves, the nightly job's last run, the activity tables' size.

## Responsiveness

- One column under 640px, two to 1024px, a 12-column grid above; KPI cards
  `repeat(auto-fit, minmax(160px, 1fr))`.
- A side nav on a desktop, a bottom tab bar (Overview, Players, Leaders,
  Moderation, More) on a phone - the game's shape.
- Tables become stacked cards under 640px; heatmaps scroll inside their card
  on a phone, never the page (`overflow-x: clip` on the body, as in the game).
- Charts take their container's width (`ResponsiveContainer`) and halve their
  ticks on a narrow screen; touch shows the readout on tap.
- The Rotom palette (navy glass at night, frosted by day) as `:root` tokens,
  following the game's `data-theme`; 36px touch targets on a coarse pointer.
- Audited at 390x844, 768x1024, 1440x900 and sideways 844x390.

## Performance and the free tiers

- **One call per page**, cached in memory and sessionStorage for 5 minutes,
  with a Refresh button; switching pages and back costs nothing. Only "playing
  now" polls (60s, and only while the tab is visible).
- **Each page and Recharts load lazily**, so the sign-in screen is small.
- **The nightly pass does the heavy work** so no page reads every save; the
  live functions read indexed columns.
- **No sprites from the game's CDN** by default: names, not pictures, so the
  dashboard adds nothing to the game's request budget (if pictures are wanted,
  only on top-10 lists).
- **Budgets to watch** (free-tier limits as of writing; confirm in each
  provider's usage page): Supabase 500MB database, 5GB egress a month, 50k
  monthly active users, a project paused after a week with no requests (the
  players keep it awake); Vercel Hobby 1M requests and 100GB a month across
  the account, non-commercial only (which Dexora is). The Health page shows
  the database's share.
- **Expected cost**: a page load ~10-30KB; the activity tables ~20-60MB a year
  at 1,000 daily players; the nightly pass a few seconds at that size.

## What the numbers can and cannot say

- **Saves can be forged** (CLAUDE.md: there is no trust boundary). Collection
  and leaderboard numbers are what saves CLAIM. Flagged accounts are left out
  of every board and metric by default; the pace check is what flags them.
- **Guests are invisible.** A local-only player never reaches the server, so
  "trainers" means accounts. Vercel Web Analytics (optional, free on Hobby
  within its event allowance) counts visitors, guests included.
- **"Playing now" is "uploaded in the last 2 minutes"** - the mirror only
  uploads when something changed, so a player standing still is not counted.
- **History starts when `admin.sql` is applied**, except sign-ups.

## Testing

- **`npm run tradedb`** (the TEST project, never live) applies `db/admin.sql`
  last and checks: every `admin_%` function refuses anon and a plain player;
  with two-factor switched on for the test, it refuses an admin without it
  and answers one with it (a real TOTP enrolment, the code computed in Node),
  and switched back off a listed admin is in on a password; a function missing from the test's
  argument list fails it, so a new one cannot skip the guard test. The
  activity trigger writes once an hour and a day and never costs an upload
  (its table renamed away, the save still lands); `admin_snapshot()` is
  idempotent, reads every save field it names, survives a malformed save and
  lists every tier; no read carries an email or a birthdate; each moderation
  write refuses without a reason and leaves one audit row; the admin schema is
  unreadable to players. Taking the guard out of one function fails it.
- **check.mjs** (`admin ok`): src/ never imports admin/; admin/ imports only
  src/game and src/data, never map.js or mapdata.js; every `admin_*` the
  dashboard calls is defined in db/admin.sql.
- **The browser** was driven against the TEST project on 2026-10-20 (sign-in,
  TOTP enrolment and challenge, every page at 1440x900, 768x1024, 390x844 and
  844x390, a flag and an unflag through the UI): no sideways scroll, no
  console errors. Playwright is not a dependency here; drive it the same way
  after a layout change.

## Running it

- `npm run admin` serves the dashboard on :5300 with the root .env's keys -
  the LIVE project. To try it on the TEST project, start it with
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set to the TEST ones.
- `npm run admin:build` builds `admin/dist`.

## The phases

Phases 1-5 are built (2026-10-20): the SQL, the snapshot and its cron job,
the app shell (two-factor built, parked off), every page, moderation. Phase 6 - going live -
is SUPABASE.md §3k.

## Choices made

- A Vercel subdomain (`<project>.vercel.app`); a custom domain can come later.
- One admin. Another is one row in `admin.admins`, and the audit log names who
  acted either way.
- No Vercel Web Analytics: guests stay uncounted until asked for.
