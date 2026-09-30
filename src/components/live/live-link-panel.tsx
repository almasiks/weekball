"use client";

import { useState, useTransition } from "react";
import { Link2, Link2Off, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteShare } from "@/components/invite-share";
import { setLiveLinkAction } from "@/lib/actions/matches";

type Props = { gameId: string; token: string | null; siteUrl: string };

// Public, unguessable /live/<token> link for guests without an account.
export function LiveLinkPanel({ gameId, token: initial, siteUrl }: Props) {
  const [token, setToken] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(enabled: boolean, regenerate = false) {
    setError(null);
    startTransition(async () => {
      const r = await setLiveLinkAction(gameId, enabled, regenerate);
      if (r.error) setError(r.error);
      else setToken(r.token ?? null);
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Live по ссылке</CardTitle>
        <CardDescription>
          Для гостей без входа: счёт, таймер и события. Имена игроков видны, остальное — нет.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {token ? (
          <>
            <InviteShare
              inviteUrl={`${siteUrl}/live/${token}`}
              groupName="live"
              message={`Смотри матч в прямом эфире: ${siteUrl}/live/${token}`}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" disabled={pending} onClick={() => set(true, true)}>
                <RefreshCw aria-hidden />
                Новая ссылка
              </Button>
              <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => set(false)}>
                <Link2Off aria-hidden />
                Отключить
              </Button>
            </div>
          </>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => set(true)}>
            <Link2 aria-hidden />
            Открыть live по ссылке
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
