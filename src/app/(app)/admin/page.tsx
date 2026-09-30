import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, Volume2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteShare } from "@/components/invite-share";
import { MemberList } from "@/components/member-list";
import { MemberRoleButton } from "@/components/member-role-button";
import { Notice } from "@/components/notice";
import { getAppContext, getGroupMembers } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = { title: "Админ" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");
  if (ctx.role !== "organizer") redirect("/?notice=admin-only");

  const [{ created }, members, siteUrl] = await Promise.all([
    searchParams,
    getGroupMembers(ctx.group.id),
    getSiteUrl(),
  ]);
  const inviteUrl = `${siteUrl}/join/${ctx.group.inviteCode}`;
  const organizerCount = members.filter((m) => m.role === "organizer").length;

  return (
    <div className="flex flex-col gap-4">
      {created === "1" && (
        <Notice variant="success">
          Группа создана! Отправьте ссылку в чат, чтобы игроки присоединились.
        </Notice>
      )}

      <Link
        href="/admin/schedule"
        className="flex min-h-14 items-center gap-3 rounded-xl bg-card px-4 ring-1 ring-foreground/10"
      >
        <CalendarDays className="size-5 text-primary" aria-hidden />
        <span className="flex-1 font-medium">Расписание и игры</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      <Link
        href="/admin/sounds"
        className="flex min-h-14 items-center gap-3 rounded-xl bg-card px-4 ring-1 ring-foreground/10"
      >
        <Volume2 className="size-5 text-primary" aria-hidden />
        <span className="flex-1 font-medium">Звуки</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Приглашение</CardTitle>
          <CardDescription>
            Любой, у кого есть ссылка, может вступить в группу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteShare inviteUrl={inviteUrl} groupName={ctx.group.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Участники <span className="text-muted-foreground">· {members.length}</span>
          </CardTitle>
          <CardDescription>
            Организаторы могут делить на команды и вести матч.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberList
            members={members}
            currentUserId={ctx.userId}
            action={(member) => (
              <MemberRoleButton
                playerId={member.playerId}
                currentRole={member.role}
                disabled={member.role === "organizer" && organizerCount <= 1}
              />
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
