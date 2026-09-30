import { CloudOff, Undo2 } from "lucide-react";
import { eventMinute } from "@/lib/match/timer";
import type { LiveEvent, LiveMatch, LiveTeam } from "@/lib/match/types";
import { teamColor } from "@/lib/teams/colors";
import { cn } from "@/lib/utils";

const ICON: Record<LiveEvent["type"], string> = {
  goal: "⚽",
  own_goal: "⚽",
  yellow: "🟨",
  red: "🟥",
  sub: "🔄",
};

function describe(e: LiveEvent, names: Record<string, string>): string {
  const n = (id: string | null) => (id ? names[id] ?? "?" : "?");
  switch (e.type) {
    case "goal":
      return e.assist_player_id ? `${n(e.player_id)} (пас: ${n(e.assist_player_id)})` : n(e.player_id);
    case "own_goal":
      return `${n(e.player_id)} — автогол`;
    case "yellow":
      return `${n(e.player_id)} — жёлтая`;
    case "red":
      return `${n(e.player_id)} — красная`;
    case "sub":
      return `${n(e.player_in_id)} ↔ ${n(e.player_id)}`;
  }
}

type Props = {
  events: LiveEvent[];
  matches: LiveMatch[];
  teams: LiveTeam[];
  names: Record<string, string>;
  // Organizer console only:
  pendingIds?: Set<string>;
  onVoid?: (event: LiveEvent) => void;
  empty?: string;
};

// Newest first.
export function EventFeed({ events, matches, teams, names, pendingIds, onVoid, empty }: Props) {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const sorted = [...events].sort(
    (a, b) =>
      (matchById.get(b.match_id)?.sort_order ?? 0) - (matchById.get(a.match_id)?.sort_order ?? 0) ||
      b.period - a.period ||
      b.second - a.second,
  );

  if (sorted.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{empty ?? "Событий пока нет."}</p>;
  }

  return (
    <ul className="divide-y">
      {sorted.map((e) => {
        const match = matchById.get(e.match_id);
        const team = teamById.get(e.team_id);
        const color = teamColor(team?.color ?? "#9e9e9e");
        const isGoal = e.type === "goal" || e.type === "own_goal";
        const content = (
          <>
            <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
              {match ? eventMinute(e.period, e.second, match.period_seconds) : ""}
            </span>
            <span aria-hidden className="w-6 text-center text-lg">
              {ICON[e.type]}
            </span>
            <span
              aria-hidden
              className="h-6 w-1 shrink-0 rounded-full border border-foreground/10"
              style={{ backgroundColor: color.hex }}
            />
            <span className={cn("min-w-0 flex-1 truncate text-left", isGoal && "font-semibold")}>
              {describe(e, names)}
              <span className="sr-only"> ({team?.name})</span>
            </span>
            {pendingIds?.has(e.id) && (
              <CloudOff className="size-4 shrink-0 text-amber-600" aria-label="не отправлено" />
            )}
            {onVoid && <Undo2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          </>
        );
        return (
          <li key={e.id}>
            {onVoid ? (
              <button
                type="button"
                onClick={() => onVoid(e)}
                aria-label={`Отменить: ${describe(e, names)}`}
                className="flex min-h-11 w-full items-center gap-2 py-1.5 active:bg-muted"
              >
                {content}
              </button>
            ) : (
              <div className="flex min-h-11 items-center gap-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
