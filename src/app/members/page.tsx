import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LevelPicker } from "@/components/level-picker";
import { MemberList } from "@/components/member-list";
import { Notice } from "@/components/notice";
import { getAppContext, getGroupMembers } from "@/lib/session";

export const metadata: Metadata = { title: "Участники" };

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");

  const [{ joined }, members] = await Promise.all([
    searchParams,
    getGroupMembers(ctx.group.id),
  ]);
  const isOrganizer = ctx.role === "organizer";

  return (
    <div className="flex flex-col gap-4">
      {joined === "1" && (
        <Notice variant="success">
          Вы в группе «{ctx.group.name}». Добро пожаловать!
        </Notice>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Участники <span className="text-muted-foreground">· {members.length}</span>
          </CardTitle>
          {isOrganizer && (
            <CardDescription>
              Уровень 1–5 (1 — новичок, 5 — самый сильный) используется при
              автоматическом делении на команды. Менять его может только организатор.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <MemberList
            members={members}
            currentUserId={ctx.userId}
            below={
              isOrganizer
                ? (m) => <LevelPicker playerId={m.playerId} level={m.level} name={m.name} />
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
