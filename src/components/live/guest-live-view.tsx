"use client";

import { useEffect, useState } from "react";
import { MatchesOverview } from "@/components/match/matches-overview";
import { Notice } from "@/components/notice";
import { createClient } from "@/lib/supabase/client";
import { formatGameDate } from "@/lib/datetime";
import { clockOffset } from "@/lib/match/timer";
import { namesFromTeams, type PublicLiveGame } from "@/lib/match/public";
import { useT } from "@/lib/i18n/client";

const POLL_MS = 5000;

// Guests poll every 5 s (no Realtime); the clock ticks locally between polls.
export function GuestLiveView({ token, initial }: { token: string; initial: PublicLiveGame }) {
  const tr = useT();
  const [data, setData] = useState<PublicLiveGame | null>(initial);
  const [offset, setOffset] = useState(0);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const sent = Date.now();
      const { data: result, error } = await supabase.rpc("get_live_game", { p_token: token });
      const received = Date.now();
      if (cancelled) return;
      if (error) {
        setStale(true);
        return;
      }
      setStale(false);
      const live = result as PublicLiveGame | null;
      setData(live);
      if (live) setOffset(clockOffset(live.server_now, sent, received));
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  if (!data) {
    return <Notice variant="error">{tr("match.linkDisabled")}</Notice>;
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{data.game.group_name}</h1>
        <p className="text-sm text-muted-foreground">
          {formatGameDate(tr, data.game.starts_at, data.game.timezone)}
          {data.game.place && ` · ${data.game.place}`}
          {data.game.status === "finished" && tr("match.gameFinished")}
        </p>
      </header>
      {stale && <Notice>{tr("match.stale")}</Notice>}
      {data.matches.length === 0 ? (
        <Notice>{tr("match.notStartedYet")}</Notice>
      ) : (
        <MatchesOverview
          matches={data.matches}
          events={data.events}
          teams={data.teams}
          names={namesFromTeams(data.teams)}
          standings={data.standings}
          offset={offset}
          finished={data.game.status === "finished"}
        />
      )}
    </div>
  );
}
