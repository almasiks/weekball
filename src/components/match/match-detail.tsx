"use client";

import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventFeed } from "@/components/match/event-feed";
import { Scoreboard } from "@/components/match/scoreboard";
import { TeamHeader } from "@/components/teams/team-header";
import { useServerOffset } from "@/lib/match/hooks";
import type { LiveEvent, LiveMatch, LiveTeam } from "@/lib/match/types";
import { matchResultText, whatsappUrl } from "@/lib/share";
import { teamColor } from "@/lib/teams/colors";
import { cn } from "@/lib/utils";

type Props = {
  match: LiveMatch;
  teams: LiveTeam[];
  events: LiveEvent[];
  names: Record<string, string>;
  shareUrl: string;
  offset?: number;
};

export function MatchDetail({ match, teams, events, names, shareUrl, offset: given }: Props) {
  const measured = useServerOffset();
  const offset = given ?? measured ?? 0;
  const matchEvents = events.filter((e) => e.match_id === match.id);
  const sides = [match.team_a_id, match.team_b_id]
    .map((id) => teams.find((t) => t.id === id))
    .filter((t): t is LiveTeam => !!t);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <Scoreboard match={match} teams={teams} scoreA={match.score_a} scoreB={match.score_b} offset={offset} big />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>События</CardTitle>
        </CardHeader>
        <CardContent>
          <EventFeed events={matchEvents} matches={[match]} teams={teams} names={names} />
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {sides.map((t) => (
          <section key={t.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <TeamHeader name={t.name} color={teamColor(t.color)} count={t.players.length} />
            <ul className="divide-y px-3">
              {t.players.map((p) => (
                <li key={p.id} className="flex min-h-11 items-center py-1.5">
                  {p.name}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <a
        href={whatsappUrl(matchResultText({ match, teams, events: matchEvents, names, url: shareUrl }))}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants(), "w-full bg-[#128C7E] text-white hover:bg-[#0e7266]")}
      >
        <MessageCircle aria-hidden />
        Поделиться результатом
      </a>
    </div>
  );
}
