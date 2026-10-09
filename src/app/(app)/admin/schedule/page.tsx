import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UpcomingGamesList } from "@/components/game/upcoming-games-list";
import { OneOffGameForm } from "@/components/schedule/one-off-game-form";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { ScheduleItem } from "@/components/schedule/schedule-item";
import { DEFAULT_TIMEZONE, todayInZone } from "@/lib/datetime";
import { getUpcomingGames } from "@/lib/games";
import { getAppContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("schedule.title") };
}

export default async function SchedulePage() {
  const ctx = await getAppContext();
  if (!ctx.group) redirect("/");
  if (ctx.role !== "organizer") redirect("/admin");

  const supabase = await createClient();
  const t = await getT();
  const [{ data: schedules }, games] = await Promise.all([
    supabase
      .from("schedules")
      .select("*")
      .eq("group_id", ctx.group.id)
      .order("created_at", { ascending: true }),
    getUpcomingGames(ctx.group.id, 10),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin"
        className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("nav.admin")}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("schedule.title")}</CardTitle>
          <CardDescription>{t("schedule.text")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {schedules && schedules.length > 0 ? (
            <ul className="divide-y">
              {schedules.map((s) => (
                <ScheduleItem key={s.id} schedule={s} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("schedule.empty")}</p>
          )}
          <details className="rounded-lg border p-3 open:pb-4" open={!schedules?.length}>
            <summary className="flex min-h-11 cursor-pointer items-center font-medium">
              {t("schedule.new")}
            </summary>
            <div className="pt-2">
              <ScheduleForm />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("schedule.oneOffTitle")}</CardTitle>
          <CardDescription>{t("schedule.oneOffText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <OneOffGameForm today={todayInZone(DEFAULT_TIMEZONE)} />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("schedule.upcoming")}</CardTitle>
        </CardHeader>
        <CardContent>
          {games.length > 0 ? (
            <UpcomingGamesList games={games} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("schedule.noGames")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
