import type { T } from "@/lib/i18n";
import type { TeamColor } from "@/lib/teams/colors";
import { cn } from "@/lib/utils";

type Props = {
  // Rendered both on the server and inside client screens: the caller passes its translator.
  t: T;
  name: string;
  color: TeamColor;
  count: number;
  strength?: number;
  captainName?: string | null;
  trailing?: React.ReactNode;
  highlight?: boolean;
};

// Coloured bib header. The colour is always paired with the team name (accessibility).
export function TeamHeader({ t, name, color, count, strength, captainName, trailing, highlight }: Props) {
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
          {t("teams.headerPlayers", { count })}
          {strength !== undefined && t("teams.headerStrength", { strength })}
          {captainName && t("teams.headerCaptain", { name: captainName })}
        </span>
      </div>
      {trailing}
    </div>
  );
}
