-- Match format: goal limit (nullable = no limit) + match length.
-- A match ends when a team reaches the goal limit OR the time runs out.

alter table public.schedules
  add column goal_limit integer default 2 check (goal_limit is null or goal_limit between 1 and 20),
  add column match_minutes integer not null default 7 check (match_minutes between 1 and 60);

alter table public.games
  add column goal_limit integer default 2 check (goal_limit is null or goal_limit between 1 and 20),
  add column match_minutes integer not null default 7 check (match_minutes between 1 and 60);

alter table public.matches
  add column goal_limit integer check (goal_limit is null or goal_limit between 1 and 20),
  add column finish_reason text check (finish_reason in ('manual', 'goal_limit', 'time')),
  -- The goal that ended the match by the limit: voiding it reopens the match.
  add column finish_event_id uuid;

grant insert (goal_limit, match_minutes) on public.schedules to authenticated;
grant update (goal_limit, match_minutes) on public.schedules to authenticated;
grant insert (goal_limit, match_minutes) on public.games to authenticated;

-- ---------------------------------------------------------------------------
-- Schedules copy their format into every generated game
-- ---------------------------------------------------------------------------
create or replace function private.ensure_schedule_games(p_schedule_id uuid, p_days integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.schedules;
  local_today date;
  d date;
  game_start timestamptz;
  inserted integer;
  total integer := 0;
begin
  select * into s from public.schedules where id = p_schedule_id;
  if not found or not s.is_active then
    return 0;
  end if;

  local_today := (now() at time zone s.timezone)::date;

  for i in 0..p_days loop
    d := local_today + i;
    continue when extract(dow from d)::smallint <> s.weekday;

    game_start := (d + s.start_time) at time zone s.timezone;
    continue when game_start <= now() or game_start > now() + make_interval(days => p_days);

    insert into public.games (
      group_id, schedule_id, starts_at, place, max_players, timezone, goal_limit, match_minutes
    )
    values (
      s.group_id, s.id, game_start, s.place, s.max_players, s.timezone, s.goal_limit, s.match_minutes
    )
    on conflict (schedule_id, starts_at) do nothing;

    get diagnostics inserted = row_count;
    total := total + inserted;
  end loop;

  return total;
end;
$$;

create or replace function private.on_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (old.weekday, old.start_time, old.timezone, old.is_active, old.place, old.max_players,
          old.goal_limit, old.match_minutes)
         is distinct from
         (new.weekday, new.start_time, new.timezone, new.is_active, new.place, new.max_players,
          new.goal_limit, new.match_minutes) then
    delete from public.games g
    where g.schedule_id = new.id
      and g.status = 'signup'
      and g.starts_at > now()
      and not exists (
        select 1 from public.signups x
        where x.game_id = g.id and x.status in ('going', 'waitlist')
      );
  end if;

  perform private.ensure_schedule_games(new.id, 14);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-game format (organizer). Not-yet-started matches follow the new format.
-- ---------------------------------------------------------------------------
create or replace function public.update_game_format(
  p_game_id uuid,
  p_goal_limit integer,
  p_match_minutes integer
)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  perform private.require_game_scorer(p_game_id);
  if p_goal_limit is not null and p_goal_limit not between 1 and 20 then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;
  if p_match_minutes is null or p_match_minutes not between 1 and 60 then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;

  update public.games
  set goal_limit = p_goal_limit, match_minutes = p_match_minutes
  where id = p_game_id
  returning * into g;

  update public.matches
  set goal_limit = p_goal_limit, periods = 1, period = 1, period_seconds = p_match_minutes * 60
  where game_id = p_game_id and status = 'scheduled';

  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- Matches take the game format by default (one period of match_minutes).
-- ---------------------------------------------------------------------------
drop function public.generate_round_robin(uuid, integer, integer);
drop function public.create_match(uuid, uuid, uuid, integer, integer);

create function public.create_match(
  p_game_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_periods integer default null,
  p_period_seconds integer default null
)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
  m public.matches;
  v_periods integer;
  v_seconds integer;
begin
  g := private.require_game_scorer(p_game_id);
  v_periods := coalesce(p_periods, 1);
  v_seconds := coalesce(p_period_seconds, g.match_minutes * 60);

  if p_team_a_id = p_team_b_id
     or (select count(*) from public.teams
         where game_id = p_game_id and id in (p_team_a_id, p_team_b_id)) <> 2 then
    raise exception 'invalid_match_teams' using errcode = '22023';
  end if;
  if v_periods not between 1 and 4 or v_seconds not between 60 and 3600 then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;

  insert into public.matches (game_id, team_a_id, team_b_id, periods, period_seconds, goal_limit, sort_order)
  values (
    p_game_id, p_team_a_id, p_team_b_id, v_periods, v_seconds, g.goal_limit,
    coalesce((select max(sort_order) + 1 from public.matches where game_id = p_game_id), 0)
  )
  returning * into m;
  return m;
end;
$$;

create function public.generate_round_robin(
  p_game_id uuid,
  p_periods integer default null,
  p_period_seconds integer default null
)
returns setof public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  pair record;
begin
  perform private.require_game_scorer(p_game_id);

  for pair in
    with ordered as (
      select id, row_number() over (order by sort_order, created_at) as n
      from public.teams where game_id = p_game_id
    )
    select a.id as a_id, b.id as b_id
    from ordered a join ordered b on a.n < b.n
    order by a.n, b.n
  loop
    continue when exists (
      select 1 from public.matches
      where game_id = p_game_id
        and ((team_a_id = pair.a_id and team_b_id = pair.b_id)
          or (team_a_id = pair.b_id and team_b_id = pair.a_id))
    );
    return next public.create_match(p_game_id, pair.a_id, pair.b_id, p_periods, p_period_seconds);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_match remembers why the match ended ('manual' | 'time').
-- ---------------------------------------------------------------------------
drop function public.finish_match(uuid, timestamptz);

create function public.finish_match(
  p_match_id uuid,
  p_client_ts timestamptz default null,
  p_reason text default 'manual'
)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  ts timestamptz := private.effective_ts(p_client_ts);
begin
  m := private.require_match_scorer(p_match_id);
  if m.status = 'finished' then
    return m;
  end if;
  if m.status = 'scheduled' then
    raise exception 'match_not_started' using errcode = 'P0001';
  end if;
  if p_reason not in ('manual', 'time') then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;
  update public.matches
  set status = 'finished',
      timer_status = 'finished',
      timer_elapsed_ms = timer_elapsed_ms + case
        when timer_status = 'running'
          then greatest(0, floor(extract(epoch from (ts - timer_started_at)) * 1000))::bigint
        else 0 end,
      timer_started_at = null,
      finished_at = ts,
      finish_reason = p_reason,
      finish_event_id = null
  where id = p_match_id
  returning * into m;
  return m;
end;
$$;

create or replace function public.reopen_match(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  m := private.require_match_scorer(p_match_id);
  if m.status <> 'finished' then
    return m;
  end if;
  if exists (
    select 1 from public.matches
    where game_id = m.game_id and id <> m.id and status in ('live', 'break')
  ) then
    raise exception 'another_match_live' using errcode = 'P0001';
  end if;
  update public.matches
  set status = 'live', timer_status = 'paused', finished_at = null,
      finish_reason = null, finish_event_id = null
  where id = p_match_id
  returning * into m;
  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_event: a goal that reaches the limit finishes the match.
-- ---------------------------------------------------------------------------
create or replace function public.add_event(payload jsonb)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  m public.matches;
  v_id uuid := (payload ->> 'id')::uuid;
  v_type public.event_type := (payload ->> 'type')::public.event_type;
  v_team uuid := (payload ->> 'team_id')::uuid;
  v_player uuid := (payload ->> 'player_id')::uuid;
  v_assist uuid := nullif(payload ->> 'assist_player_id', '')::uuid;
  v_in uuid := nullif(payload ->> 'player_in_id', '')::uuid;
  v_period integer := (payload ->> 'period')::integer;
  v_second integer := (payload ->> 'second')::integer;
begin
  if v_id is null then
    raise exception 'invalid_event' using errcode = '22023';
  end if;

  -- Idempotency: a retried event is simply returned.
  select * into e from public.events where id = v_id;
  if found then
    return e;
  end if;

  m := private.require_match_scorer((payload ->> 'match_id')::uuid);

  if m.status not in ('live', 'break') then
    raise exception 'match_not_live' using errcode = 'P0001';
  end if;
  if v_team is null or v_team not in (m.team_a_id, m.team_b_id) then
    raise exception 'invalid_event_team' using errcode = '22023';
  end if;
  if v_player is null or not private.in_team(v_team, v_player) then
    raise exception 'player_not_in_team' using errcode = '22023';
  end if;
  if v_assist is not null and (v_type <> 'goal' or v_assist = v_player or not private.in_team(v_team, v_assist)) then
    raise exception 'invalid_assist' using errcode = '22023';
  end if;
  if (v_type = 'sub') <> (v_in is not null)
     or (v_in is not null and (v_in = v_player or not private.in_team(v_team, v_in))) then
    raise exception 'invalid_sub' using errcode = '22023';
  end if;
  if v_period is null or v_period not between 1 and m.periods or v_second is null or v_second < 0 then
    raise exception 'invalid_event_time' using errcode = '22023';
  end if;

  insert into public.events (
    id, match_id, game_id, type, team_id, player_id, assist_player_id, player_in_id,
    period, second, created_by
  )
  values (
    v_id, m.id, m.game_id, v_type, v_team, v_player, v_assist, v_in,
    v_period, v_second, auth.uid()
  )
  on conflict (id) do nothing
  returning * into e;

  if e.id is null then
    select * into e from public.events where id = v_id;
    return e;
  end if;

  -- Goal limit reached (the score trigger has already run): the match ends at
  -- the minute of this goal, even if the event arrives late from the offline queue.
  if v_type in ('goal', 'own_goal') then
    select * into m from public.matches where id = m.id;
    if m.goal_limit is not null
       and m.status in ('live', 'break')
       and greatest(m.score_a, m.score_b) >= m.goal_limit then
      update public.matches
      set status = 'finished',
          timer_status = 'finished',
          timer_elapsed_ms = v_second::bigint * 1000,
          timer_started_at = null,
          finished_at = now(),
          finish_reason = 'goal_limit',
          finish_event_id = v_id
      where id = m.id;
    end if;
  end if;

  return e;
end;
$$;

-- ---------------------------------------------------------------------------
-- void_event: voiding the goal that ended the match reopens it (clock running
-- from the minute of that goal), as long as the game itself is still going.
-- ---------------------------------------------------------------------------
create or replace function public.void_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  g public.games;
  m public.matches;
begin
  select * into e from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into g from public.games where id = e.game_id for update;
  if not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not private.can_score_game(g.id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if g.status = 'cancelled' then
    raise exception 'game_not_active' using errcode = 'P0001';
  end if;

  update public.events set voided_at = now()
  where id = p_event_id and voided_at is null
  returning * into e;

  if e.id is null then
    select * into e from public.events where id = p_event_id;
    return e;
  end if;

  if g.status = 'finished' then
    update public.games set stats_processed_at = null where id = g.id;
  else
    select * into m from public.matches where id = e.match_id for update;
    if m.status = 'finished'
       and m.finish_event_id = e.id
       and not exists (
         select 1 from public.matches
         where game_id = m.game_id and id <> m.id and status in ('live', 'break')
       ) then
      update public.matches
      set status = 'live',
          timer_status = 'running',
          timer_started_at = now(),
          finished_at = null,
          finish_reason = null,
          finish_event_id = null
      where id = m.id;
    end if;
  end if;
  return e;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for (re)created functions
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.update_game_format(uuid, integer, integer)',
    'public.create_match(uuid, uuid, uuid, integer, integer)',
    'public.generate_round_robin(uuid, integer, integer)',
    'public.finish_match(uuid, timestamptz, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
