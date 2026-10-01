"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Settings2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/bottom-sheet";
import { teamColor } from "@/lib/teams/colors";
import type { GamePlayerStatRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type StatKey =
  | "matches"
  | "wins"
  | "draws"
  | "losses"
  | "goals"
  | "assists"
  | "own_goals"
  | "yellows"
  | "reds";

export const STAT_COLUMNS: { key: StatKey; short: string; label: string }[] = [
  { key: "matches", short: "И", label: "Игры" },
  { key: "wins", short: "В", label: "Победы" },
  { key: "draws", short: "Н", label: "Ничьи" },
  { key: "losses", short: "П", label: "Поражения" },
  { key: "goals", short: "Г", label: "Голы" },
  { key: "assists", short: "А", label: "Ассисты" },
  { key: "own_goals", short: "АГ", label: "Автоголы" },
  { key: "yellows", short: "ЖК", label: "Жёлтые" },
  { key: "reds", short: "КК", label: "Красные" },
];

const STORAGE_KEY = "weekball:game-stats-columns";
const ALL_KEYS = STAT_COLUMNS.map((c) => c.key);

type ColumnPrefs = { order: StatKey[]; hidden: StatKey[] };
const DEFAULT_PREFS: ColumnPrefs = { order: ALL_KEYS, hidden: [] };

function loadPrefs(): ColumnPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ColumnPrefs>;
    const order = (parsed.order ?? []).filter((k): k is StatKey => ALL_KEYS.includes(k as StatKey));
    // Columns added later go to the end.
    for (const k of ALL_KEYS) if (!order.includes(k)) order.push(k);
    const hidden = (parsed.hidden ?? []).filter((k): k is StatKey => ALL_KEYS.includes(k as StatKey));
    return { order, hidden };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: ColumnPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the settings just aren't remembered.
  }
}

type SortKey = StatKey | "name";

// Per-game player table. Live: the page re-renders on every event (GameRealtime).
export function GameStatsTable({ rows, mvpId }: { rows: GamePlayerStatRow[]; mvpId: string | null }) {
  const [prefs, setPrefs] = useState<ColumnPrefs>(DEFAULT_PREFS);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "goals", desc: true });
  const [configuring, setConfiguring] = useState(false);

  useEffect(() => {
    // localStorage only exists in the browser; read it after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loadPrefs());
  }, []);

  function update(next: ColumnPrefs) {
    setPrefs(next);
    savePrefs(next);
  }

  const columns = prefs.order
    .filter((k) => !prefs.hidden.includes(k))
    .map((k) => STAT_COLUMNS.find((c) => c.key === k)!);

  const sorted = [...rows].sort((a, b) => {
    const dir = sort.desc ? -1 : 1;
    if (sort.key === "name") return dir * a.name.localeCompare(b.name, "ru");
    const diff = a[sort.key] - b[sort.key];
    return diff !== 0 ? dir * diff : a.name.localeCompare(b.name, "ru");
  });

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));
  }

  function move(key: StatKey, delta: number) {
    const order = [...prefs.order];
    const i = order.indexOf(key);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update({ ...prefs, order });
  }

  function toggleHidden(key: StatKey) {
    const hidden = prefs.hidden.includes(key) ? prefs.hidden.filter((k) => k !== key) : [...prefs.hidden, key];
    update({ ...prefs, hidden });
  }

  const sortIcon = (key: SortKey) =>
    sort.key === key ? (
      sort.desc ? (
        <ArrowDown className="size-3" aria-hidden />
      ) : (
        <ArrowUp className="size-3" aria-hidden />
      )
    ) : null;
  const ariaSort = (key: SortKey) =>
    sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">Статистика игры</h2>
        <Button variant="ghost" onClick={() => setConfiguring(true)}>
          <Settings2 aria-hidden />
          Настроить
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Таблица появится, когда игроки будут распределены по командам.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full border-collapse bg-card text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" aria-sort={ariaSort("name")} className="sticky left-0 z-10 bg-card text-left">
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="flex min-h-11 items-center gap-1 px-3 font-medium"
                  >
                    Игрок {sortIcon("name")}
                  </button>
                </th>
                {columns.map((c) => (
                  <th key={c.key} scope="col" aria-sort={ariaSort(c.key)} className="text-center">
                    <button
                      type="button"
                      title={c.label}
                      aria-label={c.label}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "flex min-h-11 w-full min-w-9 items-center justify-center gap-0.5 px-1.5 font-medium",
                        sort.key === c.key && "text-foreground",
                      )}
                    >
                      {c.short} {sortIcon(c.key)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.player_id} className="border-b last:border-0">
                  <th scope="row" className="sticky left-0 z-10 max-w-36 bg-card px-3 py-2 text-left font-normal">
                    <Link href={`/players/${r.player_id}`} className="flex min-h-7 items-center gap-1.5">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full border border-foreground/20"
                        style={{ backgroundColor: teamColor(r.team_color).hex }}
                      />
                      <span className="truncate">{r.name}</span>
                      {r.player_id === mvpId && (
                        <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Игрок вечера" />
                      )}
                    </Link>
                  </th>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-1.5 text-center tabular-nums",
                        r[c.key] === 0 && "text-muted-foreground/60",
                        sort.key === c.key && "font-semibold",
                      )}
                    >
                      {r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {columns.map((c) => `${c.short} — ${c.label.toLowerCase()}`).join(", ")}
        </p>
      )}

      <BottomSheet open={configuring} title="Колонки таблицы" onClose={() => setConfiguring(false)}>
        <ul className="flex flex-col gap-1">
          {prefs.order.map((key, i) => {
            const col = STAT_COLUMNS.find((c) => c.key === key)!;
            const visible = !prefs.hidden.includes(key);
            return (
              <li key={key} className="flex items-center gap-1">
                <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleHidden(key)}
                    className="size-5 accent-primary"
                  />
                  {col.label}
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${col.label}: выше`}
                  disabled={i === 0}
                  onClick={() => move(key, -1)}
                >
                  <ChevronUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${col.label}: ниже`}
                  disabled={i === prefs.order.length - 1}
                  onClick={() => move(key, 1)}
                >
                  <ChevronDown aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
        <Button variant="outline" onClick={() => update(DEFAULT_PREFS)}>
          Сбросить настройки
        </Button>
      </BottomSheet>
    </section>
  );
}
