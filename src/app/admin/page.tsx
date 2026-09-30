import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
