-- The organizer can set a player's totals by hand in "Статистика".
-- Matches and events stay the source of truth; a hand-set total is stored as a
-- correction (difference to what the matches give), so later matches add on top.
-- Corrections apply to the all-time table only, never to "last 10 games".

create table public.stat_adjustments (
  group_id uuid not null references public.groups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  yellows integer not null default 0,
  reds integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.players (id) on delete set null,
  primary key (group_id, player_id)
);

alter table public.stat_adjustments enable row level security;

-- Read by members (the leaderboard runs with the caller's rights); written only by the RPCs below.
revoke all on public.stat_adjustments from anon, authenticated;
grant select on public.stat_adjustments to authenticated;

create policy "stat_adjustments: members read"
  on public.stat_adjustments for select to authenticated
  using (private.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- Set the totals of a player (all time). Values are the numbers to SHOW.
-- ---------------------------------------------------------------------------
create or replace function public.set_player_stats(
  p_group_id uuid,
  p_player_id uuid,
  p_wins integer,
  p_draws integer,
  p_losses integer,
  p_goals integer,
  p_assists integer,
  p_yellows integer,
  p_reds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_group_organizer(p_group_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.group_members where group_id = p_group_id and player_id = p_player_id
  ) then
    raise exception 'player_not_in_group' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(array[p_wins, p_draws, p_losses, p_goals, p_assists, p_yellows, p_reds]) v
    where v is null or v < 0 or v > 9999
  ) then
    raise exception 'invalid_stats' using errcode = '22023';
  end if;

  -- What the matches give on their own.
  select
    count(*) filter (where s.result = 'W')::integer as wins,
    count(*) filter (where s.result = 'D')::integer as draws,
    count(*) filter (where s.result = 'L')::integer as losses,
    coalesce(sum(s.goals), 0)::integer as goals,
    coalesce(sum(s.assists), 0)::integer as assists,
    coalesce(sum(s.yellows), 0)::integer as yellows,
    coalesce(sum(s.reds), 0)::integer as reds
  into raw
  from public.player_match_stats s
  join public.games g on g.id = s.game_id and g.status = 'finished' and g.deleted_at is null
  where s.group_id = p_group_id and s.player_id = p_player_id;

  if (p_wins, p_draws, p_losses, p_goals, p_assists, p_yellows, p_reds)
     = (raw.wins, raw.draws, raw.losses, raw.goals, raw.assists, raw.yellows, raw.reds) then
    -- Same as the matches: nothing to correct.
    delete from public.stat_adjustments where group_id = p_group_id and player_id = p_player_id;
    return;
  end if;

  insert into public.stat_adjustments as a
    (group_id, player_id, wins, draws, losses, goals, assists, yellows, reds, updated_at, updated_by)
  values (
    p_group_id, p_player_id,
    p_wins - raw.wins, p_draws - raw.draws, p_losses - raw.losses,
    p_goals - raw.goals, p_assists - raw.assists, p_yellows - raw.yellows, p_reds - raw.reds,
    now(), private.my_player_id()
  )
  on conflict (group_id, player_id) do update
  set wins = excluded.wins, draws = excluded.draws, losses = excluded.losses,
      goals = excluded.goals, assists = excluded.assists,
      yellows = excluded.yellows, reds = excluded.reds,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

-- Back to what the matches give.
create or replace function public.reset_player_stats(p_group_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_group_organizer(p_group_id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  delete from public.stat_adjustments where group_id = p_group_id and player_id = p_player_id;
end;
$$;

revoke all on function public.set_player_stats(uuid, uuid, integer, integer, integer, integer, integer, integer, integer) from public, anon;
revoke all on function public.reset_player_stats(uuid, uuid) from public, anon;
grant execute on function public.set_player_stats(uuid, uuid, integer, integer, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.reset_player_stats(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard: + corrections (all time only) and the "adjusted" mark
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
  mvp_count integer,
  adjusted boolean
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
  -- Hand-set totals: matches + correction, never below zero. All time only.
  shown as (
    select
      gm.player_id,
      greatest(0, coalesce(t.wins, 0) + coalesce(a.wins, 0)) as wins,
      greatest(0, coalesce(t.draws, 0) + coalesce(a.draws, 0)) as draws,
      greatest(0, coalesce(t.losses, 0) + coalesce(a.losses, 0)) as losses,
      greatest(0, coalesce(t.goals, 0) + coalesce(a.goals, 0)) as goals,
      coalesce(t.own_goals, 0) as own_goals,
      greatest(0, coalesce(t.assists, 0) + coalesce(a.assists, 0)) as assists,
      greatest(0, coalesce(t.yellows, 0) + coalesce(a.yellows, 0)) as yellows,
      greatest(0, coalesce(t.reds, 0) + coalesce(a.reds, 0)) as reds,
      a.player_id is not null as adjusted
    from public.group_members gm
    left join totals t on t.player_id = gm.player_id
    left join public.stat_adjustments a
      on a.group_id = gm.group_id and a.player_id = gm.player_id and p_from is null
    where gm.group_id = p_group_id
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
    (s.wins + s.draws + s.losses)::integer, s.wins::integer, s.draws::integer, s.losses::integer,
    case when s.wins + s.draws + s.losses = 0 then 0
         else round(100.0 * s.wins / (s.wins + s.draws + s.losses))::integer end,
    s.goals::integer, s.own_goals::integer, s.assists::integer,
    case when s.wins + s.draws + s.losses = 0 then 0
         else round(s.goals::numeric / (s.wins + s.draws + s.losses), 2) end,
    s.yellows::integer, s.reds::integer,
    coalesce(a.finished_games, 0), coalesce(a.games_played, 0),
    case when coalesce(a.finished_games, 0) = 0 then 0
         else round(100.0 * a.games_played / a.finished_games)::integer end,
    coalesce(a.no_shows, 0),
    coalesce(f.form, ''),
    coalesce(v.mvp_count, 0),
    s.adjusted
  from shown s
  join public.players p on p.id = s.player_id
  left join form f on f.player_id = p.id
  left join attendance a on a.player_id = p.id
  left join mvp v on v.player_id = p.id;
$$;

revoke all on function public.leaderboard(uuid, timestamptz) from public, anon;
grant execute on function public.leaderboard(uuid, timestamptz) to authenticated;
