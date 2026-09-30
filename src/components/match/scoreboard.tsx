"use client";

import { useNow } from "@/lib/match/hooks";
import { computeElapsed, displayClock } from "@/lib/match/timer";
import type { LiveMatch, LiveTeam } from "@/lib/match/types";
import { teamColor } from "@/lib/teams/colors";
import { cn } from "@/lib/utils";

export function statusLabel(match: Pick<LiveMatch, "status" | "period" | "periods" | "timer_status">): string {
  if (match.status === "scheduled") return "Не начался";
  if (match.status === "finished") return "Матч завершён";
  if (match.status === "break") return "Перерыв";
  const period = match.periods > 1 ? `${match.period}-й тайм` : "Идёт";
  return match.timer_status === "paused" ? `${period} · пауза` : period;
}

export function MatchClock({
  match,
  offset,
  className,
  addedClassName,
}: {
  match: LiveMatch;
  offset: number;
  className?: string;
  addedClassName?: string;
}) {
  const now = useNow(250);
  if (match.status === "scheduled") return <span className={className}>00:00</span>;
  const clock = displayClock(computeElapsed(match, now, offset));
  return (
    <span className={cn("tabular-nums", className)}>
      {clock.main}
      {clock.added && match.status !== "finished" && (
        <span className={cn("ml-1 text-destructive", addedClassName)}>{clock.added}</span>
      )}
    </span>
  );
}

function TeamSide({ team, score, big }: { team?: LiveTeam; score: number; big?: boolean }) {
  const color = teamColor(team?.color ?? "#9e9e9e");
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span className="flex max-w-full items-center gap-1.5">
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border border-foreground/20"
          style={{ backgroundColor: color.hex }}
        />
        <span className={cn("truncate font-semibold", big ? "text-lg" : "text-sm")}>
          {team?.name ?? "?"}
        </span>
      </span>
      <span className={cn("font-bold tabular-nums leading-none", big ? "text-7xl" : "text-4xl")}>
        {score}
      </span>
    </div>
  );
}

// Score + clock. Always pass scores explicitly (the console shows optimistic ones).
export function Scoreboard({
  match,
  teams,
  scoreA,
  scoreB,
  offset,
  big,
  note,
}: {
  match: LiveMatch;
  teams: LiveTeam[];
  scoreA: number;
  scoreB: number;
  offset: number;
  big?: boolean;
  // Shown under the status, e.g. the match format "до 2 голов · 7 мин".
  note?: string;
}) {
  const teamA = teams.find((t) => t.id === match.team_a_id);
  const teamB = teams.find((t) => t.id === match.team_b_id);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex w-full items-start gap-2">
        <TeamSide team={teamA} score={scoreA} big={big} />
        <span className={cn("self-center font-bold text-muted-foreground", big ? "text-4xl" : "text-2xl")}>:</span>
        <TeamSide team={teamB} score={scoreB} big={big} />
      </div>
      <MatchClock
        match={match}
        offset={offset}
        className={cn("font-bold", big ? "text-6xl" : "text-xl")}
        addedClassName={big ? "text-3xl" : "text-sm"}
      />
      <span className={cn("text-muted-foreground", big ? "text-base font-medium" : "text-xs")}>
        {statusLabel(match)}
      </span>
      {note && <span className="text-sm text-muted-foreground">{note}</span>}
    </div>
  );
}
