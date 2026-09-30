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
import { signOutAction } from "@/lib/actions/auth";
import { getAppContext } from "@/lib/session";
import { cn } from "@/lib/utils";

const AUTH_ERRORS: Record<string, string> = {
  identity_already_exists:
    "Этот Google-аккаунт уже привязан к другому профилю. Чтобы открыть тот профиль, войдите через Google.",
  manual_linking_disabled:
    "Привязка Google пока не включена. Сообщите организатору.",
  provider_disabled: "Вход через Google пока не включён. Сообщите организатору.",
};

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const ctx = await getAppContext();

  const authError =
    typeof params.auth_error === "string" ? params.auth_error : null;
  const notices = (
    <>
      {params.notice === "admin-only" && (
        <Notice variant="error">Раздел «Админ» доступен только организатору.</Notice>
      )}
      {params.auth === "google" && (
        <Notice variant="success">Вход через Google выполнен.</Notice>
      )}
      {authError && (
        <Notice variant="error">
          {AUTH_ERRORS[authError] ?? "Не удалось войти через Google. Попробуйте ещё раз."}
        </Notice>
      )}
    </>
  );

  if (!ctx.group) {
    return (
      <div className="flex flex-col gap-6">
        {notices}
        <section className="flex flex-col gap-2 pt-4">
          <h1 className="text-2xl font-bold tracking-tight">
            Еженедельный футбол без лишней суеты
          </h1>
          <p className="text-muted-foreground">
            Отмечайтесь на игру, делитесь на команды за пару минут и следите за
            счётом.
          </p>
        </section>

        <Link href="/start" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          <Plus aria-hidden />
          Создать группу
        </Link>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Уже играете с нами?</CardTitle>
            <CardDescription>
              Откройте ссылку-приглашение из чата WhatsApp. Если вы привязывали
              Google на другом телефоне, войдите через него.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {ctx.userId && !ctx.isAnonymous ? (
              <form action={signOutAction}>
                <SubmitButton variant="ghost" className="w-full">
                  Выйти из аккаунта
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

  return (
    <div className="flex flex-col gap-4">
      {notices}
      <section>
        <p className="text-sm text-muted-foreground">
          Привет, {ctx.player?.name ?? "игрок"}!
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{ctx.group.name}</h1>
      </section>

      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
          <CalendarClock className="size-10 text-primary" aria-hidden />
          <p className="font-medium">Ближайшая игра — скоро здесь</p>
          <p className="text-sm text-muted-foreground">
            Здесь появится запись на ближайшую игру.
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Ваш профиль</CardTitle>
          <CardDescription>
            {ctx.isAnonymous
              ? "Профиль сохранён только на этом устройстве. Привяжите Google, чтобы не потерять его при смене телефона."
              : "Google привязан — на новом устройстве просто войдите через Google."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {ctx.isAnonymous ? (
            <>
              <GoogleLinkButton />
              {authError === "identity_already_exists" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Вход в другой профиль заменит текущий профиль на этом
                    устройстве.
                  </p>
                  <GoogleSignInButton label="Войти в профиль Google" />
                </>
              )}
            </>
          ) : (
            <form action={signOutAction}>
              <SubmitButton variant="ghost" className="w-full">
                Выйти из аккаунта
              </SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
