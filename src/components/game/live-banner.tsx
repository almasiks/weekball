"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MatchClock } from "@/components/match/scoreboard";
import { useServerOffset } from "@/lib/match/hooks";
import type { LiveMatch } from "@/lib/match/types";
import { useT } from "@/lib/i18n/client";

type Props = { href: string; match: LiveMatch; teamA: string; teamB: string };

// Bright strip on top of the home page while a match is on: "LIVE 1:0 · 04:12".
export function LiveBanner({ href, match, teamA, teamB }: Props) {
  const t = useT();
  const offset = useServerOffset() ?? 0;
  const score = `${match.score_a}:${match.score_b}`;

  return (
    <Link
      href={href}
      aria-label={t("home.liveLabel", { teamA, score, teamB })}
      className="flex min-h-16 items-center gap-3 rounded-xl bg-red-600 px-4 py-2 text-white shadow-sm active:bg-red-700"
    >
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold tracking-wide">
        <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden />
        {t("home.live")}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xl leading-tight font-bold tabular-nums">
          {score} ·{" "}
          {match.status === "break" ? t("home.liveBreak") : <MatchClock match={match} offset={offset} addedClassName="text-white" />}
        </span>
        <span className="truncate text-xs text-white/85">
          {teamA} — {teamB}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0" aria-hidden />
    </Link>
  );
}
