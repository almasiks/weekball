// Snake order, mirrors private.draft_current_team() in SQL: 0,1,2,2,1,0,0,1,2…
export function draftTeamIndex(turn: number, teamCount: number): number {
  if (teamCount <= 0) return 0;
  const round = Math.floor(turn / teamCount);
  const index = turn % teamCount;
  return round % 2 === 0 ? index : teamCount - 1 - index;
}
