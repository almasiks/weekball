import { Timer } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import { TeamHeader } from "@/components/teams/team-header";
import { positionShort } from "@/lib/positions";
import type { TeamView } from "@/lib/games";
import { getT } from "@/lib/i18n/server";

// Read-only lineups for players (published teams).
export async function TeamsList({ teams, userId }: { teams: TeamView[]; userId: string | null }) {
  const tr = await getT();
  return (
    <div className="grid gap-3">
      {teams.map((t) => (
        <section key={t.team.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <TeamHeader
            t={tr}
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
                  {p.playerId === userId && <span className="text-muted-foreground"> {tr("common.you")}</span>}
                  {t.team.captain_id === p.playerId && (
                    <span className="text-muted-foreground">{tr("teams.captainMark")}</span>
                  )}
                </span>
                {p.addedLate && <Timer className="size-4 text-amber-600" aria-label={tr("teams.addedLater")} />}
                {positionShort(tr, p.position) && (
                  <span className="text-xs text-muted-foreground">{positionShort(tr, p.position)}</span>
                )}
              </li>
            ))}
            {t.players.length === 0 && (
              <li className="py-2 text-sm text-muted-foreground">{tr("teams.nobody")}</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
