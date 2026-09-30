import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/player-avatar";
import { positionLabel } from "@/lib/positions";
import type { MemberRole, PlayerPosition } from "@/lib/supabase/database.types";

export type Member = {
  playerId: string;
  name: string;
  role: MemberRole;
  level: number;
  position: PlayerPosition | null;
};

type Props = {
  members: Member[];
  currentUserId: string | null;
  // Renders the per-row action (used by /admin for role changes).
  action?: (member: Member) => React.ReactNode;
  // Renders a second line under the row (used by /members for levels).
  below?: (member: Member) => React.ReactNode;
};

export function MemberList({ members, currentUserId, action, below }: Props) {
  if (members.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Пока никого нет. Отправьте ссылку-приглашение в чат.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {members.map((member) => (
        <li key={member.playerId} className="flex flex-col gap-2 py-2">
          <div className="flex min-h-12 items-center gap-3">
            <PlayerAvatar name={member.name} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">
                {member.name}
                {member.playerId === currentUserId && (
                  <span className="text-muted-foreground"> (вы)</span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {member.role === "organizer" ? (
                  <Badge variant="secondary" className="w-fit gap-1">
                    <Crown className="size-3" aria-hidden />
                    Организатор
                  </Badge>
                ) : (
                  <span>Игрок</span>
                )}
                {member.position && <span>{positionLabel(member.position)}</span>}
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
