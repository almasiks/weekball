"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Crown, MoreHorizontal, Search, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/bottom-sheet";
import { LevelPicker } from "@/components/level-picker";
import { Notice } from "@/components/notice";
import { PlayerAvatar } from "@/components/player-avatar";
import { selectClassName } from "@/components/schedule/schedule-form";
import {
  mergePlayersAction,
  renamePlayerAction,
  setPlayerArchivedAction,
  setPlayerPositionAction,
  unlinkPlayerAction,
  type ActionResult,
} from "@/lib/actions/roster";
import { POSITION_VALUES, positionLabel } from "@/lib/positions";
import type { RosterMember } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

type Tab = "regular" | "other" | "archived";
type Props = { members: RosterMember[]; currentPlayerId: string | null; isOrganizer: boolean };

export function RosterList({ members, currentPlayerId, isOrganizer }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("regular");
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  const inTab = (m: RosterMember) =>
    tab === "archived" ? m.archived : tab === "other" ? !m.archived && !m.isRegular : !m.archived && m.isRegular;
  const q = query.trim().toLowerCase();
  const rows = members.filter((m) => inTab(m) && (!q || m.name.toLowerCase().includes(q)));
  const counts = {
    regular: members.filter((m) => !m.archived && m.isRegular).length,
    other: members.filter((m) => !m.archived && !m.isRegular).length,
    archived: members.filter((m) => m.archived).length,
  };
  const menuPlayer = members.find((m) => m.playerId === menuId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {isOrganizer && (
        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label={t("roster.lists")}>
          {(
            [
              ["regular", t("roster.tabRegular")],
              ["other", t("roster.tabOther")],
              ["archived", t("roster.tabArchived")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "min-h-11 rounded-lg border text-sm font-medium",
                tab === key ? "border-primary bg-primary/10 text-primary" : "bg-background",
              )}
            >
              {label} · {counts[key]}
            </button>
          ))}
        </div>
      )}

      {members.length > 10 && (
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label={t("common.searchByName")}
            placeholder={t("common.searchByName")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {tab === "regular" ? t("roster.emptyRegular") : t("roster.empty")}
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((m) => (
            <li key={m.playerId} className="flex flex-col gap-2 py-2">
              <div className="flex min-h-12 items-center gap-3">
                <PlayerAvatar name={m.name} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/players/${m.playerId}`} className="truncate font-medium underline-offset-2 hover:underline">
                    {m.name}
                    {m.playerId === currentPlayerId && <span className="text-muted-foreground"> {t("common.you")}</span>}
                  </Link>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {m.role === "organizer" && (
                      <Badge variant="secondary" className="w-fit gap-1">
                        <Crown className="size-3" aria-hidden />
                        {t("common.organizer")}
                      </Badge>
                    )}
                    {m.hasAccount && (
                      <span className="inline-flex items-center gap-0.5">
                        <UserCheck className="size-3" aria-hidden />
                        {t("roster.hasAccount")}
                      </span>
                    )}
                    {m.position && <span>{positionLabel(t, m.position)}</span>}
                    {!isOrganizer && <span>{t("roster.levelShort", { level: m.level })}</span>}
                  </span>
                </div>
                {isOrganizer && (
                  <Button variant="ghost" size="icon" aria-label={t("roster.actions", { name: m.name })} onClick={() => setMenuId(m.playerId)}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                )}
              </div>
              {isOrganizer && !m.archived && <LevelPicker playerId={m.playerId} level={m.level} name={m.name} />}
            </li>
          ))}
        </ul>
      )}

      <BottomSheet open={!!menuPlayer} title={menuPlayer?.name ?? ""} onClose={() => setMenuId(null)}>
        {menuPlayer && (
          <PlayerMenu
            key={menuPlayer.playerId}
            player={menuPlayer}
            others={members.filter((x) => x.playerId !== menuPlayer.playerId && !x.archived)}
            isMe={menuPlayer.playerId === currentPlayerId}
            onDone={() => setMenuId(null)}
          />
        )}
      </BottomSheet>
    </div>
  );
}

function PlayerMenu({
  player,
  others,
  isMe,
  onDone,
}: {
  player: RosterMember;
  others: RosterMember[];
  isMe: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(player.name);
  const [mergeInto, setMergeInto] = useState("");
  const [confirmMerge, setConfirmMerge] = useState(false);

  function run(fn: () => Promise<ActionResult>, close = true) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else if (close) onDone();
    });
  }

  const target = others.find((o) => o.playerId === mergeInto);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="rename">{t("roster.name")}</Label>
        <div className="flex gap-2">
          <Input id="rename" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Button
            variant="secondary"
            disabled={pending || !name.trim() || name.trim() === player.name}
            onClick={() => run(() => renamePlayerAction(player.playerId, name))}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("roster.position")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {POSITION_VALUES.map((value) => (
            <Button
              key={value}
              variant={player.position === value ? "default" : "outline"}
              disabled={pending}
              onClick={() => run(() => setPlayerPositionAction(player.playerId, player.position === value ? null : value), false)}
            >
              {positionLabel(t, value)}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <Label htmlFor="merge">{t("roster.mergeTitle")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("roster.mergeText", { name: player.name })}
        </p>
        <select
          id="merge"
          className={selectClassName}
          value={mergeInto}
          onChange={(e) => {
            setMergeInto(e.target.value);
            setConfirmMerge(false);
          }}
        >
          <option value="">{t("roster.mergePick")}</option>
          {others.map((o) => (
            <option key={o.playerId} value={o.playerId}>
              {o.name}
            </option>
          ))}
        </select>
        {target &&
          (confirmMerge ? (
            <Button variant="destructive" disabled={pending} onClick={() => run(() => mergePlayersAction(player.playerId, target.playerId))}>
              {t("roster.mergeConfirm", { name: target.name })}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setConfirmMerge(true)}>
              {t("roster.mergeWith", { name: target.name })}
            </Button>
          ))}
      </div>

      {player.hasAccount && !isMe && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => unlinkPlayerAction(player.playerId))}>
          {t("roster.unlink")}
        </Button>
      )}
      {!isMe && (
        <Button
          variant={player.archived ? "outline" : "ghost"}
          className={player.archived ? undefined : "text-destructive"}
          disabled={pending}
          onClick={() => run(() => setPlayerArchivedAction(player.playerId, !player.archived))}
        >
          {player.archived ? t("roster.unarchive") : t("roster.archive")}
        </Button>
      )}
      {error && <Notice variant="error">{error}</Notice>}
    </div>
  );
}
