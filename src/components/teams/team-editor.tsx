"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClassName } from "@/components/schedule/schedule-form";
import { updateTeamAction } from "@/lib/actions/teams";
import { colorLabel, defaultTeamName, isDefaultTeamName, TEAM_COLORS } from "@/lib/teams/colors";
import type { SignupEntry, TeamView } from "@/lib/games";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

type Props = {
  gameId: string;
  team: TeamView;
  usedColors: string[];
  going: SignupEntry[];
  onDone: () => void;
};

export function TeamEditor({ gameId, team, usedColors, going, onDone }: Props) {
  const t = useT();
  const [name, setName] = useState(team.team.name);
  const [color, setColor] = useState(team.team.color);
  const [captainId, setCaptainId] = useState(team.team.captain_id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pickColor(hex: string) {
    // Keep a custom name; replace a default one ("Красные" -> "Синие").
    const isDefaultName = isDefaultTeamName(name) || !name.trim();
    setColor(hex);
    if (isDefaultName) setName(defaultTeamName(t, hex));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateTeamAction(gameId, team.team.id, {
        name,
        color,
        captainId: captainId || null,
      });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b p-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`team-name-${team.team.id}`}>{t("teams.name")}</Label>
        <Input
          id={`team-name-${team.team.id}`}
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("teams.bibColor")}</legend>
        <div className="grid grid-cols-5 gap-2">
          {TEAM_COLORS.map((c) => {
            const taken = c.hex !== team.team.color && usedColors.includes(c.hex);
            const selected = c.hex === color;
            return (
              <button
                key={c.hex}
                type="button"
                disabled={taken}
                onClick={() => pickColor(c.hex)}
                aria-label={`${colorLabel(t, c.hex)}${taken ? t("teams.taken") : ""}`}
                aria-pressed={selected}
                title={colorLabel(t, c.hex)}
                className={cn(
                  "flex size-11 items-center justify-center rounded-full border-2 border-foreground/15 disabled:opacity-25",
                  selected && "ring-3 ring-foreground ring-offset-2 ring-offset-background",
                )}
                style={{ backgroundColor: c.hex }}
              >
                {selected && (
                  <Check
                    className={cn("size-5", c.ink === "light" ? "text-white" : "text-neutral-900")}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{colorLabel(t, color)}</p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`team-captain-${team.team.id}`}>{t("teams.captain")}</Label>
        <select
          id={`team-captain-${team.team.id}`}
          value={captainId}
          onChange={(e) => setCaptainId(e.target.value)}
          className={selectClassName}
        >
          <option value="">{t("teams.noCaptain")}</option>
          {going.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {t("teams.captainHint")}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onDone} disabled={pending}>
          {t("teams.cancel")}
        </Button>
        <Button onClick={save} disabled={pending}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
