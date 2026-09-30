import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MemberRole } from "@/lib/supabase/database.types";

export type Member = {
  playerId: string;
  name: string;
  role: MemberRole;
};

type Props = {
  members: Member[];
  currentUserId: string | null;
  // Renders the per-row action (used by /admin for role changes).
  action?: (member: Member) => React.ReactNode;
};

export function MemberList({ members, currentUserId, action }: Props) {
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
        <li
          key={member.playerId}
          className="flex min-h-14 items-center gap-3 py-2"
        >
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary"
          >
            {member.name.charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">
              {member.name}
              {member.playerId === currentUserId && (
                <span className="text-muted-foreground"> (вы)</span>
              )}
            </span>
            {member.role === "organizer" ? (
              <Badge variant="secondary" className="mt-0.5 w-fit gap-1">
                <Crown className="size-3" aria-hidden />
                Организатор
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">Игрок</span>
            )}
          </div>
          {action?.(member)}
        </li>
      ))}
    </ul>
  );
}
