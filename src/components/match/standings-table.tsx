"use client";

import type { StandingRow } from "@/lib/match/types";
import { teamColor } from "@/lib/teams/colors";
import { useT } from "@/lib/i18n/client";

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  const t = useT();
  if (rows.every((r) => r.played === 0)) {
    return <p className="text-sm text-muted-foreground">{t("match.standingsEmpty")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 text-left font-medium">{t("match.team")}</th>
            <th className="w-7 font-medium" title={t("gameStats.col.matches.label")}>{t("gameStats.col.matches.short")}</th>
            <th className="w-7 font-medium" title={t("gameStats.col.wins.label")}>{t("gameStats.col.wins.short")}</th>
            <th className="w-7 font-medium" title={t("gameStats.col.draws.label")}>{t("gameStats.col.draws.short")}</th>
            <th className="w-7 font-medium" title={t("gameStats.col.losses.label")}>{t("gameStats.col.losses.short")}</th>
            <th className="w-12 font-medium" title={t("match.goals")}>{t("match.goalsShort")}</th>
            <th className="w-9 font-medium" title={t("match.points")}>{t("match.pointsShort")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={r.team_id} className="h-11">
              <td className="max-w-0 truncate">
                <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                <span
                  aria-hidden
                  className="mr-1.5 inline-block size-2.5 rounded-full border border-foreground/20 align-middle"
                  style={{ backgroundColor: teamColor(r.color).hex }}
                />
                {r.name}
              </td>
              <td className="text-center">{r.played}</td>
              <td className="text-center">{r.won}</td>
              <td className="text-center">{r.drawn}</td>
              <td className="text-center">{r.lost}</td>
              <td className="text-center">
                {r.goals_for}:{r.goals_against}
              </td>
              <td className="text-center font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
