import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GoogleLinkButton, GoogleSignInButton } from "@/components/google-auth";
import { Notice } from "@/components/notice";
import { SubmitButton } from "@/components/submit-button";
import { GamePanel } from "@/components/game/game-panel";
import { UpcomingGamesList } from "@/components/game/upcoming-games-list";
import { signOutAction } from "@/lib/actions/auth";
import { getGameView, getUpcomingGames } from "@/lib/games";
import { getAppContext } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

const AUTH_ERRORS = ["identity_already_exists", "manual_linking_disabled", "provider_disabled"] as const;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const [ctx, t] = await Promise.all([getAppContext(), getT()]);

  const authError =
    typeof params.auth_error === "string" ? params.auth_error : null;
  const notices = (
    <>
      {params.notice === "admin-only" && (
        <Notice variant="error">{t("home.adminOnly")}</Notice>
      )}
      {params.auth === "google" && (
        <Notice variant="success">{t("auth.signedIn")}</Notice>
      )}
      {authError && (
        <Notice variant="error">
          {t(AUTH_ERRORS.find((code) => code === authError) ? `auth.${authError as (typeof AUTH_ERRORS)[number]}` : "auth.failed")}
        </Notice>
      )}
    </>
  );

  if (!ctx.group) {
    return (
      <div className="flex flex-col gap-6">
        {notices}
        <section className="flex flex-col gap-2 pt-4">
          <h1 className="text-2xl font-bold tracking-tight">{t("home.heroTitle")}</h1>
          <p className="text-muted-foreground">{t("home.heroText")}</p>
        </section>

        <Link href="/start" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          <Plus aria-hidden />
          {t("home.createGroup")}
        </Link>

        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("home.alreadyTitle")}</CardTitle>
            <CardDescription>{t("home.alreadyText")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {ctx.userId && !ctx.isAnonymous ? (
              <form action={signOutAction}>
                <SubmitButton variant="ghost" className="w-full">
                  {t("auth.signOut")}
                </SubmitButton>
              </form>
            ) : (
              <GoogleSignInButton />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const [upcoming, siteUrl] = await Promise.all([
    getUpcomingGames(ctx.group.id),
    getSiteUrl(),
  ]);
  const [nextGame, ...laterGames] = upcoming;
  const nextView = nextGame ? await getGameView(nextGame.id) : null;

  return (
    <div className="flex flex-col gap-4">
      {notices}
      <section>
        <p className="text-sm text-muted-foreground">
          {t("home.hello", { name: ctx.player?.name ?? t("home.helloFallback") })}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{ctx.group.name}</h1>
      </section>

      {nextView ? (
        <GamePanel
          view={nextView}
          userId={ctx.playerId}
          gameUrl={`${siteUrl}/game/${nextView.game.id}`}
          linkToGame
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <CalendarClock className="size-10 text-primary" aria-hidden />
            <p className="font-medium">{t("home.noGameTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {ctx.role === "organizer"
                ? t("home.noGameOrganizer")
                : t("home.noGamePlayer")}
            </p>
            {ctx.role === "organizer" && (
              <Link
                href="/admin/schedule"
                className={cn(buttonVariants({ variant: "outline" }), "mt-2")}
              >
                {t("home.scheduleLink")}
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {laterGames.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("home.laterGames")}</CardTitle>
          </CardHeader>
          <CardContent>
            <UpcomingGamesList games={laterGames} />
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("home.profile")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {ctx.isAnonymous ? (
            <>
              <GoogleLinkButton />
              {authError === "identity_already_exists" && (
                <>
                  <p className="text-xs text-muted-foreground">{t("home.otherProfileHint")}</p>
                  <GoogleSignInButton label={t("auth.signInOther")} />
                </>
              )}
            </>
          ) : (
            <form action={signOutAction}>
              <SubmitButton variant="ghost" className="w-full">
                {t("auth.signOut")}
              </SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
