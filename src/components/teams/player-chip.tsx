import { Clock, GripVertical, Lock, Timer } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import { positionShort } from "@/lib/positions";
import type { SignupEntry } from "@/lib/games";
import { cn } from "@/lib/utils";

export type ChipPlayer = SignupEntry & { isLocked?: boolean; addedLate?: boolean };

type Props = {
  player: ChipPlayer;
  isCaptain?: boolean;
  showArrival?: boolean;
  // Drag handle (dnd-kit listeners/attributes), rendered only on the organizer board.
  handle?: React.HTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> };
  onTap?: () => void;
  trailing?: React.ReactNode;
  className?: string;
};

export function ArrivalMark({ player }: { player: SignupEntry }) {
  if (player.arrival === "arrived") {
    return <span className="text-xs font-medium text-primary">на месте</span>;
  }
  if (player.arrival === "late") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Clock className="size-3" aria-hidden />
        {player.lateMinutes} мин
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">не отметился</span>;
}

export function PlayerChip({
  player,
  isCaptain,
  showArrival = true,
  handle,
  onTap,
  trailing,
  className,
}: Props) {
  const pos = positionShort(player.position);
  const body = (
    <>
      <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} className="size-8 text-sm" />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="flex items-center gap-1 truncate font-medium">
          <span className="truncate">{player.name}</span>
          {isCaptain && (
            <span className="shrink-0 rounded bg-foreground/10 px-1 text-[10px] font-semibold" title="Капитан">
              К
            </span>
          )}
          {player.isLocked && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="закреплён" />}
          {player.addedLate && <Timer className="size-3.5 shrink-0 text-amber-600" aria-label="докинут" />}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {pos && <span>{pos}</span>}
          <span aria-label={`уровень ${player.level}`}>ур. {player.level}</span>
          {showArrival && <ArrivalMark player={player} />}
        </span>
      </span>
    </>
  );

  return (
    <div className={cn("flex min-h-12 items-center gap-1 rounded-lg bg-card", className)}>
      {handle && (
        <button
          type="button"
          aria-label={`Перетащить ${player.name}`}
          className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
          {...handle}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}
      {onTap ? (
        <button
          type="button"
          onClick={onTap}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 active:bg-muted"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-1 py-1">{body}</div>
      )}
      {trailing}
    </div>
  );
}
