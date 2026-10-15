-- INVITE A FRIEND - the server half (src/game/referral.js is the rulebook's
-- words; docs/trading.md, Referrals). Applied AFTER db/trading.sql (it reads
-- profiles.flagged_at, save_int, befriend and blocked_between) and
-- re-runnable, like ranked.sql.
--
-- Nothing a browser says is trusted: a link is made here, progress is read
-- off the STORED save by a trigger, and qualifying is decided here. The
-- rewards themselves are paid by the game, once per id, from what
-- my_referrals() answers.

create table if not exists public.referrals (
  referee      uuid primary key references auth.users on delete cascade,
  referrer     uuid not null references auth.users on delete cascade,
  linked_at    timestamptz not null default now(),
  base_steps   bigint not null default 0,        -- the save when linked: progress counts from here
  base_caught  bigint not null default 0,
  days         date[] not null default '{}',     -- days a save moved the steps on
  qualified_at timestamptz,
  constraint referrals_not_self check (referee <> referrer)
);
create index if not exists referrals_by_referrer on public.referrals (referrer);
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;

-- The rule's numbers - src/game/referral.js REF_RULE, held equal by tradedb.
create or replace function public.referral_rule(name text)
returns int language sql immutable set search_path = '' as $$
  select case name
    when 'STEPS' then 3000
    when 'CAUGHT' then 25
    when 'DAYS' then 3
    when 'CAP' then 10
    when 'LINK_HOURS' then 72
  end
$$;

-- LINK ME TO WHO INVITED ME. Only a new account (under LINK_HOURS), once, to
-- an OLDER account that is not you, not flagged and not across a block.
-- Progress counts from the save you have now. Sends them a friend request.
-- Answers 'linked', 'already', 'late', 'self' or 'unknown'.
create or replace function public.set_referrer(name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  them uuid;
  mine timestamptz;
  theirs timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.referrals where referee = me) then return 'already'; end if;
  select user_id into them from public.profiles where lower(username) = lower(btrim(coalesce(name, ''))) limit 1;
  if them is null then return 'unknown'; end if;
  if them = me then return 'self'; end if;
  if public.blocked_between(me, them)
     or exists (select 1 from public.profiles where user_id = them and flagged_at is not null) then
    return 'unknown';
  end if;
  select created_at into mine from auth.users where id = me;
  select created_at into theirs from auth.users where id = them;
  if mine < now() - make_interval(hours => public.referral_rule('LINK_HOURS')) or theirs >= mine then
    return 'late';
  end if;
  insert into public.referrals (referee, referrer, base_steps, base_caught)
  select me, them, coalesce(public.save_int(s.data->'steps'), 0), coalesce(public.save_int(s.data->'caught'), 0)
    from (select 1) one left join public.saves s on s.user_id = me
  on conflict (referee) do nothing;
  if not found then return 'already'; end if;
  perform public.befriend(them);
  return 'linked';
end;
$$;

-- PROGRESS, off every stored save of a linked account not yet qualified: a
-- save that moves the steps on marks the day, and the account qualifies on
-- the rule - steps and catches past what it had when linked, DAYS different
-- days, a confirmed email, not flagged. Named to run after saves_check_pace
-- (triggers fire in name order), so a save that flags its account has.
create or replace function public.referral_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  steps bigint := public.save_int(new.data->'steps');
  caught bigint := public.save_int(new.data->'caught');
  was bigint;
begin
  select * into r from public.referrals where referee = new.user_id and qualified_at is null for update;
  if not found then return new; end if;
  was := case when tg_op = 'UPDATE' then public.save_int(old.data->'steps') else r.base_steps end;
  if steps > was and steps > r.base_steps and not (current_date = any(r.days)) then
    r.days := r.days || current_date;
  end if;
  if steps - r.base_steps >= public.referral_rule('STEPS')
     and caught - r.base_caught >= public.referral_rule('CAUGHT')
     and cardinality(r.days) >= public.referral_rule('DAYS')
     and exists (select 1 from auth.users u where u.id = new.user_id and u.email_confirmed_at is not null)
     and not exists (select 1 from public.profiles p where p.user_id = new.user_id and p.flagged_at is not null) then
    r.qualified_at := now();
  end if;
  update public.referrals set days = r.days, qualified_at = r.qualified_at where referee = r.referee;
  return new;
end;
$$;
revoke all on function public.referral_progress() from public, anon, authenticated;
drop trigger if exists saves_referral_progress on public.saves;
create trigger saves_referral_progress after insert or update of data on public.saves
  for each row execute function public.referral_progress();

-- WHAT YOU SEE: who invited you and how far you are, and the friends you
-- invited (the newest 50) with theirs. A friend is `paid` once qualified and
-- among your first CAP, neither of you flagged. Progress is only the three
-- numbers the rule reads.
create or replace function public.my_referrals()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'flagged', exists (select 1 from public.profiles where user_id = auth.uid() and flagged_at is not null),
    'me', (select jsonb_build_object(
             'referrer', p.username,
             'steps', greatest(0, coalesce(public.save_int(s.data->'steps'), 0) - r.base_steps),
             'caught', greatest(0, coalesce(public.save_int(s.data->'caught'), 0) - r.base_caught),
             'days', cardinality(r.days),
             'qualified', r.qualified_at is not null
               and not exists (select 1 from public.profiles f where f.user_id = r.referee and f.flagged_at is not null))
             from public.referrals r
             join public.profiles p on p.user_id = r.referrer
             left join public.saves s on s.user_id = r.referee
            where r.referee = auth.uid()),
    'invited', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.referee, 'username', q.username, 'char', q.char,
               'steps', q.steps, 'caught', q.caught, 'days', q.days, 'qualified', q.ok,
               'paid', q.ok and q.n <= public.referral_rule('CAP')
                 and not exists (select 1 from public.profiles where user_id = auth.uid() and flagged_at is not null))
             order by q.linked_at desc)
        from (select r.referee, r.linked_at, c.username, c.char, cardinality(r.days) as days,
                     greatest(0, coalesce(public.save_int(s.data->'steps'), 0) - r.base_steps) as steps,
                     greatest(0, coalesce(public.save_int(s.data->'caught'), 0) - r.base_caught) as caught,
                     (r.qualified_at is not null and f.flagged_at is null) as ok,
                     row_number() over (partition by (r.qualified_at is not null and f.flagged_at is null)
                                        order by r.qualified_at, r.referee) as n
                from public.referrals r
                join public.trainer_cards c on c.user_id = r.referee
                join public.profiles f on f.user_id = r.referee
                left join public.saves s on s.user_id = r.referee
               where r.referrer = auth.uid()
               order by r.linked_at desc limit 50) q), '[]'))
$$;

revoke all on function public.set_referrer(text) from public, anon;
revoke all on function public.my_referrals() from public, anon;
revoke all on function public.referral_rule(text) from public, anon;
grant execute on function public.set_referrer(text) to authenticated;
grant execute on function public.my_referrals() to authenticated;
grant execute on function public.referral_rule(text) to authenticated;
