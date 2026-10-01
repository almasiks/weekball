-- Game screen (Dop tep style): per-game stats table, MVP, edit / reset / soft delete.

alter table public.games
  add column title text check (title is null or char_length(btrim(title)) between 1 and 60),
  add column deleted_at timestamptz,
  add column created_by uuid references public.players (id) on delete set null default private.my_player_id(),
  add column match_periods smallint not null default 1 check (match_periods between 1 and 4);

alter table public.events
  add column void_reason text check (void_reason in ('manual', 'reset'));

-- Deleted games disappear for everyone (and therefore from every statistic,
-- because the stats views/functions run with the caller's RLS).
drop policy "games: members read" on public.games;
create policy "games: members read"
  on public.games for select to authenticated
  using (private.is_group_member(group_id) and deleted_at is null);

-- ---------------------------------------------------------------------------
-- Format now includes the number of periods (match_minutes = one period).
-- ---------------------------------------------------------------------------
drop function public.update_game_format(uuid, integer, integer, boolean);

create function public.update_game_format(
  p_game_id uuid,
  p_goal_limit integer,
  p_match_minutes integer,
  p_auto_sounds boolean default null,
  p_periods integer default null
)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  g := private.require_game_scorer(p_game_id);
  if p_goal_limit is not null and p_goal_limit not between 1 and 20 then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;
  if p_match_minutes is null or p_match_minutes not between 1 and 60
     or (p_periods is not null and p_periods not between 1 and 4) then
    raise exception 'invalid_match_settings' using errcode = '22023';
  end if;

  update public.games
  set goal_limit = p_goal_limit,
      match_minutes = p_match_minutes,
      auto_sounds = coalesce(p_auto_sounds, auto_sounds),
      match_periods = coalesce(p_periods, match_periods)
  where id = p_game_id
  returning * into g;

  update public.matches
  set goal_limit = p_goal_limit, periods = g.match_periods, period = 1,
      period_seconds = p_match_minutes * 60
  where game_id = p_game_id and status = 'scheduled';

  return g;
end;
$$;

create or replace function public.create_match(
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
  v_periods := coalesce(p_periods, g.match_periods);
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

-- ---------------------------------------------------------------------------
-- Organizer: edit / MVP / reset / delete
-- ---------------------------------------------------------------------------
create or replace function private.require_game_organizer(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into g from public.games where id = p_game_id and deleted_at is null for update;
  if not found or not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not private.can_score_game(p_game_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  return g;
end;
$$;

revoke all on function private.require_game_organizer(uuid) from public;

create or replace function public.update_game(
  p_game_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_place text
)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  perform private.require_game_organizer(p_game_id);
  if p_starts_at is null or char_length(coalesce(p_place, '')) > 120 then
    raise exception 'invalid_game' using errcode = '22023';
  end if;
  update public.games
  set title = nullif(btrim(coalesce(p_title, '')), ''),
      starts_at = p_starts_at,
      place = btrim(coalesce(p_place, ''))
  where id = p_game_id
  returning * into g;
  return g;
end;
$$;

create or replace function public.set_game_mvp(p_game_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  g := private.require_game_organizer(p_game_id);
  if p_player_id is not null and not exists (
    select 1 from public.group_members where group_id = g.group_id and player_id = p_player_id
  ) then
    raise exception 'player_not_in_group' using errcode = 'P0001';
  end if;
  update public.games set mvp_player_id = p_player_id where id = p_game_id;
end;
$$;

-- Voids every event (reason 'reset'), returns matches to scheduled 0:0, keeps lineups.
create or replace function public.reset_game_results(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_game_organizer(p_game_id);

  update public.events
  set voided_at = now(), void_reason = 'reset'
  where game_id = p_game_id and voided_at is null;

  update public.matches
  set status = 'scheduled', period = 1, timer_status = 'idle', timer_started_at = null,
      timer_elapsed_ms = 0, score_a = 0, score_b = 0, started_at = null, finished_at = null,
      finish_reason = null, finish_event_id = null
  where game_id = p_game_id;

  update public.games
  set status = case when status in ('live', 'finished') then 'closed'::public.game_status else status end,
      mvp_player_id = null,
      stats_processed_at = null
  where id = p_game_id;
end;
$$;

-- Soft delete: hidden everywhere (RLS), nothing is removed physically.
create or replace function public.delete_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_game_organizer(p_game_id);
  update public.games set deleted_at = now(), draft_active = false where id = p_game_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-game player table (events + matches, voided events excluded).
-- security invoker: members only.
-- ---------------------------------------------------------------------------
create or replace function public.game_player_stats(p_game_id uuid)
returns table (
  player_id uuid,
  name text,
  team_id uuid,
  team_name text,
  team_color text,
  matches integer,
  wins integer,
  draws integer,
  losses integer,
  goals integer,
  assists integer,
  own_goals integer,
  yellows integer,
  reds integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id, p.name, t.id, t.name, t.color,
    count(m.id) filter (where m.status = 'finished')::integer,
    count(m.id) filter (where m.status = 'finished' and (
      (m.team_a_id = t.id and m.score_a > m.score_b) or (m.team_b_id = t.id and m.score_b > m.score_a)))::integer,
    count(m.id) filter (where m.status = 'finished' and m.score_a = m.score_b)::integer,
    count(m.id) filter (where m.status = 'finished' and (
      (m.team_a_id = t.id and m.score_a < m.score_b) or (m.team_b_id = t.id and m.score_b < m.score_a)))::integer,
    (select count(*) from public.events e
      where e.game_id = p_game_id and e.voided_at is null and e.type = 'goal' and e.player_id = p.id)::integer,
    (select count(*) from public.events e
      where e.game_id = p_game_id and e.voided_at is null and e.type = 'goal' and e.assist_player_id = p.id)::integer,
    (select count(*) from public.events e
      where e.game_id = p_game_id and e.voided_at is null and e.type = 'own_goal' and e.player_id = p.id)::integer,
    (select count(*) from public.events e
      where e.game_id = p_game_id and e.voided_at is null and e.type = 'yellow' and e.player_id = p.id)::integer,
    (select count(*) from public.events e
      where e.game_id = p_game_id and e.voided_at is null and e.type = 'red' and e.player_id = p.id)::integer
  from public.team_players tp
  join public.players p on p.id = tp.player_id
  join public.teams t on t.id = tp.team_id
  join public.games g on g.id = tp.game_id
  left join public.matches m
    on m.game_id = tp.game_id and t.id in (m.team_a_id, m.team_b_id)
  where tp.game_id = p_game_id
  group by p.id, p.name, t.id, t.name, t.color, t.sort_order
  order by t.sort_order, p.name;
$$;

revoke all on function public.game_player_stats(uuid) from public, anon;
grant execute on function public.game_player_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard: + "Игрок вечера" count
-- ---------------------------------------------------------------------------
drop function public.leaderboard(uuid, timestamptz);

create function public.leaderboard(p_group_id uuid, p_from timestamptz default null)
returns table (
  player_id uuid,
  name text,
  avatar_url text,
  "position" public.player_position,
  rating integer,
  rated_games integer,
  matches integer,
  wins integer,
  draws integer,
  losses integer,
  win_pct integer,
  goals integer,
  own_goals integer,
  assists integer,
  goals_per_match numeric,
  yellows integer,
  reds integer,
  finished_games integer,
  games_played integer,
  attendance_pct integer,
  no_shows integer,
  form text,
  mvp_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with period_games as (
    select g.id, g.starts_at, g.mvp_player_id
    from public.games g
    where g.group_id = p_group_id
      and g.status = 'finished'
      and g.starts_at >= coalesce(p_from, '-infinity'::timestamptz)
  ),
  pms as (
    select s.* from public.player_match_stats s
    where s.group_id = p_group_id and s.game_id in (select id from period_games)
  ),
  totals as (
    select
      pms.player_id,
      count(*)::integer as matches,
      count(*) filter (where result = 'W')::integer as wins,
      count(*) filter (where result = 'D')::integer as draws,
      count(*) filter (where result = 'L')::integer as losses,
      sum(goals)::integer as goals,
      sum(own_goals)::integer as own_goals,
      sum(assists)::integer as assists,
      sum(yellows)::integer as yellows,
      sum(reds)::integer as reds
    from pms group by pms.player_id
  ),
  form as (
    select f.player_id, string_agg(f.result, '' order by f.starts_at, f.sort_order) as form
    from (
      select pms.player_id, pms.result, pms.starts_at, pms.sort_order,
             row_number() over (partition by pms.player_id order by pms.starts_at desc, pms.sort_order desc) as rn
      from pms
    ) f
    where f.rn <= 5
    group by f.player_id
  ),
  attendance as (
    select
      gm.player_id,
      count(distinct pg.id)::integer as finished_games,
      count(distinct pg.id) filter (where exists (
        select 1 from public.team_players tp where tp.game_id = pg.id and tp.player_id = gm.player_id
      ))::integer as games_played,
      count(distinct pg.id) filter (where exists (
        select 1 from public.signups s
        where s.game_id = pg.id and s.player_id = gm.player_id and s.status = 'going'
      ) and not exists (
        select 1 from public.team_players tp where tp.game_id = pg.id and tp.player_id = gm.player_id
      ))::integer as no_shows
    from public.group_members gm
    join period_games pg
      on pg.starts_at >= gm.joined_at - interval '1 day'
      or exists (select 1 from public.team_players tp where tp.game_id = pg.id and tp.player_id = gm.player_id)
      or exists (select 1 from public.signups s where s.game_id = pg.id and s.player_id = gm.player_id)
    where gm.group_id = p_group_id
    group by gm.player_id
  ),
  mvp as (
    select mvp_player_id as player_id, count(*)::integer as mvp_count
    from period_games where mvp_player_id is not null
    group by mvp_player_id
  )
  select
    p.id, p.name, p.avatar_url, p.position, p.rating, p.rated_games,
    coalesce(t.matches, 0), coalesce(t.wins, 0), coalesce(t.draws, 0), coalesce(t.losses, 0),
    case when coalesce(t.matches, 0) = 0 then 0 else round(100.0 * t.wins / t.matches)::integer end,
    coalesce(t.goals, 0), coalesce(t.own_goals, 0), coalesce(t.assists, 0),
    case when coalesce(t.matches, 0) = 0 then 0 else round(t.goals::numeric / t.matches, 2) end,
    coalesce(t.yellows, 0), coalesce(t.reds, 0),
    coalesce(a.finished_games, 0), coalesce(a.games_played, 0),
    case when coalesce(a.finished_games, 0) = 0 then 0
         else round(100.0 * a.games_played / a.finished_games)::integer end,
    coalesce(a.no_shows, 0),
    coalesce(f.form, ''),
    coalesce(v.mvp_count, 0)
  from public.group_members gm
  join public.players p on p.id = gm.player_id
  left join totals t on t.player_id = p.id
  left join form f on f.player_id = p.id
  left join attendance a on a.player_id = p.id
  left join mvp v on v.player_id = p.id
  where gm.group_id = p_group_id;
$$;

revoke all on function public.leaderboard(uuid, timestamptz) from public, anon;
grant execute on function public.leaderboard(uuid, timestamptz) to authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.update_game_format(uuid, integer, integer, boolean, integer)',
    'public.update_game(uuid, text, timestamptz, text)',
    'public.set_game_mvp(uuid, uuid)',
    'public.reset_game_results(uuid)',
    'public.delete_game(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
