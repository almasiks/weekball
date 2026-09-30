-- Kick-off publishes the lineups: spectators must see who scores even if the
-- organizer forgot to press "Опубликовать".
create or replace function public.timer_start(p_match_id uuid, p_client_ts timestamptz default null)
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
  if m.status <> 'scheduled' then
    return m; -- already started
  end if;
  if exists (
    select 1 from public.matches
    where game_id = m.game_id and id <> m.id and status in ('live', 'break')
  ) then
    raise exception 'another_match_live' using errcode = 'P0001';
  end if;

  update public.matches
  set status = 'live', timer_status = 'running', period = 1,
      timer_started_at = ts, timer_elapsed_ms = 0, started_at = ts
  where id = p_match_id
  returning * into m;

  -- First kick-off: the game goes live, signups close, lineups become public.
  update public.games
  set status = 'live',
      draft_active = false,
      teams_published_at = coalesce(teams_published_at, now()),
      teams_updated_at = now()
  where id = m.game_id and status in ('signup', 'closed', 'teams');

  return m;
end;
$$;
