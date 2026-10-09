"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, CloudOff, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/bottom-sheet";
import { PlayerAvatar } from "@/components/player-avatar";
import { useOutbox } from "@/lib/match/use-outbox";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

export type CheckinPlayer = {
  playerId: string;
  name: string;
  isRegular: boolean;
  going: boolean; // signed up "Иду"
  present: boolean; // arrival = arrived
};

type Props = { gameId: string; players: CheckinPlayer[] };

const clock = () => Date.now();

// Big checkboxes "кто пришёл". Works offline: every tap goes to the outbox
// (idempotent RPCs) and the list is updated optimistically.
export function CheckinBoard({ gameId, players }: Props) {
  const t = useT();
  const router = useRouter();
  const refresh = useCallback(() => {
    if (navigator.onLine) router.refresh();
  }, [router]);
  const outbox = useOutbox(gameId, refresh, players);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [regular, setRegular] = useState(true);

  // Server state + queued taps (in order).
  const list = useMemo(() => {
    const byId = new Map(players.map((p) => [p.playerId, { ...p }]));
    for (const item of outbox.overlay) {
      if (item.kind === "new_player" && !byId.has(item.playerId)) {
        byId.set(item.playerId, {
          playerId: item.playerId,
          name: item.name,
          isRegular: item.isRegular,
          going: true,
          present: true,
        });
      } else if (item.kind === "attendance") {
        const p = byId.get(item.playerId);
        if (p) byId.set(item.playerId, { ...p, present: item.present, going: p.going || item.present });
      }
    }
    return [...byId.values()];
  }, [players, outbox.overlay]);

  const q = query.trim().toLowerCase();
  const matches = (p: CheckinPlayer) => !q || p.name.toLowerCase().includes(q);
  const byName = (a: CheckinPlayer, b: CheckinPlayer) => a.name.localeCompare(b.name, "ru");
  // Signed up first, then the rest of the regular roster; one-off players only when searching or present.
  const signed = list.filter((p) => p.going && matches(p)).sort(byName);
  const rest = list.filter((p) => !p.going && p.isRegular && matches(p)).sort(byName);
  const others = q ? list.filter((p) => !p.going && !p.isRegular && matches(p)).sort(byName) : [];
  const total = list.filter((p) => p.isRegular || p.going).length;
  const presentCount = list.filter((p) => p.present).length;

  function toggle(p: CheckinPlayer) {
    outbox.enqueue({
      id: crypto.randomUUID(),
      kind: "attendance",
      playerId: p.playerId,
      present: !p.present,
      createdAt: clock(),
      status: "pending",
    });
  }

  function addPlayer() {
    const name = newName.replace(/\s+/g, " ").trim();
    if (!name) return;
    outbox.enqueue({
      id: crypto.randomUUID(),
      kind: "new_player",
      playerId: crypto.randomUUID(),
      name,
      isRegular: regular,
      createdAt: clock(),
      status: "pending",
    });
    setNewName("");
    setRegular(true);
    setAdding(false);
  }

  const row = (p: CheckinPlayer) => (
    <li key={p.playerId}>
      <button
        type="button"
        role="checkbox"
        aria-checked={p.present}
        onClick={() => toggle(p)}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors",
          p.present ? "border-primary bg-primary/10" : "bg-background",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border-2",
            p.present ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30",
          )}
        >
          {p.present && <Check className="size-5" />}
        </span>
        <PlayerAvatar name={p.name} className="size-8 text-sm" />
        <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
        {!p.isRegular && <span className="text-xs text-muted-foreground">{t("checkin.oneOff")}</span>}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        role="status"
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex items-center gap-3 rounded-xl bg-background/95 py-2 backdrop-blur"
      >
        <span className="text-2xl font-bold tabular-nums">
          {t("checkin.came", { count: presentCount })}{" "}
          <span className="text-base font-medium text-muted-foreground">{t("checkin.ofTotal", { total })}</span>
        </span>
        <span
          className={cn(
            "ml-auto flex items-center gap-1 text-xs font-medium",
            outbox.pending.length ? "text-amber-700 dark:text-amber-400" : "text-primary",
          )}
        >
          {outbox.pending.length ? <CloudOff className="size-4" aria-hidden /> : <CircleCheck className="size-4" aria-hidden />}
          {outbox.pending.length ? t("checkin.unsent", { count: outbox.pending.length }) : t("checkin.saved")}
        </span>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          aria-label={t("common.searchByName")}
          placeholder={t("checkin.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <Button size="lg" variant="secondary" onClick={() => setAdding(true)}>
        <UserPlus aria-hidden />
        {t("checkin.addNew")}
      </Button>

      {signed.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-muted-foreground">{t("checkin.signedUp", { count: signed.length })}</h2>
          <ul className="flex flex-col gap-1.5">{signed.map(row)}</ul>
        </section>
      )}
      {rest.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-muted-foreground">{t("checkin.regulars", { count: rest.length })}</h2>
          <ul className="flex flex-col gap-1.5">{rest.map(row)}</ul>
        </section>
      )}
      {others.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-muted-foreground">{t("checkin.others")}</h2>
          <ul className="flex flex-col gap-1.5">{others.map(row)}</ul>
        </section>
      )}
      {signed.length + rest.length + others.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {q ? t("checkin.notFound") : t("checkin.emptyRoster")}
        </p>
      )}

      {outbox.rejected.map((item) => (
        <p key={item.id} className="text-sm text-destructive">
          {t("checkin.rejected", { error: item.error ?? "" })}
        </p>
      ))}

      <BottomSheet open={adding} title={t("checkin.newPlayer")} onClose={() => setAdding(false)}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-player">{t("checkin.name")}</Label>
          <Input
            id="new-player"
            value={newName}
            maxLength={40}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={regular}
            onChange={(e) => setRegular(e.target.checked)}
            className="size-5 accent-primary"
          />
          {t("checkin.addToRoster")}
        </label>
        <Button size="lg" disabled={!newName.trim()} onClick={addPlayer}>
          {t("checkin.addAndMark")}
        </Button>
      </BottomSheet>
    </div>
  );
}
