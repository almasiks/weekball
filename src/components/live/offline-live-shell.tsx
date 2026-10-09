"use client";

import { useEffect, useState } from "react";
import { RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { LiveConsole } from "@/components/live/live-console";
import { formatGameDate } from "@/lib/datetime";
import { loadSnapshot, type LiveSnapshot } from "@/lib/match/snapshot";
import { useT } from "@/lib/i18n/client";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; snapshot: LiveSnapshot };

export function OfflineLiveShell() {
  const tr = useT();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [online, setOnline] = useState(false);

  useEffect(() => {
    // Served in place of /game/<id>/live, so the id is in the address bar.
    const gameId = window.location.pathname.match(/^\/game\/([^/]+)\/live/)?.[1];
    if (!gameId) {
      queueMicrotask(() => setState({ kind: "missing" }));
    } else {
      loadSnapshot(gameId).then((snapshot) =>
        setState(snapshot ? { kind: "ready", snapshot } : { kind: "missing" }),
      );
    }
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (state.kind === "loading") {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-label={tr("common.loading")} />;
  }

  if (state.kind === "missing") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <WifiOff className="size-12 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">{tr("match.noNetwork")}</h1>
        <p className="text-muted-foreground">
          {tr("match.neverOpened")}
        </p>
        <Button size="lg" onClick={() => window.location.reload()}>
          <RotateCw aria-hidden />
          {tr("common.tryAgain")}
        </Button>
      </div>
    );
  }

  const { snapshot } = state;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{tr("match.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {formatGameDate(tr, snapshot.meta.startsAt, snapshot.meta.timezone)}
          {snapshot.meta.place && ` · ${snapshot.meta.place}`}
        </p>
      </header>
      {online ? (
        <Notice variant="success">
          <span className="flex flex-wrap items-center gap-2">
            {tr("match.backOnline")}
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              {tr("match.refreshPage")}
            </Button>
          </span>
        </Notice>
      ) : (
        <Notice>
          {tr("match.offlineState", {
            time: new Date(snapshot.savedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
          })}{" "}
          {tr("match.offlineQueue")}
        </Notice>
      )}
      <LiveConsole
        gameId={snapshot.gameId}
        gameStatus={snapshot.gameStatus}
        teams={snapshot.teams}
        matches={snapshot.matches}
        events={snapshot.events}
        names={snapshot.names}
        siteUrl={snapshot.siteUrl}
        meta={snapshot.meta}
        sounds={snapshot.sounds ?? []}
        initialOffset={snapshot.offset}
        offline
      />
    </div>
  );
}
