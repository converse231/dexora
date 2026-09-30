-- RANKED (docs/ranked.md): 6a DEFENSE TEAMS, 6b REFEREED BATTLES, 6c THE LADDER.
--
-- Run AFTER db/trading.sql, whose functions this reads (box_snapshot,
-- are_friends). Every statement is re-runnable, like trading.sql's: paste the
-- whole file again after any change.
--
-- A defense team is up to six box uids. Like the shelf and the showcase, each
-- uid is checked against the trainer's STORED save - never the request - and
-- read back from it every time it is shown, so a Pokemon sold, traded or
-- evolved since is shown as it now is, or as gone. Species legality (the
-- species clause, which needs the dex's forms) is the rules' in the browser
-- and, from 6b, the battle function's; the database holds what it can check.

-- ------------------------------------------------------------------ limits
-- Equal to src/game/ranked.js's DEFENSE_SLOTS, DEFENSE_MIN, PLACEMENT and
-- DAILY_BATTLES, league.js's TEAM_MAX and referee.js's ABANDON_MINUTES
-- (asserted by check.mjs, as trade_limit is against LIMITS). K, the window
-- and the list sizes are the ladder's own (docs/ranked.md, *Ratings*).
create or replace function public.ranked_limit(name text)
returns int language sql immutable set search_path = '' as $$
  select case name
    when 'SLOTS' then 3
    when 'TEAM' then 6
    when 'MIN' then 2
    when 'ABANDON_MINUTES' then 10
    when 'PLACEMENT' then 5
    when 'DAILY' then 20
    when 'K' then 20
    when 'K_PLACEMENT' then 40
    when 'WINDOW' then 100
    when 'WINDOW_STEP' then 50
    when 'WINDOW_MAX' then 400
    when 'TOP' then 100
    when 'PAST_TOP' then 10
    when 'SHOW_TEAM' then 10
    when 'LEVEL' then 100   -- a member must be this level in the stored box (docs/ranked.md, Entry)
  end
$$;

-- ------------------------------------------------------------------ table
create table if not exists public.defense_teams (
  owner      uuid not null references auth.users on delete cascade,
  slot       smallint not null check (slot between 1 and 3),
  uids       int[] not null check (cardinality(uids) between 1 and 6),
  updated_at timestamptz not null default now(),
  primary key (owner, slot)
);
-- Read your own; nobody writes but `set_defense_team`. A friend reads one of
-- yours only through `practice_team`, which picks it blind.
alter table public.defense_teams enable row level security;
drop policy if exists "read own defense" on public.defense_teams;
create policy "read own defense" on public.defense_teams for select using (auth.uid() = owner);

-- ------------------------------------------------------------------ reading a team
-- A team as it stands in a save's box: each uid's card snapshot, in the
-- team's order, or `{uid, missing: true}` where the box no longer holds it.
create or replace function public.defense_snapshot(box jsonb, uids int[])
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(case when x.e is null then jsonb_build_object('uid', u.v, 'missing', true)
                                 else public.box_snapshot(x.e) end order by u.n), '[]')
    from unnest(coalesce(uids, '{}')) with ordinality u(v, n)
    left join lateral (
      select e from jsonb_array_elements(case when jsonb_typeof(box) = 'array' then box else '[]' end) e
       where e->>'uid' = u.v::text and coalesce(e->>'species', '') ~ '^\d{1,5}$'
       limit 1) x on true
$$;
revoke all on function public.defense_snapshot(jsonb, int[]) from public, anon, authenticated;

-- Your teams, each read off your STORED save.
create or replace function public.my_defense()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slot', d.slot, 'team', public.defense_snapshot(sv.data->'box', d.uids),
                                               'updated_at', d.updated_at) order by d.slot), '[]')
    from public.defense_teams d
    left join public.saves sv on sv.user_id = d.owner
   where d.owner = auth.uid()
$$;

-- ------------------------------------------------------------------ writing a team
-- One slot, replaced whole: up to six distinct box uids, every one of them in
-- your STORED save (the game flushes before it asks). An empty list clears the
-- slot. REFUSED, not trimmed: a team quietly missing a member is a surprise
-- in a battle, so a uid the server cannot see (an upload still in flight)
-- is an error the game shows ("try again in a moment").
create or replace function public.set_defense_team(slot int, uids int[])
returns jsonb language plpgsql security definer set search_path = '' as $$
-- `slot` and `uids` are both parameters (the RPC's names) and columns: a bare
-- name is the column, and every parameter is written qualified.
#variable_conflict use_column
declare
  me uuid := auth.uid();
  box jsonb;
  asked int[] := coalesce(set_defense_team.uids, '{}');
begin
  if me is null then raise exception 'not signed in'; end if;
  if set_defense_team.slot is null or set_defense_team.slot not between 1 and public.ranked_limit('SLOTS') then
    raise exception 'no such team slot';
  end if;
  if cardinality(asked) = 0 then
    delete from public.defense_teams d where d.owner = me and d.slot = set_defense_team.slot;
    return public.my_defense();
  end if;
  if cardinality(asked) > public.ranked_limit('TEAM') then raise exception 'a team is six at most'; end if;
  if (select count(distinct v) from unnest(asked) v) <> cardinality(asked) or array_position(asked, null) is not null then
    raise exception 'a Pokemon is in the team twice';
  end if;
  select case when jsonb_typeof(sv.data->'box') = 'array' then sv.data->'box' else '[]' end
    into box from public.saves sv where sv.user_id = me;
  if exists (select 1 from jsonb_array_elements(public.defense_snapshot(coalesce(box, '[]'), asked)) m where m ? 'missing') then
    raise exception 'not in your saved box';
  end if;
  if exists (select 1 from jsonb_array_elements(public.defense_snapshot(box, asked)) m
              where coalesce((m->>'level')::int, 0) < public.ranked_limit('LEVEL')) then
    raise exception 'under level 100';
  end if;
  insert into public.defense_teams (owner, slot, uids) values (me, set_defense_team.slot, asked)
  on conflict (owner, slot) do update set uids = excluded.uids, updated_at = now();
  return public.my_defense();
end;
$$;

-- ------------------------------------------------------------------ practice
-- A FRIEND'S DEFENSE, BLIND: one of their teams, picked here at random so the
-- game never holds the others, with its members as their STORED save has
-- them now (any gone since are left out). Null for anybody who is not a
-- friend (friends are never blocked - a block ends the friendship), or who
-- has no team with a Pokemon still in it.
create or replace function public.practice_team(who uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t jsonb;
begin
  if me is null or who is null or me = who or not public.are_friends(me, who) then return null; end if;
  select x.team into t from (
    select public.defense_snapshot(sv.data->'box', d.uids) as team
      from public.defense_teams d left join public.saves sv on sv.user_id = d.owner
     where d.owner = who) x
   where exists (select 1 from jsonb_array_elements(x.team) m
                  where not (m ? 'missing') and coalesce((m->>'level')::int, 0) >= public.ranked_limit('LEVEL'))
   order by random() limit 1;
  if t is null then return null; end if;
  return (select jsonb_agg(m) from jsonb_array_elements(t) m
           where not (m ? 'missing') and coalesce((m->>'level')::int, 0) >= public.ranked_limit('LEVEL'));
end;
$$;

revoke all on function public.my_defense() from public, anon;
revoke all on function public.set_defense_team(int, int[]) from public, anon;
revoke all on function public.practice_team(uuid) from public, anon;
grant execute on function public.my_defense() to authenticated;
grant execute on function public.set_defense_team(int, int[]) to authenticated;
grant execute on function public.practice_team(uuid) to authenticated;

-- =================================================================== 6b: THE SERVER REFEREES
-- A ranked battle lives here, played turn by turn by the `ranked-step` Edge
-- Function (supabase/functions/ranked-step), which holds the rules; this file
-- stores. Nobody but the service role reads or writes a battle: the row holds
-- the SEED (every roll comes from it) and the STATE (the defender's whole
-- team), and a challenger who could read either could see the dice or the
-- team they are meant to meet blind. The function sends the challenger a view.

create table if not exists public.ranked_battles (
  id            uuid primary key default gen_random_uuid(),
  challenger    uuid not null references auth.users on delete cascade,
  defender      uuid references auth.users on delete set null,
  defense_slot  smallint,
  teams         jsonb not null,            -- {mine, foe}: the snapshots the battle opened with
  seed          bigint not null,
  state         jsonb not null,            -- referee.js's {b, n, seen}
  n             int not null default 0,    -- steps taken: the compare-and-set a save checks
  status        text not null default 'active' check (status in ('active', 'won', 'lost', 'abandoned')),
  rules_version int not null,
  deadline      timestamptz not null,      -- the current decision's; later plays the AI's
  seen_at       timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
-- One open battle a challenger: a second start resumes the first.
create unique index if not exists ranked_one_active on public.ranked_battles (challenger) where status = 'active';
-- The 24-hour rule reads (challenger, defender, created_at); expiry reads stale open battles.
create index if not exists ranked_recent on public.ranked_battles (challenger, defender, created_at);
create index if not exists ranked_open on public.ranked_battles (seen_at) where status = 'active';
alter table public.ranked_battles enable row level security;
revoke all on public.ranked_battles from anon, authenticated;

-- The challenger's side: box uids read off their STORED save (distinct, one
-- to six, every one there), as defense teams are. The species clause is the
-- function's, which has the dex.
create or replace function public.ranked_team(me uuid, uids int[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  asked int[] := coalesce(uids, '{}');
  snap jsonb;
begin
  if cardinality(asked) = 0 or cardinality(asked) > public.ranked_limit('TEAM') then raise exception 'team size'; end if;
  if (select count(distinct v) from unnest(asked) v) <> cardinality(asked) or array_position(asked, null) is not null then
    raise exception 'a Pokemon is in the team twice';
  end if;
  select public.defense_snapshot(sv.data->'box', asked) into snap from public.saves sv where sv.user_id = me;
  if snap is null or exists (select 1 from jsonb_array_elements(snap) m where m ? 'missing') then
    raise exception 'not in your saved box';
  end if;
  if exists (select 1 from jsonb_array_elements(snap) m where coalesce((m->>'level')::int, 0) < public.ranked_limit('LEVEL')) then
    raise exception 'under level 100';
  end if;
  return snap;
end;
$$;

revoke all on function public.ranked_team(uuid, int[]) from public, anon, authenticated;
grant execute on function public.ranked_team(uuid, int[]) to service_role;
-- The battle's other functions (expire, candidates, create, load, save) are
-- defined once, as the ladder has them, in 6c below.

-- =================================================================== 6c: THE LADDER
-- Ratings are the database's: Elo runs HERE, in the same transaction that
-- finishes a battle, so a result and the points it moves can never part, and
-- no client reads or writes a rating - the page reads standings through the
-- functions below. docs/ranked.md, *Ratings* and 6c's decisions.

alter table public.ranked_battles add column if not exists season text;           -- null: a 6b preview battle, never rated
alter table public.ranked_battles add column if not exists anchor text;           -- a League anchor's id, when that was whom you met
alter table public.ranked_battles add column if not exists anchor_rating int;
alter table public.ranked_battles add column if not exists rated boolean not null default false;
alter table public.ranked_battles add column if not exists challenger_delta int;
alter table public.ranked_battles add column if not exists defender_delta int;
create index if not exists ranked_defended on public.ranked_battles (defender, finished_at desc);
create index if not exists ranked_today on public.ranked_battles (challenger, created_at);

create table if not exists public.ranked_ratings (
  user_id uuid not null references auth.users on delete cascade,
  season  text not null,                    -- a calendar month, UTC: '2026-10'
  rating  int not null,
  peak    int not null,                     -- the season's highest, whose rank is the floor
  games   int not null default 0,           -- as challenger and as defender
  wins    int not null default 0,
  voided  boolean not null default false,   -- off the list and out of matchmaking (`void_trainer`)
  primary key (user_id, season)
);
create index if not exists ranked_ladder on public.ranked_ratings (season, rating desc) where not voided;
alter table public.ranked_ratings enable row level security;
revoke all on public.ranked_ratings from anon, authenticated;

create or replace function public.ranked_season(at timestamptz default now())
returns text language sql stable set search_path = '' as $$
  select to_char(at at time zone 'UTC', 'YYYY-MM')
$$;

-- THE FLOOR: the rank of a season's peak (ranked.js RANKS, asserted) - the
-- eight ranks' lower edges since 2026-09-29 (the Ball tiers' 1100/1250/1400 before).
create or replace function public.ranked_floor(peak int)
returns int language sql immutable set search_path = '' as $$
  select case when peak >= 1400 then 1400 when peak >= 1325 then 1325 when peak >= 1250 then 1250
              when peak >= 1200 then 1200 when peak >= 1150 then 1150 when peak >= 1100 then 1100
              when peak >= 1050 then 1050 end
$$;

-- Where a trainer starts a season: halfway from their last season back to 1000.
create or replace function public.ranked_start(who uuid, s text)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select 1000 + round((r.rating - 1000) / 2.0)::int from public.ranked_ratings r
                    where r.user_id = who and r.season < s order by r.season desc limit 1), 1000)
$$;

-- A trainer's row for a season, made the first time it is needed - the soft
-- reset is lazy, so no job runs when a month turns.
create or replace function public.ranked_row(who uuid, s text)
returns public.ranked_ratings language plpgsql volatile security definer set search_path = '' as $$
declare r public.ranked_ratings;
begin
  insert into public.ranked_ratings (user_id, season, rating, peak)
  values (who, s, public.ranked_start(who, s), public.ranked_start(who, s))
  on conflict (user_id, season) do nothing;
  select * into r from public.ranked_ratings where user_id = who and season = s;
  return r;
end;
$$;

-- RATE A FINISHED BATTLE, once (`rated`). Won is 1, lost and abandoned are 0.
-- K 40 through placement, then 20; the defender at half their K; against an
-- anchor only the challenger moves. A rating never falls below the floor of
-- its season's peak. Both rows are locked in id order: two battles ending
-- together between the same two trainers neither lose an update nor deadlock.
create or replace function public.ranked_rate(bid uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.ranked_battles;
  c public.ranked_ratings;
  d public.ranked_ratings;
  sc numeric;
  e numeric;
  opp int;
  kc int;
  kd int;
  nc int;
  nd int;
begin
  select * into b from public.ranked_battles where id = bid for update;
  if not found or b.rated or b.status = 'active' or b.season is null then return; end if;
  sc := case when b.status = 'won' then 1 else 0 end;
  perform public.ranked_row(b.challenger, b.season);
  if b.defender is not null then perform public.ranked_row(b.defender, b.season); end if;
  perform 1 from public.ranked_ratings r
   where r.season = b.season and r.user_id in (b.challenger, b.defender) order by r.user_id for update;
  select * into c from public.ranked_ratings where user_id = b.challenger and season = b.season;
  if b.defender is not null then
    select * into d from public.ranked_ratings where user_id = b.defender and season = b.season;
    opp := d.rating;
  else
    opp := b.anchor_rating;
  end if;
  e := 1 / (1 + power(10::numeric, (opp - c.rating) / 400.0));
  if not c.voided then
    kc := case when c.games < public.ranked_limit('PLACEMENT') then public.ranked_limit('K_PLACEMENT') else public.ranked_limit('K') end;
    nc := c.rating + round(kc * (sc - e))::int;
    nc := greatest(nc, coalesce(public.ranked_floor(c.peak), nc));
    update public.ranked_ratings set rating = nc, peak = greatest(peak, nc), games = games + 1, wins = wins + sc::int
     where user_id = c.user_id and season = c.season;
  end if;
  if b.defender is not null and not d.voided then
    kd := (case when d.games < public.ranked_limit('PLACEMENT') then public.ranked_limit('K_PLACEMENT') else public.ranked_limit('K') end) / 2;
    nd := d.rating + round(kd * ((1 - sc) - (1 - e)))::int;
    nd := greatest(nd, coalesce(public.ranked_floor(d.peak), nd));
    update public.ranked_ratings set rating = nd, peak = greatest(peak, nd), games = games + 1, wins = wins + (1 - sc)::int
     where user_id = d.user_id and season = d.season;
  end if;
  update public.ranked_battles set rated = true,
    challenger_delta = case when c.voided then 0 else nc - c.rating end,
    defender_delta = case when b.defender is null or d.voided then null else nd - d.rating end
   where id = bid;
end;
$$;

-- A battle nobody has asked about for ABANDON_MINUTES is abandoned - LOST,
-- and rated when marked. Lazy - run by every start and by the challenger's
-- own next request - so no scheduled job.
create or replace function public.ranked_expire(who uuid default null)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare r record; gone int := 0;
begin
  for r in
    update public.ranked_battles set status = 'abandoned', finished_at = now()
     where status = 'active' and (who is null or challenger = who)
       and seen_at < now() - make_interval(mins => public.ranked_limit('ABANDON_MINUTES'))
    returning id
  loop
    perform public.ranked_rate(r.id);
    gone := gone + 1;
  end loop;
  return gone;
end;
$$;

-- A trainer's rating as matchmaking reads it, row or no row.
create or replace function public.ranked_now(who uuid, s text)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select r.rating from public.ranked_ratings r where r.user_id = who and r.season = s),
                  public.ranked_start(who, s))
$$;

-- WHOM YOU MIGHT MEET (6c): the 6b rules - two or more defense teams holding a
-- Pokemon, played in the last 14 days, never you, never across a block, never
-- one met in 24 hours - and now never voided, and within a rating WINDOW of
-- you that widens (100, 150 ... 400) until somebody is in it. Refused when
-- you are voided or have had today's battles. Answers your rating, up to ten
-- candidates in random order, and the anchors you met in the last 24 hours
-- (the function falls back to the nearest other anchor).
-- ponytail: every eligible owner is scanned per window step; an index on
-- (season, rating) serves the ratings, and the defense scan is small at this
-- game's size - precompute eligibility if the ladder outgrows it.
create or replace function public.ranked_candidates(me uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s text := public.ranked_season();
  mine public.ranked_ratings;
  w int := public.ranked_limit('WINDOW');
  found_ jsonb := '[]';
begin
  perform public.ranked_expire();
  mine := public.ranked_row(me, s);
  if mine.voided then raise exception 'voided'; end if;
  if (select count(*) from public.ranked_battles r
       where r.challenger = me and r.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
     >= public.ranked_limit('DAILY') then
    raise exception 'daily cap';
  end if;
  loop
    select coalesce(jsonb_agg(c), '[]') into found_ from (
      select jsonb_build_object('user_id', o.owner, 'username', tc.username, 'char', tc.char, 'teams', o.teams,
                                'rating', public.ranked_now(o.owner, s),
                                'games', coalesce(rr.games, 0)) as c
        from (
          select d.owner, jsonb_agg(jsonb_build_object('slot', d.slot, 'team', t.team) order by d.slot) as teams
            from public.defense_teams d
            join public.saves sv on sv.user_id = d.owner
            cross join lateral (
              select coalesce(jsonb_agg(m), '[]') as team
                from jsonb_array_elements(public.defense_snapshot(sv.data->'box', d.uids)) m
               where not (m ? 'missing') and coalesce((m->>'level')::int, 0) >= public.ranked_limit('LEVEL')) t
           where d.owner <> me and jsonb_array_length(t.team) > 0
           group by d.owner
          having count(*) >= public.ranked_limit('MIN')) o
        join public.trainer_cards tc on tc.user_id = o.owner
        left join public.ranked_ratings rr on rr.user_id = o.owner and rr.season = s
       where tc.played_at > now() - interval '14 days'
         and not coalesce(rr.voided, false)
         and abs(public.ranked_now(o.owner, s) - mine.rating) <= w
         and not public.blocked_between(me, o.owner)
         and not exists (select 1 from public.ranked_battles r
                          where r.challenger = me and r.defender = o.owner and r.created_at > now() - interval '24 hours')
       order by random() limit 10) z;
    exit when jsonb_array_length(found_) > 0 or w >= public.ranked_limit('WINDOW_MAX');
    w := w + public.ranked_limit('WINDOW_STEP');
  end loop;
  return jsonb_build_object('rating', mine.rating, 'games', mine.games, 'candidates', found_,
    'anchors_met', coalesce((select jsonb_agg(distinct r.anchor) from public.ranked_battles r
                              where r.challenger = me and r.anchor is not null
                                and r.created_at > now() - interval '24 hours'), '[]'));
end;
$$;

-- A battle begins, in this season, against a trainer or an anchor. The daily
-- cap is checked here too: two starts racing past `ranked_candidates` still
-- meet the unique open-battle index, and the cap counts what was created.
-- 6b's signature had no anchor: dropped, or a project that ran 6b keeps both.
drop function if exists public.ranked_create(uuid, uuid, int, jsonb, bigint, jsonb, timestamptz, int);
create or replace function public.ranked_create(me uuid, defender uuid, slot int, teams jsonb, seed bigint,
                                                state jsonb, deadline timestamptz, version int,
                                                anchor text default null, anchor_rating int default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare made uuid;
begin
  if (select count(*) from public.ranked_battles r
       where r.challenger = me and r.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
     >= public.ranked_limit('DAILY') then
    raise exception 'daily cap';
  end if;
  insert into public.ranked_battles (challenger, defender, defense_slot, teams, seed, state, rules_version, deadline,
                                     season, anchor, anchor_rating)
  values (me, defender, slot, teams, seed, state, version, deadline, public.ranked_season(), anchor, anchor_rating)
  returning id into made;
  return made;
exception when unique_violation then
  raise exception 'already in a battle';
end;
$$;

-- Your open battle, whole (seed and state: the function's eyes only), with
-- whom it is against - a trainer or an anchor. Being asked is being present,
-- so it counts as seen; one gone quiet past the limit is lost first.
create or replace function public.ranked_load(me uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.ranked_expire(me);
  update public.ranked_battles set seen_at = now() where challenger = me and status = 'active';
  select jsonb_build_object('id', b.id, 'defender', b.defender, 'username', tc.username, 'char', tc.char,
                            'anchor', b.anchor, 'teams', b.teams, 'seed', b.seed, 'state', b.state, 'n', b.n,
                            'deadline', b.deadline, 'rules_version', b.rules_version,
                            'opponent_rating', coalesce(b.anchor_rating, public.ranked_now(b.defender, coalesce(b.season, public.ranked_season()))))
    into r
    from public.ranked_battles b left join public.trainer_cards tc on tc.user_id = b.defender
   where b.challenger = me and b.status = 'active';
  return r;
end;
$$;

-- A step saved, COMPARE-AND-SET on the step counter: two requests for one
-- turn (two tabs, a retry) make one turn; the loser is told and resyncs. A
-- step that ends the battle rates it in the same transaction.
create or replace function public.ranked_save(me uuid, id uuid, expect int, state jsonb, n int,
                                              status text, deadline timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ranked_battles b set
    state = ranked_save.state, n = ranked_save.n, status = ranked_save.status,
    deadline = ranked_save.deadline, seen_at = now(),
    finished_at = case when ranked_save.status = 'active' then null else now() end
   where b.id = ranked_save.id and b.challenger = me and b.status = 'active' and b.n = ranked_save.expect;
  if not found then return false; end if;
  if ranked_save.status <> 'active' then perform public.ranked_rate(ranked_save.id); end if;
  return true;
end;
$$;

-- What a finished battle did to its challenger, for the result screen.
create or replace function public.ranked_outcome(me uuid, id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('rated', b.rated, 'delta', b.challenger_delta,
                            'rating', r.rating, 'games', r.games, 'wins', r.wins, 'peak', r.peak)
    from public.ranked_battles b
    left join public.ranked_ratings r on r.user_id = b.challenger and r.season = b.season
   where b.id = ranked_outcome.id and b.challenger = me
$$;

-- MODERATION (docs/ranked.md, *Moderation*): a trainer off a season's list
-- and out of its matchmaking, rating back to its start. Their battles stay
-- on record and their opponents' points stand. The service role's only: run
-- it in the SQL editor.
create or replace function public.void_trainer(who uuid, s text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare season_ text := coalesce(s, public.ranked_season());
begin
  perform public.ranked_row(who, season_);
  update public.ranked_ratings set voided = true, rating = public.ranked_start(who, season_)
   where user_id = who and season = season_;
end;
$$;

revoke all on function public.ranked_season(timestamptz) from public, anon;
revoke all on function public.ranked_floor(int) from public, anon;
revoke all on function public.ranked_start(uuid, text) from public, anon, authenticated;
revoke all on function public.ranked_row(uuid, text) from public, anon, authenticated;
revoke all on function public.ranked_rate(uuid) from public, anon, authenticated;
revoke all on function public.ranked_now(uuid, text) from public, anon, authenticated;
revoke all on function public.ranked_expire(uuid) from public, anon, authenticated;
revoke all on function public.ranked_load(uuid) from public, anon, authenticated;
revoke all on function public.ranked_save(uuid, uuid, int, jsonb, int, text, timestamptz) from public, anon, authenticated;
revoke all on function public.ranked_candidates(uuid) from public, anon, authenticated;
revoke all on function public.ranked_create(uuid, uuid, int, jsonb, bigint, jsonb, timestamptz, int, text, int) from public, anon, authenticated;
revoke all on function public.ranked_outcome(uuid, uuid) from public, anon, authenticated;
revoke all on function public.void_trainer(uuid, text) from public, anon, authenticated;
grant execute on function public.ranked_expire(uuid) to service_role;
grant execute on function public.ranked_load(uuid) to service_role;
grant execute on function public.ranked_save(uuid, uuid, int, jsonb, int, text, timestamptz) to service_role;
grant execute on function public.ranked_candidates(uuid) to service_role;
grant execute on function public.ranked_create(uuid, uuid, int, jsonb, bigint, jsonb, timestamptz, int, text, int) to service_role;
grant execute on function public.ranked_outcome(uuid, uuid) to service_role;
grant execute on function public.void_trainer(uuid, text) to service_role;
grant execute on function public.ranked_rate(uuid) to service_role;

-- ------------------------------------------------------------------ what players read
-- A standing as the page shows one: rating, games, wins, peak, and whether
-- placement is over. Never a voided trainer's (they are off the ladder).
create or replace function public.ranked_entry(who uuid, s text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', who, 'username', tc.username, 'char', tc.char,
    'rating', coalesce(r.rating, public.ranked_start(who, s)), 'games', coalesce(r.games, 0),
    'wins', coalesce(r.wins, 0), 'peak', coalesce(r.peak, public.ranked_start(who, s)),
    'voided', coalesce(r.voided, false))
    from public.trainer_cards tc
    left join public.ranked_ratings r on r.user_id = who and r.season = s
   where tc.user_id = who
$$;
revoke all on function public.ranked_entry(uuid, text) from public, anon, authenticated;

-- YOUR STANDING: this season, your place among placed trainers, today's
-- battles against the cap, and every past season's peak (your season badges).
create or replace function public.my_ranked()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else
    public.ranked_entry(auth.uid(), public.ranked_season()) || jsonb_build_object(
      'season', public.ranked_season(),
      'place', (select 1 + count(*) from public.ranked_ratings o
                 where o.season = public.ranked_season() and not o.voided
                   and o.games >= public.ranked_limit('PLACEMENT')
                   and o.rating > public.ranked_now(auth.uid(), public.ranked_season())),
      'today', (select count(*) from public.ranked_battles r
                 where r.challenger = auth.uid()
                   and r.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'),
      'cap', public.ranked_limit('DAILY'),
      'badges', coalesce((select jsonb_agg(jsonb_build_object('season', r.season, 'peak', r.peak) order by r.season desc)
                            from public.ranked_ratings r
                           where r.user_id = auth.uid() and r.season < public.ranked_season()
                             and not r.voided and r.games >= public.ranked_limit('PLACEMENT')), '[]')) end
$$;

-- THE LIST: a season's top trainers past placement, never voided, never
-- across a block. Each with what the card already shows (level, Pokedex,
-- days played) - so an account too new for its team reads as what it is -
-- and its most-used defense team's Pokemon once that team has defended
-- SHOW_TEAM times, so the list is not a scouting sheet. `lim` is capped at TOP.
create or replace function public.ranked_top(s text default null, lim int default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with season_ as (select coalesce(s, public.ranked_season()) as s)
  select coalesce(jsonb_agg(x order by (x->>'place')::int), '[]') from (
    select jsonb_build_object('place', row_number() over (order by r.rating desc, r.wins desc, r.user_id),
      'user_id', r.user_id, 'username', tc.username, 'char', tc.char, 'rating', r.rating,
      'games', r.games, 'wins', r.wins, 'xp', tc.xp, 'dex_count', tc.dex_count, 'joined_at', tc.joined_at,
      'team', (select case when u.n >= public.ranked_limit('SHOW_TEAM') then
                 (select coalesce(jsonb_agg(m->'species'), '[]')
                    from public.defense_teams d
                    join public.saves sv on sv.user_id = d.owner
                    cross join lateral jsonb_array_elements(public.defense_snapshot(sv.data->'box', d.uids)) m
                   where d.owner = r.user_id and d.slot = u.slot and not (m ? 'missing')) end
                 from (select b.defense_slot as slot, count(*) as n from public.ranked_battles b
                        where b.defender = r.user_id and b.season = r.season and b.status <> 'active'
                        group by b.defense_slot order by count(*) desc limit 1) u)) as x
      from public.ranked_ratings r
      join public.trainer_cards tc on tc.user_id = r.user_id
      cross join season_
     where r.season = season_.s and not r.voided
       and r.games >= public.ranked_limit('PLACEMENT')
       and (auth.uid() is null or not public.blocked_between(auth.uid(), r.user_id))
     order by r.rating desc, r.wins desc, r.user_id
     limit least(coalesce(lim, public.ranked_limit('TOP')), public.ranked_limit('TOP'))) z
$$;

-- The seasons there is a list for, newest first.
create or replace function public.ranked_seasons()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(s order by s desc), '[]') from (select distinct season as s from public.ranked_ratings) z
$$;

-- You and your friends, this season.
create or replace function public.ranked_friends()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(e order by (e->>'rating')::int desc), '[]') from (
    select public.ranked_entry(u, public.ranked_season()) as e from (
      select auth.uid() as u where auth.uid() is not null
      union
      select case when f.a = auth.uid() then f.b else f.a end from public.friends f
       where f.status = 'accepted' and auth.uid() in (f.a, f.b)) us) z
   where not coalesce((e->>'voided')::boolean, false)
$$;

-- A trainer's rank for their profile: this season and their season badges -
-- not across a block.
create or replace function public.ranked_standing(who uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null or who is null or public.blocked_between(auth.uid(), who) then null else
    public.ranked_entry(who, public.ranked_season()) || jsonb_build_object(
      'badges', coalesce((select jsonb_agg(jsonb_build_object('season', r.season, 'peak', r.peak) order by r.season desc)
                            from public.ranked_ratings r
                           where r.user_id = who and r.season < public.ranked_season()
                             and not r.voided and r.games >= public.ranked_limit('PLACEMENT')), '[]')) end
$$;

-- YOUR DEFENSE LOG: the latest battles against your teams, as you lived them.
create or replace function public.my_defense_log()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
    select jsonb_build_object('username', tc.username, 'char', tc.char, 'slot', b.defense_slot,
      'held', b.status <> 'won', 'delta', b.defender_delta, 'at', b.finished_at) as x
      from public.ranked_battles b left join public.trainer_cards tc on tc.user_id = b.challenger
     where b.defender = auth.uid() and b.status <> 'active' and b.season is not null
     order by b.finished_at desc limit 30) z
$$;

revoke all on function public.my_ranked() from public, anon;
revoke all on function public.ranked_top(text, int) from public, anon;
revoke all on function public.ranked_seasons() from public, anon;
revoke all on function public.ranked_friends() from public, anon;
revoke all on function public.ranked_standing(uuid) from public, anon;
revoke all on function public.my_defense_log() from public, anon;
grant execute on function public.my_ranked() to authenticated;
grant execute on function public.ranked_top(text, int) to authenticated;
grant execute on function public.ranked_seasons() to authenticated;
grant execute on function public.ranked_friends() to authenticated;
grant execute on function public.ranked_standing(uuid) to authenticated;
grant execute on function public.my_defense_log() to authenticated;
