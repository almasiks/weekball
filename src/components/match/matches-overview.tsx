"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventFeed } from "@/components/match/event-feed";
import { Scoreboard } from "@/components/match/scoreboard";
import { StandingsTable } from "@/components/match/standings-table";
import { useServerOffset } from "@/lib/match/hooks";
import type { LiveEvent, LiveMatch, LiveTeam, StandingRow } from "@/lib/match/types";

type Props = {
  matches: LiveMatch[];
  events: LiveEvent[];
  teams: LiveTeam[];
  names: Record<string, string>;
  standings: StandingRow[];
  // Signed-in pages link each match; the public page doesn't.
  matchHref?: (matchId: string) => string;
  // Guests get the offset from get_live_game instead of an RPC.
  offset?: number;
  finished?: boolean;
};

export function MatchesOverview(props: Props) {
  const measured = useServerOffset();
  const offset = props.offset ?? measured;
  const { matches, events, teams, names, standings, matchHref } = props;
  // Live match first, then the rest in order.
  const ordered = [...matches].sort(
    (a, b) =>
      Number(b.status === "live" || b.status === "break") - Number(a.status === "live" || a.status === "break") ||
      a.sort_order - b.sort_order,
  );

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((m) => {
        const board = (
          <Scoreboard match={m} teams={teams} scoreA={m.score_a} scoreB={m.score_b} offset={offset} />
        );
        return (
          <Card key={m.id} size="sm">
            <CardContent>
              {matchHref ? (
                <Link href={matchHref(m.id)} className="relative block" aria-label="Подробнее о матче">
                  {board}
                  <ChevronRight className="absolute top-1/2 right-0 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                </Link>
              ) : (
                board
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card size="sm">
        <CardHeader>
          <CardTitle>{props.finished ? "Итоговая таблица" : "Таблица вечера"}</CardTitle>
        </CardHeader>
        <CardContent>
          <StandingsTable rows={standings} />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>События</CardTitle>
        </CardHeader>
        <CardContent>
          <EventFeed events={events} matches={matches} teams={teams} names={names} />
        </CardContent>
      </Card>
    </div>
  );
}
