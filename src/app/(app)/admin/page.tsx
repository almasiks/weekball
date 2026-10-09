import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, Users, Volume2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PinForm } from "@/components/admin/pin-form";
import { MemberList } from "@/components/member-list";
import { MemberRoleButton } from "@/components/member-role-button";
import { getT } from "@/lib/i18n/server";
import { getAppContext, getGroupMembers } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("admin.title") };
}

const row = "flex min-h-14 items-center gap-3 rounded-xl bg-card px-4 ring-1 ring-foreground/10";

export default async function AdminPage() {
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);
  if (!ctx.player || !ctx.group) redirect("/");

  // Not an organizer yet: the PIN (checked on the server) opens this section.
  if (ctx.role !== "organizer") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("adminPin.title")}</CardTitle>
          <CardDescription>{t("adminPin.text")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PinForm />
        </CardContent>
      </Card>
    );
  }

  const members = (await getGroupMembers(ctx.group.id)).filter((m) => !m.archived);
  const organizerCount = members.filter((m) => m.role === "organizer").length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("admin.title")}</h1>

      <Link href="/admin/schedule" className={row}>
        <CalendarDays className="size-5 text-primary" aria-hidden />
        <span className="flex-1 font-medium">{t("admin.scheduleLink")}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
      <Link href="/roster" className={row}>
        <Users className="size-5 text-primary" aria-hidden />
        <span className="flex-1 font-medium">{t("admin.rosterLink")}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
      <Link href="/admin/sounds" className={row}>
        <Volume2 className="size-5 text-primary" aria-hidden />
        <span className="flex-1 font-medium">{t("admin.soundsLink")}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {t("admin.membersTitle")} <span className="text-muted-foreground">· {members.length}</span>
          </CardTitle>
          <CardDescription>{t("admin.membersText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <MemberList
            members={members}
            currentUserId={ctx.playerId}
            action={(member) =>
              // Only people with the app can be organizers.
              member.hasAccount ? (
                <MemberRoleButton
                  playerId={member.playerId}
                  currentRole={member.role}
                  disabled={member.role === "organizer" && organizerCount <= 1}
                />
              ) : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
