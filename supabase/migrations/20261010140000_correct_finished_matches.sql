-- Corrections after the whistle: the organizer can ADD an event (a forgotten goal,
-- assist or card) to a match that is already finished, also in a finished game.
-- Removing was possible before (void_event). The score is recomputed by the trigger
-- as always; for a finished game the statistics are marked for recalculation.
-- A correction must say so ("correction": true in the payload): a goal that merely
-- arrives late from the offline queue after the match ended is still refused, as before.

create or replace function public.add_event(payload jsonb)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  m public.matches;
  g public.games;
  v_id uuid := (payload ->> 'id')::uuid;
  v_type public.event_type := (payload ->> 'type')::public.event_type;
  v_team uuid := (payload ->> 'team_id')::uuid;
  v_player uuid := (payload ->> 'player_id')::uuid;
  v_assist uuid := nullif(payload ->> 'assist_player_id', '')::uuid;
  v_in uuid := nullif(payload ->> 'player_in_id', '')::uuid;
  v_period integer := (payload ->> 'period')::integer;
  v_second integer := (payload ->> 'second')::integer;
  v_correction boolean := coalesce((payload ->> 'correction')::boolean, false);
begin
  if v_id is null then
    raise exception 'invalid_event' using errcode = '22023';
  end if;

  select * into e from public.events where id = v_id;
  if found then
    return e;
  end if;

  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into m from public.matches where id = (payload ->> 'match_id')::uuid;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  -- Same rights as void_event: the scorer of the game, also after it has finished.
  select * into g from public.games where id = m.game_id and deleted_at is null for update;
  if not found or not private.is_group_member(g.group_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not private.can_score_game(g.id) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if g.status = 'cancelled' then
    raise exception 'game_not_active' using errcode = 'P0001';
  end if;
  select * into m from public.matches where id = m.id for update;

  -- Running match: live recording. Finished match: only an explicit correction.
  -- Not started: nothing to record.
  if not (m.status in ('live', 'break') or (m.status = 'finished' and v_correction)) then
    raise exception 'match_not_live' using errcode = 'P0001';
  end if;
  -- While the game goes on, substitutions belong to the running match only.
  if m.status = 'finished' and v_type = 'sub' then
    raise exception 'invalid_event' using errcode = '22023';
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
    v_period, v_second, private.my_player_id()
  )
  on conflict (id) do nothing
  returning * into e;

  if e.id is null then
    select * into e from public.events where id = v_id;
    return e;
  end if;

  if m.status = 'finished' then
    -- A correction never reopens or re-finishes the match; it only changes the numbers.
    if g.status = 'finished' then
      update public.games set stats_processed_at = null where id = g.id;
    end if;
  elsif v_type in ('goal', 'own_goal') then
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

revoke all on function public.add_event(jsonb) from public, anon;
grant execute on function public.add_event(jsonb) to authenticated;
