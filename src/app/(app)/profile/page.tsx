import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartColumn, ChevronRight, Crown, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { PlayerAvatar } from "@/components/player-avatar";
import { ChooseName } from "@/components/profile/choose-name";
import { RenameForm } from "@/components/profile/rename-form";
import { getT } from "@/lib/i18n/server";
import { getAppContext, getFreeRosterNames } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("profile.title") };
}

const row = "flex min-h-14 items-center gap-3 rounded-xl bg-card px-4 ring-1 ring-foreground/10";

export default async function ProfilePage() {
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);
  if (!ctx.group) redirect("/");
  const isOrganizer = ctx.role === "organizer";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("profile.title")}</h1>

      {ctx.player ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <PlayerAvatar name={ctx.player.name} className="size-14 text-xl" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-lg font-semibold">{ctx.player.name}</span>
                {isOrganizer && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Crown className="size-3.5" aria-hidden />
                    {t("profile.organizer")}
                  </span>
                )}
              </div>
            </div>
            <RenameForm name={ctx.player.name} />
          </CardContent>
        </Card>
      ) : (
        // Nobody has to say who they are; it is only needed to press "Иду" oneself.
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("identity.profileTitle")}</CardTitle>
            <CardDescription>{t("identity.profileText")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChooseName names={await getFreeRosterNames(ctx.group.id)} />
          </CardContent>
        </Card>
      )}

      {ctx.player && (
        <Link href={`/players/${ctx.player.id}`} className={row}>
          <ChartColumn className="size-5 text-primary" aria-hidden />
          <span className="flex-1 font-medium">{t("profile.myStats")}</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      )}
      <Link href="/roster" className={row}>
        <Users className="size-5 text-primary" aria-hidden />
        <span className="flex-1 font-medium">{t("profile.roster")}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
      <div className={row}>
        <span className="flex-1 font-medium">{t("profile.language")}</span>
        <LocaleSwitcher />
      </div>

      {/* Deliberately at the very bottom and plain: only the organizer needs it. */}
      <Link
        href="/admin"
        className="flex min-h-11 items-center justify-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        <ShieldCheck className="size-4" aria-hidden />
        {isOrganizer ? t("profile.admin") : t("profile.becomeOrganizer")}
      </Link>
    </div>
  );
}
