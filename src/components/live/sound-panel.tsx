"use client";

import { useEffect, useState } from "react";
import { CloudOff, Download, Plus, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { BUILTIN_SOUNDS, builtinLabel, builtinSpeech, type BuiltinKey } from "@/lib/sounds/builtin";
import { getSoundEngine, type PlayableSound } from "@/lib/sounds/engine";
import type { SoundRow } from "@/lib/supabase/database.types";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import Link from "next/link";

export type PanelSound = Pick<SoundRow, "id" | "name" | "file_path" | "builtin_key" | "sort_order">;

/** A built-in button, replaced by the group's own file when there is one. */
export function builtinSound(key: BuiltinKey, sounds: PanelSound[], t: T): PlayableSound {
  const builtin = BUILTIN_SOUNDS.find((b) => b.key === key)!;
  return {
    key,
    builtin,
    speech: builtinSpeech(t, key),
    filePath: sounds.find((s) => s.builtin_key === key)?.file_path ?? null,
  };
}

async function download(path: string): Promise<ArrayBuffer | null> {
  const { data, error } = await createClient().storage.from("sounds").download(path);
  if (error || !data) return null;
  return data.arrayBuffer();
}

// manageHref: where the organizer adds more buttons (hidden when not given).
type Props = { sounds: PanelSound[]; manageHref?: string };

// Big sound buttons under the timer. Plays only on this device (the organizer's).
export function SoundPanel({ sounds, manageHref }: Props) {
  const t = useT();
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [loaded, setLoaded] = useState<{ ok: number; failed: number } | null>(null);

  const items: { id: string; label: string; sound: PlayableSound }[] = [
    ...BUILTIN_SOUNDS.map((b) => ({ id: b.key, label: builtinLabel(t, b.key), sound: builtinSound(b.key, sounds, t) })),
    ...sounds
      .filter((s) => !s.builtin_key)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ id: s.id, label: s.name, sound: { key: s.id, filePath: s.file_path } })),
  ];

  // Read saved preferences; unlock audio on the first touch anywhere (iOS/Android).
  useEffect(() => {
    const engine = getSoundEngine();
    queueMicrotask(() => {
      setMuted(engine.muted);
      setVolume(engine.volume);
    });
    const unlock = () => engine.unlock();
    const events = ["pointerdown", "touchend", "keydown"] as const;
    events.forEach((e) => document.addEventListener(e, unlock, { capture: true, passive: true }));
    return () => events.forEach((e) => document.removeEventListener(e, unlock, { capture: true }));
  }, []);

  // Cache every file on this device so the buttons work without internet on the pitch.
  const paths = sounds.map((s) => s.file_path).join("|");
  useEffect(() => {
    if (!paths) return;
    let cancelled = false;
    const engine = getSoundEngine();
    Promise.all(paths.split("|").map((p) => engine.preload(p, () => download(p)))).then((results) => {
      if (!cancelled) setLoaded({ ok: results.filter(Boolean).length, failed: results.filter((r) => !r).length });
    });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  function play(sound: PlayableSound) {
    const engine = getSoundEngine();
    engine.unlock(); // inside the tap: allowed everywhere
    void engine.play(sound);
  }

  return (
    <section aria-label={t("sounds.title")} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <Button
            key={item.id}
            variant="secondary"
            className="h-16 min-h-16 px-2 text-base leading-tight whitespace-normal"
            onClick={() => play(item.sound)}
          >
            {item.label}
          </Button>
        ))}
        {manageHref && (
          <Link
            href={manageHref}
            className="flex h-16 min-h-16 items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 text-sm font-medium text-muted-foreground hover:bg-muted/60"
          >
            <Plus className="size-4" aria-hidden />
            {t("sounds.addSound")}
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={muted ? t("sounds.unmute") : t("sounds.mute")}
          aria-pressed={muted}
          onClick={() => {
            const next = !muted;
            getSoundEngine().setMuted(next);
            setMuted(next);
          }}
        >
          {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
        </Button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label={t("sounds.volume")}
          disabled={muted}
          onChange={(e) => {
            const v = Number(e.target.value);
            getSoundEngine().setVolume(v);
            setVolume(v);
          }}
          className="h-11 flex-1 accent-primary"
        />
        {loaded && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {loaded.failed > 0 ? (
              <>
                <CloudOff className="size-3.5" aria-hidden />
                {t("sounds.notLoaded", { count: loaded.failed })}
              </>
            ) : (
              <>
                <Download className="size-3.5" aria-hidden />
                {t("sounds.onPhone")}
              </>
            )}
          </span>
        )}
      </div>
    </section>
  );
}
