import { START_RATING } from "@/lib/rating/elo";
import { getT } from "@/lib/i18n/server";

type Point = { starts_at: string; rating_after: number; rating_before: number };

// Lightweight SVG line chart of the rating after each game (no chart library).
export async function RatingChart({ history }: { history: Point[] }) {
  const t = await getT();
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("stats.chartEmpty")}</p>;
  }

  const values = [history[0].rating_before, ...history.map((h) => h.rating_after)];
  const W = 320;
  const H = 140;
  const pad = { x: 8, top: 12, bottom: 20 };
  const min = Math.min(...values, START_RATING) - 10;
  const max = Math.max(...values, START_RATING) + 10;
  const x = (i: number) => pad.x + (i * (W - 2 * pad.x)) / Math.max(1, values.length - 1);
  const y = (v: number) => pad.top + ((max - v) * (H - pad.top - pad.bottom)) / (max - min);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const change = last - values[0];

  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full text-primary"
        role="img"
        aria-label={t("stats.chartLabel", { from: values[0], to: last, count: history.length })}
      >
        <line
          x1={pad.x}
          x2={W - pad.x}
          y1={y(START_RATING)}
          y2={y(START_RATING)}
          className="stroke-muted-foreground/40"
          strokeDasharray="4 4"
        />
        <text x={W - pad.x} y={y(START_RATING) - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
          {START_RATING}
        </text>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="currentColor" />
        ))}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {t("stats.chartCaption", { count: history.length, change: `${change >= 0 ? "+" : ""}${change}` })}
      </figcaption>
    </figure>
  );
}
