-- Phase 5: statistics views, leaderboard, player profile, rating history.
-- All statistics are derived from matches/events (voided events excluded).
-- The only stored aggregates are the rating cache (players.rating / rated_games,
-- rating_history), rebuilt by replaying the whole group history.

alter table public.games add column stats_processed_at timestamptz;
alter table public.players add column rated_games integer not null default 0;

-- ---------------------------------------------------------------------------
-- Rating history (rewritten atomically per group by apply_rating_history)
-- ---------------------------------------------------------------------------
create table public.rating_history (
  group_id uuid not null references public.groups (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  rating_before integer not null,
  rating_after integer not null,
  delta integer not null,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index rating_history_player_idx on public.rating_history (player_id);
create index rating_history_group_idx on public.rating_history (group_id);

revoke all on public.rating_history from anon;
revoke insert, update, delete, truncate on public.rating_history from authenticated;
grant select on public.rating_history to authenticated;
alter table public.rating_history enable row level security;

create policy "rating_history: members read"
  on public.rating_history for select to authenticated
  using (private.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- Views (security_invoker: the caller's RLS applies — members only)
-- ---------------------------------------------------------------------------

-- One row per player per finished match they were in a team for.
create view public.player_match_stats with (security_invoker = true) as
select
  m.id as match_id,
  m.game_id,
  g.group_id,
  g.starts_at,
  m.sort_order,
  tp.player_id,
  tp.team_id,
  s.opponent_id,
  s.goals_for,
  s.goals_against,
  case
    when s.goals_for > s.goals_against then 'W'
    when s.goals_for = s.goals_against then 'D'
    else 'L'
  end as result,
  coalesce(e.goals, 0) as goals,
  coalesce(e.own_goals, 0) as own_goals,
  coalesce(e.assists, 0) as assists,
  coalesce(e.yellows, 0) as yellows,
  coalesce(e.reds, 0) as reds
from public.matches m
join public.games g on g.id = m.game_id
join public.team_players tp on tp.team_id in (m.team_a_id, m.team_b_id)
cross join lateral (
  select
    case when tp.team_id = m.team_a_id then m.team_b_id else m.team_a_id end as opponent_id,
    case when tp.team_id = m.team_a_id then m.score_a else m.score_b end::integer as goals_for,
    case when tp.team_id = m.team_a_id then m.score_b else m.score_a end::integer as goals_against
) s
left join lateral (
  select
    count(*) filter (where ev.type = 'goal' and ev.player_id = tp.player_id)::integer as goals,
    count(*) filter (where ev.type = 'own_goal' and ev.player_id = tp.player_id)::integer as own_goals,
    count(*) filter (where ev.type = 'goal' and ev.assist_player_id = tp.player_id)::integer as assists,
    count(*) filter (where ev.type = 'yellow' and ev.player_id = tp.player_id)::integer as yellows,
    count(*) filter (where ev.type = 'red' and ev.player_id = tp.player_id)::integer as reds
  from public.events ev
  where ev.match_id = m.id and ev.voided_at is null
) e on true
where m.status = 'finished';

-- Attendance per member: finished games since joining (or played), games played, no-shows.
create view public.player_attendance with (security_invoker = true) as
select
  gm.group_id,
  gm.player_id,
  count(distinct g.id)::integer as finished_games,
  count(distinct g.id) filter (where played.player_id is not null)::integer as games_played,
  count(distinct g.id) filter (where s.status = 'going' and played.player_id is null)::integer as no_shows
from public.group_members gm
join public.games g on g.group_id = gm.group_id and g.status = 'finished'
left join lateral (
  select tp.player_id from public.team_players tp
  where tp.game_id = g.id and tp.player_id = gm.player_id
  limit 1
) played on true
left join public.signups s on s.game_id = g.id and s.player_id = gm.player_id
where g.starts_at >= gm.joined_at - interval '1 day'
   or played.player_id is not null
   or s.player_id is not null
group by gm.group_id, gm.player_id;

-- ---------------------------------------------------------------------------
-- Leaderboard: every member with totals for the period (from p_from, inclusive).
-- security invoker: RLS decides what the caller can see.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard(p_group_id uuid, p_from timestamptz default null)
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
  form text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with period_games as (
    select g.id, g.starts_at
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
    coalesce(f.form, '')
  from public.group_members gm
  join public.players p on p.id = gm.player_id
  left join totals t on t.player_id = p.id
  left join form f on f.player_id = p.id
  left join attendance a on a.player_id = p.id
  where gm.group_id = p_group_id;
$$;

-- Everything the profile page needs, as JSON (security invoker: members only).
create or replace function public.player_profile(p_group_id uuid, p_player_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when not exists (
    select 1 from public.group_members where group_id = p_group_id and player_id = p_player_id
  ) then null else jsonb_build_object(
    'player', (
      select to_jsonb(x) from (
        select id, name, avatar_url, position, level, rating, rated_games
        from public.players where id = p_player_id
      ) x
    ),
    'totals', (select to_jsonb(l) from public.leaderboard(p_group_id) l where l.player_id = p_player_id),
    'rating_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_id', h.game_id, 'starts_at', g.starts_at,
        'rating_before', h.rating_before, 'rating_after', h.rating_after, 'delta', h.delta
      ) order by g.starts_at)
      from public.rating_history h join public.games g on g.id = h.game_id
      where h.player_id = p_player_id and h.group_id = p_group_id
    ), '[]'::jsonb),
    'recent_matches', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.starts_at desc, r.sort_order desc)
      from (
        select s.match_id, s.game_id, s.starts_at, s.sort_order, s.result,
               s.goals_for, s.goals_against, s.goals, s.assists,
               t.name as team_name, t.color as team_color,
               o.name as opponent_name, o.color as opponent_color
        from public.player_match_stats s
        join public.teams t on t.id = s.team_id
        join public.teams o on o.id = s.opponent_id
        where s.player_id = p_player_id and s.group_id = p_group_id
        order by s.starts_at desc, s.sort_order desc
        limit 10
      ) r
    ), '[]'::jsonb)
  ) end;
$$;

-- Top scorers of one game (ties included).
create or replace function public.game_top_scorers(p_game_id uuid)
returns table (player_id uuid, name text, goals integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with scored as (
    select e.player_id, count(*)::integer as goals
    from public.events e
    join public.matches m on m.id = e.match_id and m.status = 'finished'
    where e.game_id = p_game_id and e.type = 'goal' and e.voided_at is null
    group by e.player_id
  )
  select s.player_id, p.name, s.goals
  from scored s join public.players p on p.id = s.player_id
  where s.goals = (select max(goals) from scored)
  order by p.name;
$$;

-- Finished games of a group, newest first, with match results and top scorers.
create or replace function public.game_history(p_group_id uuid, p_limit integer default 50)
returns table (
  game_id uuid,
  starts_at timestamptz,
  timezone text,
  place text,
  matches jsonb,
  top_scorers jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    g.id, g.starts_at, g.timezone, g.place,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_a', ta.name, 'color_a', ta.color, 'score_a', m.score_a,
        'team_b', tb.name, 'color_b', tb.color, 'score_b', m.score_b
      ) order by m.sort_order)
      from public.matches m
      join public.teams ta on ta.id = m.team_a_id
      join public.teams tb on tb.id = m.team_b_id
      where m.game_id = g.id and m.status = 'finished'
    ), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(ts)) from public.game_top_scorers(g.id) ts), '[]'::jsonb)
  from public.games g
  where g.group_id = p_group_id and g.status = 'finished'
  order by g.starts_at desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Rating write-back (computed in TypeScript, src/lib/rating/elo.ts)
-- payload: {
--   history: [{player_id, game_id, rating_before, rating_after, delta}],
--   players: [{player_id, rating, rated_games}],
--   processed_game_ids: [uuid]
-- }
-- ---------------------------------------------------------------------------
create or replace function public.apply_rating_history(p_group_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not private.is_group_organizer(p_group_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(coalesce(payload -> 'history', '[]')) as h(game_id uuid)
    where not exists (
      select 1 from public.games g
      where g.id = h.game_id and g.group_id = p_group_id and g.status = 'finished'
    )
  ) then
    raise exception 'invalid_rating_payload' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(payload -> 'players', '[]')) as p(player_id uuid)
    where not exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group_id and gm.player_id = p.player_id
    )
  ) then
    raise exception 'invalid_rating_payload' using errcode = '22023';
  end if;

  delete from public.rating_history where group_id = p_group_id;

  insert into public.rating_history (group_id, game_id, player_id, rating_before, rating_after, delta)
  select p_group_id, h.game_id, h.player_id, h.rating_before, h.rating_after, h.delta
  from jsonb_to_recordset(coalesce(payload -> 'history', '[]'))
    as h(player_id uuid, game_id uuid, rating_before integer, rating_after integer, delta integer);

  -- Members without rated games go back to the start.
  update public.players p
  set rating = coalesce(x.rating, 1000),
      rated_games = coalesce(x.rated_games, 0)
  from public.group_members gm
  left join jsonb_to_recordset(coalesce(payload -> 'players', '[]'))
    as x(player_id uuid, rating integer, rated_games integer)
    on x.player_id = gm.player_id
  where gm.group_id = p_group_id and p.id = gm.player_id;

  update public.games
  set stats_processed_at = now()
  where group_id = p_group_id
    and status = 'finished'
    and id in (
      select value::uuid from jsonb_array_elements_text(coalesce(payload -> 'processed_game_ids', '[]'))
    );
end;
$$;

revoke all on function public.apply_rating_history(uuid, jsonb) from public, anon;
grant execute on function public.apply_rating_history(uuid, jsonb) to authenticated, service_role;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.leaderboard(uuid, timestamptz)',
    'public.player_profile(uuid, uuid)',
    'public.game_top_scorers(uuid)',
    'public.game_history(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

revoke all on public.player_match_stats, public.player_attendance from anon;
grant select on public.player_match_stats, public.player_attendance to authenticated;

-- ---------------------------------------------------------------------------
-- Corrections after the game: the organizer may void an event in a finished
-- game; the game is then marked for a statistics recalculation.
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
  elsif g.status = 'finished' then
    update public.games set stats_processed_at = null where id = g.id;
  end if;
  return e;
end;
$$;
