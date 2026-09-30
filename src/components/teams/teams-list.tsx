import { Timer } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import { TeamHeader } from "@/components/teams/team-header";
import { positionShort } from "@/lib/positions";
import type { TeamView } from "@/lib/games";

// Read-only lineups for players (published teams).
export function TeamsList({ teams, userId }: { teams: TeamView[]; userId: string | null }) {
  return (
    <div className="grid gap-3">
      {teams.map((t) => (
        <section key={t.team.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <TeamHeader
            name={t.team.name}
            color={t.color}
            count={t.players.length}
            captainName={
              t.team.captain_id ? t.players.find((p) => p.playerId === t.team.captain_id)?.name : null
            }
          />
          <ul className="divide-y px-3">
            {t.players.map((p) => (
              <li key={p.playerId} className="flex min-h-11 items-center gap-2 py-1.5">
                <PlayerAvatar name={p.name} avatarUrl={p.avatarUrl} className="size-7 text-xs" />
                <span className="min-w-0 flex-1 truncate">
                  {p.name}
                  {p.playerId === userId && <span className="text-muted-foreground"> (вы)</span>}
                  {t.team.captain_id === p.playerId && (
                    <span className="text-muted-foreground"> · капитан</span>
                  )}
                </span>
                {p.addedLate && <Timer className="size-4 text-amber-600" aria-label="докинут позже" />}
                {positionShort(p.position) && (
                  <span className="text-xs text-muted-foreground">{positionShort(p.position)}</span>
                )}
              </li>
            ))}
            {t.players.length === 0 && (
              <li className="py-2 text-sm text-muted-foreground">Пока никого</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
