-- THE ADMIN DASHBOARD'S SERVER HALF (docs/admin.md).
--
-- Applied AFTER db/trading.sql, db/ranked.sql and db/referrals.sql, and
-- re-runnable. It redefines none of their functions (re-running trading.sql
-- would revert one) and adds no column to their tables.
--
-- THE BROWSER IS NEVER THE GUARD. The anon key is public, so anyone can call
-- any function here; every `admin_*` function asks `admin.guard()` first, and
-- the guard asks for a listed admin (and, while `admin.mfa_required()` says
-- so, one who passed two-factor). tradedb calls every `admin_%` function in
-- this schema as anon and as a player, and - with two-factor switched on - as
-- an admin without it, and expects each refused.
--
-- A FLAGGED ACCOUNT IS LEFT OUT of every count and board (its save may be
-- forged - CLAUDE.md, "There is no trust boundary"), except where it is the
-- subject: the moderation queue, a trainer's own page, Health.

create schema if not exists admin;
revoke all on schema admin from public, anon, authenticated;

-- ------------------------------------------------------------------ tables

-- Inserted by hand in the SQL editor (SUPABASE.md §3k). No function adds one,
-- so no bug can.
create table if not exists admin.admins (
  user_id  uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);

-- Every moderation write, forever. Nothing deletes from it.
create table if not exists admin.audit (
  id     bigint generated always as identity primary key,
  actor  uuid not null,
  action text not null,
  target uuid,
  detail jsonb not null default '{}',
  at     timestamptz not null default now()
);
create index if not exists audit_target on admin.audit (target, at desc);

-- ACTIVITY. `profiles.played_at` keeps only the LAST time a trainer played,
-- so yesterday's actives, retention and the busy hours cannot be worked out
-- later - they are recorded as they happen, one row a trainer an hour and a
-- day. A deleted account takes its rows with it.
create table if not exists admin.active_days (
  day     date not null,
  user_id uuid not null references auth.users on delete cascade,
  primary key (day, user_id)
);
create index if not exists active_days_user on admin.active_days (user_id, day);
create table if not exists admin.active_hours (
  hour    timestamptz not null,
  user_id uuid not null references auth.users on delete cascade,
  primary key (hour, user_id)
);
create index if not exists active_hours_user on admin.active_hours (user_id);

-- THE NIGHTLY SNAPSHOT: what only the saves know, one row a day.
create table if not exists admin.daily (
  day     date primary key,
  metrics jsonb not null,
  made_at timestamptz not null default now()
);

-- Reports looked at and set aside. Its own table: `reports` is trading.sql's.
create table if not exists admin.dismissed (
  report bigint primary key references public.reports on delete cascade,
  by     uuid not null,
  why    text not null,
  at     timestamptz not null default now()
);

alter table admin.admins       enable row level security;
alter table admin.audit        enable row level security;
alter table admin.active_days  enable row level security;
alter table admin.active_hours enable row level security;
alter table admin.daily        enable row level security;
alter table admin.dismissed    enable row level security;
revoke all on all tables in schema admin from public, anon, authenticated;

-- What the dashboard reads by date.
create index if not exists profiles_created_at on public.profiles (created_at);
create index if not exists profiles_played_at on public.profiles (played_at);
create index if not exists trades_created_at on public.trades (created_at);
create index if not exists ranked_battles_created_at on public.ranked_battles (created_at);
create index if not exists reports_created_at on public.reports (created_at);
create index if not exists friends_created_at on public.friends (created_at);
create index if not exists referrals_linked_at on public.referrals (linked_at);

-- ------------------------------------------------------------------ the guard

-- TWO-FACTOR IS PARKED (2026-10-20, your call: not needed yet). `true` turns
-- it back on - the guard then asks for an aal2 session, and the dashboard's
-- enrol and challenge screens come back with it; nothing else changes.
create or replace function admin.mfa_required()
returns boolean language sql stable set search_path = '' as $$
  select false
$$;

-- A listed admin - signed in with two-factor while it is required (a stolen
-- password alone is aal1).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (not admin.mfa_required() or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
     and exists (select 1 from admin.admins where user_id = auth.uid())
$$;

-- Whether the dashboard should walk a signed-in account to two-factor. Says
-- nothing about who is an admin.
create or replace function public.dashboard_mfa()
returns boolean language sql stable security definer set search_path = '' as $$
  select admin.mfa_required()
$$;

create or replace function admin.guard()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
end;
$$;

create or replace function admin.today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'utc')::date
$$;

-- A JSON number as a number, anything else null: a save is whatever the
-- browser sent.
create or replace function admin.num(j jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'number' then j::text::numeric end
$$;

-- Moderation writes say why, briefly.
create or replace function admin.why(why text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if length(trim(coalesce(why, ''))) not between 1 and 200 then
    raise exception 'say why (1-200 characters)' using errcode = '22023';
  end if;
  return trim(why);
end;
$$;

create or replace function admin.log(action text, target uuid, detail jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into admin.audit (actor, action, target, detail) values (auth.uid(), action, target, coalesce(detail, '{}'))
$$;

-- ------------------------------------------------------------------ activity

-- ON EVERY UPLOAD, and it WRITES only on a trainer's first of the hour and of
-- the day (`on conflict do nothing`). It can never fail an upload: anything it
-- throws is swallowed, because a statistic is not worth a save.
create or replace function admin.note_active()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into admin.active_days (day, user_id) values (admin.today(), new.user_id)
      on conflict do nothing;
    insert into admin.active_hours (hour, user_id)
      values (date_trunc('hour', now() at time zone 'utc') at time zone 'utc', new.user_id)
      on conflict do nothing;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists saves_note_active on public.saves;
create trigger saves_note_active after insert or update on public.saves
  for each row execute function admin.note_active();

-- ------------------------------------------------------------------ the snapshot

-- ONE PASS OVER THE SAVES, nightly under pg_cron (below), and on Health's
-- "Run now". An upsert on the day, so running it twice is harmless. Every
-- field it reads is named in tradedb, which loads a save and checks each one
-- resolves - a renamed save field fails a test instead of drawing zeros.
create or replace function admin.snapshot()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  m jsonb;
begin
  drop table if exists pg_temp.snap;
  create temp table snap on commit drop as
    select v.user_id, v.data, pg_column_size(v.data) as bytes
      from public.saves v
      join public.profiles p on p.user_id = v.user_id
     where p.flagged_at is null;

  select jsonb_build_object(
    'players', (select count(*) from pg_temp.snap),
    'bytes', (select jsonb_build_object(
        'avg', round(avg(bytes)), 'p90', percentile_disc(0.9) within group (order by bytes), 'max', max(bytes))
      from pg_temp.snap),
    'money', (select jsonb_build_object(
        'p50', percentile_disc(0.5) within group (order by x), 'p90', percentile_disc(0.9) within group (order by x))
      from (select admin.num(data->'money') x from pg_temp.snap) s where x is not null),
    'candy', (select jsonb_build_object(
        'p50', percentile_disc(0.5) within group (order by x), 'p90', percentile_disc(0.9) within group (order by x))
      from (select admin.num(data->'candy') x from pg_temp.snap) s where x is not null),
    'box', (select jsonb_build_object(
        'p50', percentile_disc(0.5) within group (order by x), 'p90', percentile_disc(0.9) within group (order by x),
        'max', max(x))
      from (select jsonb_array_length(data->'box') x from pg_temp.snap where jsonb_typeof(data->'box') = 'array') s),
    -- A tier row is one bit a species: its 1s are the species registered in
    -- that tier. Counted on the text - a row is ~1,400 digits and there are
    -- twenty of them a save, too many to unnest every night.
    -- Every tier, held or not, so the page shows the gaps too.
    'tiers', (select jsonb_object_agg(t, jsonb_build_object('held', coalesce(held, 0), 'players', coalesce(players, 0)))
      from unnest(public.tier_list()) t left join (
        select t, sum(n) as held, count(*) filter (where n > 0) as players
          from unnest(public.tier_list()) t
          cross join lateral (
            select length(r) - length(replace(r, '1', '')) as n
              from (select case when jsonb_typeof(data->t) = 'array' then (data->t)::text end as r from pg_temp.snap) x
             where r is not null) c
         group by t) z using (t)),
    -- League ids beaten -> trainers; the dashboard names them (gymtune.js).
    'beaten', (select coalesce(jsonb_object_agg(k, n), '{}') from (
        select k, count(*) n from pg_temp.snap, jsonb_object_keys(case when jsonb_typeof(data->'beaten') = 'object' then data->'beaten' else '{}' end) k group by k) z),
    -- Where trainers are standing - the map they last saved on.
    'areas', (select coalesce(jsonb_object_agg(a, n), '{}') from (
        select data->>'areaId' a, count(*) n from pg_temp.snap where data ? 'areaId' group by 1) z),
    'medals', (select coalesce(jsonb_object_agg(g, n), '{}') from (
        select g, count(*) n from pg_temp.snap, jsonb_array_elements_text(case when jsonb_typeof(data->'medals') = 'array' then data->'medals' else '[]' end) g group by g) z),
    -- An event look caught, by its Pokedex position (`event_slots()`, 1-based).
    'events', (select coalesce(jsonb_object_agg(pos, n), '{}') from (
        select pos, count(*) filter (where data->'dex'->>(pos - 1) = '2') n
          from unnest(public.event_slots()) pos, pg_temp.snap
         where jsonb_typeof(data->'dex') = 'array' group by pos) z),
    'dreams', (select coalesce(jsonb_object_agg(e, jsonb_build_object('players', n, 'p50', p50)), '{}') from (
        select e, count(*) n, percentile_disc(0.5) within group (order by v) p50
          from pg_temp.snap, jsonb_each(case when jsonb_typeof(data->'dreams') = 'object' then data->'dreams' else '{}' end) d(e, j), admin.num(j) v
         where v is not null group by e) z),
    'cards', (select jsonb_build_object(
        'players', count(*) filter (where x > 0),
        'p50', percentile_disc(0.5) within group (order by x) filter (where x > 0),
        'p90', percentile_disc(0.9) within group (order by x) filter (where x > 0))
      from (select (select count(*) from jsonb_object_keys(data->'cards')) x
              from pg_temp.snap where jsonb_typeof(data->'cards') = 'object') s),
    'research', (select jsonb_build_object(
        'p50', percentile_disc(0.5) within group (order by x), 'p90', percentile_disc(0.9) within group (order by x))
      from (select (select count(*) from jsonb_object_keys(data->'research')) x
              from pg_temp.snap where jsonb_typeof(data->'research') = 'object') s),
    'streak', (select jsonb_build_object(
        'p50', percentile_disc(0.5) within group (order by x), 'p90', percentile_disc(0.9) within group (order by x),
        'week', count(*) filter (where x >= 7))
      from (select admin.num(data->'checkin'->'best') x from pg_temp.snap) s where x is not null)
  ) into m;

  insert into admin.daily (day, metrics, made_at) values (admin.today(), m, now())
    on conflict (day) do update set metrics = excluded.metrics, made_at = excluded.made_at;

  -- Keep what the pages read: 90 days of hours, 400 of days.
  delete from admin.active_hours where hour < now() - interval '90 days';
  delete from admin.active_days where day < admin.today() - 400;
  return m;
end;
$$;

-- NIGHTLY, 04:00 UTC. pg_cron is in the free tier; a project without it
-- still works, and Health says the snapshot has stopped.
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable (%): run admin_snapshot from Health instead', sqlerrm;
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dexora-admin-snapshot', '0 4 * * *', 'select admin.snapshot()');
  end if;
end $$;

-- ------------------------------------------------------------------ what the pages read
-- Each returns ONE jsonb document for one page, so a page is one round trip.

-- OVERVIEW: the KPI cards, and 2N days of series so the page can compare the
-- last N days with the N before.
create or replace function public.admin_overview(days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  n int := greatest(1, least(coalesce(days, 30), 200));
  today date := admin.today();
  r jsonb;
begin
  perform admin.guard();
  with ok as (select user_id, created_at from public.profiles where flagged_at is null),
  act as (select a.day, a.user_id from admin.active_days a join ok using (user_id) where a.day > today - 2 * n - 30),
  span as (select generate_series(today - (2 * n - 1), today, interval '1 day')::date as day),
  hrs as (
    select (h.hour at time zone 'utc')::date as day, count(*) as n
      from admin.active_hours h join ok using (user_id)
     where h.hour > now() - make_interval(days => 2 * n) group by 1),
  joins as (
    select (created_at at time zone 'utc')::date as day, count(*) as n
      from ok where created_at > now() - make_interval(days => 2 * n + 1) group by 1)
  select jsonb_build_object(
    'today', today,
    'total', (select count(*) from ok),
    'flagged', (select count(*) from public.profiles where flagged_at is not null),
    'now', (select count(*) from public.profiles where flagged_at is null and played_at > now() - interval '2 minutes'),
    'tracked_since', (select min(day) from admin.active_days),
    -- ponytail: rolling WAU/MAU by a join per day - fine to thousands of
    -- trainers; a daily rollup in the snapshot when it is not.
    'series', (select jsonb_agg(jsonb_build_object(
        'day', s.day,
        'dau', (select count(*) from act where act.day = s.day),
        'wau', (select count(distinct user_id) from act where act.day between s.day - 6 and s.day),
        'mau', (select count(distinct user_id) from act where act.day between s.day - 29 and s.day),
        'joined', coalesce((select j.n from joins j where j.day = s.day), 0),
        'hours', coalesce((select h.n from hrs h where h.day = s.day), 0)) order by s.day)
      from span s)
  ) into r;
  return r;
end;
$$;

-- PLAYERS: retention by the week trainers joined, the busy hours, and the
-- spreads the page bins itself (level from xp is the game's own `levelFromXp`).
create or replace function public.admin_players()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today date := admin.today();
  since date := (select min(day) from admin.active_days);
  r jsonb;
begin
  perform admin.guard();
  with ok as (select * from public.profiles where flagged_at is null),
  cohort as (
    select user_id, (created_at at time zone 'utc')::date as d0 from ok
     where since is not null and (created_at at time zone 'utc')::date >= since),
  -- D1 is the next day; D7 and D30 are "came back in that week" (7-13, 30-36).
  -- A cohort too young for a window counts nobody eligible for it.
  ret as (
    select date_trunc('week', c.d0)::date as week, count(*) as size,
      count(*) filter (where c.d0 + 1 < today) as e1,
      count(*) filter (where c.d0 + 1 < today and exists (
        select 1 from admin.active_days a where a.user_id = c.user_id and a.day = c.d0 + 1)) as d1,
      count(*) filter (where c.d0 + 13 < today) as e7,
      count(*) filter (where c.d0 + 13 < today and exists (
        select 1 from admin.active_days a where a.user_id = c.user_id and a.day between c.d0 + 7 and c.d0 + 13)) as d7,
      count(*) filter (where c.d0 + 36 < today) as e30,
      count(*) filter (where c.d0 + 36 < today and exists (
        select 1 from admin.active_days a where a.user_id = c.user_id and a.day between c.d0 + 30 and c.d0 + 36)) as d30
      from cohort c group by 1),
  -- Hour of the week in UTC, Monday 00:00 = 0; the page turns it to local time.
  busy as (
    select ((extract(isodow from h.hour at time zone 'utc')::int - 1) * 24
            + extract(hour from h.hour at time zone 'utc')::int) as k, count(*) as n
      from admin.active_hours h join ok using (user_id)
     where h.hour > now() - interval '28 days' group by 1)
  select jsonb_build_object(
    'since', since,
    'retention', (select coalesce(jsonb_agg(to_jsonb(ret) order by week), '[]') from ret),
    'busy', (select coalesce(jsonb_object_agg(k, n), '{}') from busy),
    -- ponytail: every trainer's xp and dex count, binned by the page - ~6KB a
    -- thousand trainers; bin in SQL when it is too many.
    'xp', (select coalesce(jsonb_agg(xp), '[]') from ok),
    'dex', (select coalesce(jsonb_agg(dex_count), '[]') from ok),
    'funnel', (select jsonb_build_object(
        'accounts', count(*),
        'saved', count(*) filter (where o.played_at is not null),
        'caught1', count(*) filter (where o.caught >= 1),
        'caught100', count(*) filter (where o.caught >= 100),
        'badge1', count(*) filter (where c.badges >= 1),
        'badge8', count(*) filter (where c.badges >= 8))
      from ok o left join public.trainer_cards c using (user_id))
  ) into r;
  return r;
end;
$$;

-- LEADERBOARDS, one board at a time.
create or replace function public.admin_leaders(board text, n int default 50, flagged boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform admin.guard();
  if board not in ('dex', 'level', 'steps', 'caught', 'variants', 'stars', 'trades', 'badges', 'ranked') then
    raise exception 'unknown board %', board using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.value desc nulls last), '[]') into r from (
    select p.user_id as id, p.username as name, p.xp, p.played_at, p.flagged_at is not null as flagged,
      case board
        when 'dex' then p.dex_count when 'level' then p.xp when 'steps' then p.steps when 'caught' then p.caught
        when 'variants' then c.variants when 'stars' then c.stars when 'trades' then c.trades
        when 'badges' then c.badges when 'ranked' then rr.rating end as value
      from public.profiles p
      left join public.trainer_cards c using (user_id)
      left join public.ranked_ratings rr on rr.user_id = p.user_id and rr.season = public.ranked_season() and not rr.voided
     where (flagged or p.flagged_at is null) and (board <> 'ranked' or rr.rating is not null)
     order by value desc nulls last
     limit greatest(1, least(coalesce(n, 50), 100))) t;
  return r;
end;
$$;

-- FIND A TRAINER by the start of their name.
create or replace function public.admin_find(name text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform admin.guard();
  select coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'name', username, 'flagged', flagged_at is not null)
           order by lower(username)), '[]') into r
    from (select * from public.profiles
           where lower(username) like replace(replace(replace(lower(trim(coalesce(name, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           order by lower(username) limit 20) p;
  return r;
end;
$$;

-- ONE TRAINER: card, activity, trades, ranked, reports, flags and the audit
-- about them. Never an email or a birthdate.
create or replace function public.admin_trainer(who uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform admin.guard();
  select jsonb_build_object(
    'id', p.user_id, 'name', p.username, 'char', p.char, 'joined', p.created_at, 'played', p.played_at,
    'dex', p.dex_count, 'caught', p.caught, 'steps', p.steps, 'xp', p.xp,
    'flagged', p.flagged_at, 'flag_reason', p.flag_reason,
    'card', (select jsonb_build_object('variants', c.variants, 'stars', c.stars, 'trades', c.trades,
        'badges', c.badges, 'badge_ids', c.badge_ids, 'titles', c.titles)
      from public.trainer_cards c where c.user_id = p.user_id),
    'days', (select coalesce(jsonb_agg(a.day order by a.day), '[]') from admin.active_days a
              where a.user_id = p.user_id and a.day > admin.today() - 180),
    'trades', (select coalesce(jsonb_object_agg(status, n), '{}') from (
        select status, count(*) n from public.trades where a = p.user_id or b = p.user_id group by status) z),
    'ranked', (select jsonb_build_object('rating', rating, 'peak', peak, 'games', games, 'wins', wins, 'voided', voided)
      from public.ranked_ratings where user_id = p.user_id and season = public.ranked_season()),
    'invited', (select count(*) from public.referrals where referrer = p.user_id),
    'reported', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'reason', x.reason, 'at', x.created_at,
        'by', (select username from public.profiles q where q.user_id = x.reporter),
        'dismissed', exists (select 1 from admin.dismissed d where d.report = x.id)) order by x.created_at desc), '[]')
      from public.reports x where x.reported = p.user_id),
    'reports_made', (select count(*) from public.reports where reporter = p.user_id),
    'audit', (select coalesce(jsonb_agg(jsonb_build_object('action', u.action, 'detail', u.detail, 'at', u.at,
        'by', (select username from public.profiles q where q.user_id = u.actor)) order by u.at desc), '[]')
      from admin.audit u where u.target = p.user_id)
  ) into r
  from public.profiles p where p.user_id = who;
  return r;
end;
$$;

-- SOCIAL: trades, listings, friends and invites by day.
create or replace function public.admin_social(days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  n int := greatest(1, least(coalesce(days, 30), 400));
  since timestamptz := now() - make_interval(days => n);
  r jsonb;
begin
  perform admin.guard();
  select jsonb_build_object(
    'trades', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'kind', kind, 'status', status, 'n', c)), '[]') from (
        select (created_at at time zone 'utc')::date d, kind, status, count(*) c
          from public.trades where created_at > since group by 1, 2, 3) z),
    'listings', (select jsonb_build_object(
        'open', count(*) filter (where status = 'open'),
        'made', count(*) filter (where created_at > since),
        'done', count(*) filter (where status = 'done' and closed_at > since)) from public.listings),
    'friends', (select jsonb_build_object(
        'accepted', count(*) filter (where status = 'accepted'),
        'pending', count(*) filter (where status = 'pending'),
        'made', count(*) filter (where created_at > since)) from public.friends),
    'friends_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', c) order by d), '[]') from (
        select (created_at at time zone 'utc')::date d, count(*) c from public.friends
         where created_at > since group by 1) z),
    'blocks', (select count(*) from public.blocks),
    'referrals', (select jsonb_build_object(
        'linked', count(*), 'qualified', count(*) filter (where qualified_at is not null),
        'linked_recent', count(*) filter (where linked_at > since),
        'qualified_recent', count(*) filter (where qualified_at > since)) from public.referrals)
  ) into r;
  return r;
end;
$$;

-- RANKED: a season's battles and its ratings (the page draws the floors from
-- ranked.js's RANKS, which ARE the SQL's - asserted by check.mjs).
create or replace function public.admin_ranked(season text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s text := coalesce(season, public.ranked_season());
  lo timestamptz;
  r jsonb;
begin
  perform admin.guard();
  if s !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'season is YYYY-MM' using errcode = '22023'; end if;
  lo := (s || '-01')::date::timestamp at time zone 'utc';
  select jsonb_build_object(
    'season', s,
    'seasons', (select coalesce(jsonb_agg(x order by x desc), '[]') from (select distinct q.season x from public.ranked_ratings q) z),
    'battles', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'status', status, 'n', c)), '[]') from (
        select (created_at at time zone 'utc')::date d, status, count(*) c from public.ranked_battles
         where created_at >= lo and created_at < lo + interval '1 month' group by 1, 2) z),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_array(q.rating, q.games, q.peak)), '[]')
      from public.ranked_ratings q join public.profiles p using (user_id)
     where q.season = s and not q.voided and p.flagged_at is null),
    'voided', (select count(*) from public.ranked_ratings q where q.season = s and q.voided)
  ) into r;
  return r;
end;
$$;

-- COLLECTION and EVENTS: the nightly snapshots in a window, newest last.
create or replace function public.admin_daily(days int default 90)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform admin.guard();
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'made', made_at, 'm', metrics) order by day), '[]') into r
    from admin.daily where day > admin.today() - greatest(1, least(coalesce(days, 90), 800));
  return r;
end;
$$;

-- "Run now" on Health: today's snapshot, at once.
create or replace function public.admin_snapshot()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform admin.guard();
  return admin.snapshot();
end;
$$;

-- MODERATION: open reports (not yet dismissed), flagged accounts, the audit.
create or replace function public.admin_moderation()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform admin.guard();
  select jsonb_build_object(
    'reports', (select coalesce(jsonb_agg(z order by z.latest desc), '[]') from (
        select x.reported as id, p.username as name, p.flagged_at is not null as flagged,
               count(*) as n, max(x.created_at) as latest,
               jsonb_agg(jsonb_build_object('id', x.id, 'reason', x.reason, 'at', x.created_at,
                 'by', (select username from public.profiles q where q.user_id = x.reporter)) order by x.created_at desc) as items
          from public.reports x join public.profiles p on p.user_id = x.reported
         where not exists (select 1 from admin.dismissed d where d.report = x.id)
         group by x.reported, p.username, p.flagged_at) z),
    'flagged', (select coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'name', username, 'at', flagged_at,
        'reason', flag_reason) order by flagged_at desc), '[]') from public.profiles where flagged_at is not null),
    'audit', (select coalesce(jsonb_agg(z order by z.at desc), '[]') from (
        select u.id, u.action, u.detail, u.at,
               (select username from public.profiles q where q.user_id = u.actor) as by,
               (select username from public.profiles q where q.user_id = u.target) as target, u.target as target_id
          from admin.audit u order by u.at desc limit 100) z)
  ) into r;
  return r;
end;
$$;

-- HEALTH: the database against the free tier's 500MB, the biggest tables and
-- saves, and when the snapshot last ran.
create or replace function public.admin_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb;
  runs jsonb := '[]';
begin
  perform admin.guard();
  begin
    select coalesce(jsonb_agg(jsonb_build_object('at', start_time, 'status', status, 'message', left(return_message, 200))
             order by start_time desc), '[]') into runs
      from (select d.start_time, d.status, d.return_message from cron.job_run_details d
              join cron.job j on j.jobid = d.jobid where j.jobname = 'dexora-admin-snapshot'
             order by d.start_time desc limit 10) z;
  exception when others then
    runs := null;   -- no pg_cron on this project
  end;
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('name', n.nspname || '.' || c.relname,
        'bytes', pg_total_relation_size(c.oid), 'rows', greatest(c.reltuples, 0)::bigint)
        order by pg_total_relation_size(c.oid) desc), '[]')
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public', 'admin')),
    'saves', (select coalesce(jsonb_agg(z order by z.bytes desc), '[]') from (
        select p.username as name, v.user_id as id, pg_column_size(v.data) as bytes
          from public.saves v join public.profiles p using (user_id)
         order by pg_column_size(v.data) desc limit 10) z),
    'snapshot', (select jsonb_build_object('day', day, 'made', made_at) from admin.daily order by day desc limit 1),
    'tracked_since', (select min(day) from admin.active_days),
    'cron', runs
  ) into r;
  return r;
end;
$$;

-- ------------------------------------------------------------------ moderation writes
-- Each one audited, each one says why. None ever touches a save.

create or replace function public.admin_flag(who uuid, why text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare w text := admin.why(why);
begin
  perform admin.guard();
  update public.profiles set flagged_at = now(), flag_reason = 'admin: ' || w
   where user_id = who and flagged_at is null;
  if found then perform admin.log('flag', who, jsonb_build_object('why', w)); end if;
end;
$$;

create or replace function public.admin_unflag(who uuid, why text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  w text := admin.why(why);
  was text;
begin
  perform admin.guard();
  select flag_reason into was from public.profiles where user_id = who and flagged_at is not null;
  update public.profiles set flagged_at = null, flag_reason = null where user_id = who and flagged_at is not null;
  if found then perform admin.log('unflag', who, jsonb_build_object('why', w, 'was', was)); end if;
end;
$$;

-- Off this season's ladder and out of matchmaking (ranked.sql's own void).
create or replace function public.admin_void(who uuid, why text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare w text := admin.why(why);
begin
  perform admin.guard();
  perform public.void_trainer(who, null);
  perform admin.log('void', who, jsonb_build_object('why', w, 'season', public.ranked_season()));
end;
$$;

create or replace function public.admin_dismiss(ids bigint[], why text)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  w text := admin.why(why);
  n int;
  target uuid;
begin
  perform admin.guard();
  select min(reported::text)::uuid into target from public.reports where id = any(ids);
  insert into admin.dismissed (report, by, why)
    select id, auth.uid(), w from public.reports where id = any(ids) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform admin.log('dismiss', target, jsonb_build_object('why', w, 'reports', ids)); end if;
  return n;
end;
$$;

-- ------------------------------------------------------------------ grants
-- The admin schema's functions are nobody's but these. Every `admin_*` and
-- `is_admin` is callable by a signed-in user - and refused inside by the guard.
revoke all on all functions in schema admin from public, anon, authenticated;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname = 'is_admin') loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.dashboard_mfa() from public, anon;
grant execute on function public.dashboard_mfa() to authenticated;

notify pgrst, 'reload schema';
