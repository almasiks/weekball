import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/notice";
import { AddPlayersForm } from "@/components/roster/add-players-form";
import { RosterList } from "@/components/roster/roster-list";
import { getAppContext, getGroupMembers } from "@/lib/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("roster.title") };
}

// Permanent roster of the group. Players don't need an account.
export default async function RosterPage({ searchParams }: PageProps<"/roster">) {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");

  const [{ joined }, members, t] = await Promise.all([searchParams, getGroupMembers(ctx.group.id), getT()]);
  const isOrganizer = ctx.role === "organizer";
  const regular = members.filter((m) => !m.archived && m.isRegular).length;

  return (
    <div className="flex flex-col gap-4">
      {joined === "1" && <Notice variant="success">{t("roster.joined", { group: ctx.group.name })}</Notice>}

      {isOrganizer && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("roster.addTitle")}</CardTitle>
            <CardDescription>{t("roster.addText")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AddPlayersForm groupId={ctx.group.id} existingNames={members.map((m) => m.name)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {t("roster.title")} <span className="text-muted-foreground">· {regular}</span>
          </CardTitle>
          {isOrganizer && (
            <CardDescription>{t("roster.levelsHint")}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <RosterList members={members} currentPlayerId={ctx.playerId} isOrganizer={isOrganizer} />
        </CardContent>
      </Card>
    </div>
  );
}
