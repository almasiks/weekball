import type { LiveEvent, LiveMatch, LiveTeam, StandingRow } from "./types";

// Shape returned by public.get_live_game(token): names only, no other player data.
export type PublicLiveGame = {
  server_now: string;
  game: {
    id: string;
    starts_at: string;
    place: string;
    timezone: string;
    status: string;
    group_name: string;
  };
  teams: LiveTeam[];
  matches: LiveMatch[];
  events: LiveEvent[];
  standings: StandingRow[];
};

export const LIVE_TOKEN = /^[0-9a-f]{64}$/;

export function namesFromTeams(teams: LiveTeam[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const t of teams) for (const p of t.players) names[p.id] = p.name;
  return names;
}
