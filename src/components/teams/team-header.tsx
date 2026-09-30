import type { TeamColor } from "@/lib/teams/colors";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  color: TeamColor;
  count: number;
  strength?: number;
  captainName?: string | null;
  trailing?: React.ReactNode;
  highlight?: boolean;
};

// Coloured bib header. The colour is always paired with the team name (accessibility).
export function TeamHeader({ name, color, count, strength, captainName, trailing, highlight }: Props) {
  return (
    <div
      className={cn(
        "flex min-h-14 items-center gap-2 rounded-t-xl px-3 py-2",
        color.ink === "light" ? "text-white" : "text-neutral-900",
        color.hex === "#ffffff" && "border-b",
        highlight && "ring-3 ring-foreground ring-inset",
      )}
      style={{ backgroundColor: color.hex }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{name}</span>
        <span className="truncate text-xs opacity-85">
          {count} игр.
          {strength !== undefined && ` · сила ${strength}`}
          {captainName && ` · капитан ${captainName}`}
        </span>
      </div>
      {trailing}
    </div>
  );
}
