import Link from "next/link";
import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/player-avatar";
import { positionLabel } from "@/lib/positions";
import type { MemberRole, PlayerPosition } from "@/lib/supabase/database.types";
import { getT } from "@/lib/i18n/server";

export type Member = {
  playerId: string;
  name: string;
  role: MemberRole;
  level: number;
  position: PlayerPosition | null;
  hasAccount?: boolean;
};

type Props = {
  members: Member[];
  currentUserId: string | null;
  // Renders the per-row action (used by /admin for role changes).
  action?: (member: Member) => React.ReactNode;
  // Renders a second line under the row (used by /members for levels).
  below?: (member: Member) => React.ReactNode;
};

export async function MemberList<M extends Member>({
  members,
  currentUserId,
  action,
  below,
}: Omit<Props, "members" | "action" | "below"> & {
  members: M[];
  action?: (member: M) => React.ReactNode;
  below?: (member: M) => React.ReactNode;
}) {
  const t = await getT();
  if (members.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.membersEmpty")}</p>
    );
  }

  return (
    <ul className="divide-y">
      {members.map((member) => (
        <li key={member.playerId} className="flex flex-col gap-2 py-2">
          <div className="flex min-h-12 items-center gap-3">
            <PlayerAvatar name={member.name} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Link href={`/players/${member.playerId}`} className="truncate font-medium underline-offset-2 hover:underline">
                {member.name}
                {member.playerId === currentUserId && (
                  <span className="text-muted-foreground"> {t("common.you")}</span>
                )}
              </Link>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {member.role === "organizer" ? (
                  <Badge variant="secondary" className="w-fit gap-1">
                    <Crown className="size-3" aria-hidden />
                    {t("common.organizer")}
                  </Badge>
                ) : (
                  <span>{t("common.player")}</span>
                )}
                {member.position && <span>{positionLabel(t, member.position)}</span>}
              </span>
            </div>
            {action?.(member)}
          </div>
          {below?.(member)}
        </li>
      ))}
    </ul>
  );
}
