import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JoinGroupForm } from "@/components/join-group-form";
import { Notice } from "@/components/notice";
import { getAppContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Приглашение" };

const CODE_PATTERN = /^[A-Za-z0-9]{4,16}$/;

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const ctx = await getAppContext();

  if (!CODE_PATTERN.test(code)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Ссылка не работает</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Notice variant="error">
            Ссылка-приглашение повреждена. Попросите организатора прислать её
            ещё раз.
          </Notice>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            На главную
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Unclaimed roster names ("Это я"). Not offered when this account already has a player.
  const supabase = await createClient();
  const { data: claimable } = ctx.player
    ? { data: [] }
    : await supabase.rpc("group_claimable_players", { p_code: code });

  // The group name is only visible to members (RLS), so we show it after joining.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Вас пригласили в группу</CardTitle>
        <CardDescription>
          {claimable?.length
            ? "Найдите себя в списке — вся ваша статистика сохранится. Пароль не нужен."
            : "Введите имя — так вас увидят в списке игроков и составах. Пароль не нужен."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <JoinGroupForm code={code} defaultName={ctx.player?.name} claimable={claimable ?? []} />
      </CardContent>
    </Card>
  );
}
