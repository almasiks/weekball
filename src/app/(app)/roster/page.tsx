import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/notice";
import { AddPlayersForm } from "@/components/roster/add-players-form";
import { RosterList } from "@/components/roster/roster-list";
import { getAppContext, getGroupMembers } from "@/lib/session";

export const metadata: Metadata = { title: "Состав" };

// Permanent roster of the group. Players don't need an account.
export default async function RosterPage({ searchParams }: PageProps<"/roster">) {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");

  const [{ joined }, members] = await Promise.all([searchParams, getGroupMembers(ctx.group.id)]);
  const isOrganizer = ctx.role === "organizer";
  const regular = members.filter((m) => !m.archived && m.isRegular).length;

  return (
    <div className="flex flex-col gap-4">
      {joined === "1" && <Notice variant="success">Вы в группе «{ctx.group.name}». Добро пожаловать!</Notice>}

      {isOrganizer && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Добавить игроков</CardTitle>
            <CardDescription>
              Вставьте имена списком — каждому не нужно регистрироваться. Позже человек сможет зайти по
              ссылке и выбрать себя.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddPlayersForm groupId={ctx.group.id} existingNames={members.map((m) => m.name)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Состав <span className="text-muted-foreground">· {regular}</span>
          </CardTitle>
          {isOrganizer && (
            <CardDescription>
              Уровень 1–5 (1 — новичок, 5 — самый сильный) помогает делить команды. Меню «⋯» — имя,
              позиция, объединение дублей, архив.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <RosterList members={members} currentPlayerId={ctx.playerId} isOrganizer={isOrganizer} />
        </CardContent>
      </Card>
    </div>
  );
}
