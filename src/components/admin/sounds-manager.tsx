"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Play, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/notice";
import { selectClassName } from "@/components/schedule/schedule-form";
import { builtinSound, type PanelSound } from "@/components/live/sound-panel";
import { createClient } from "@/lib/supabase/client";
import { BUILTIN_SOUNDS, builtinLabel, checkSoundFile, type BuiltinKey } from "@/lib/sounds/builtin";
import { getSoundEngine } from "@/lib/sounds/engine";
import { useT } from "@/lib/i18n/client";

type Props = { groupId: string; sounds: PanelSound[] };

async function fetchBytes(path: string) {
  const { data } = await createClient().storage.from("sounds").download(path);
  return data ? data.arrayBuffer() : null;
}

// Organizer: own sound files (Supabase Storage "sounds/<group_id>/…").
// Uploads go straight from the browser; Storage + table RLS allow organizers only.
export function SoundsManager({ groupId, sounds }: Props) {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<"" | BuiltinKey>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const custom = sounds.filter((s) => !s.builtin_key).sort((a, b) => a.sort_order - b.sort_order);
  const overrides = new Map(sounds.filter((s) => s.builtin_key).map((s) => [s.builtin_key!, s]));

  function run(task: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      const message = await task();
      if (message) setError(message);
      else router.refresh();
    });
  }

  async function preview(sound: PanelSound | null, key?: BuiltinKey) {
    const engine = getSoundEngine();
    engine.unlock();
    if (sound) await engine.preload(sound.file_path, () => fetchBytes(sound.file_path));
    void engine.play(key ? builtinSound(key, sounds, t) : { key: sound!.id, filePath: sound!.file_path });
  }

  async function remove(sound: PanelSound): Promise<string | null> {
    const supabase = createClient();
    const { error: rowError } = await supabase.from("sounds").delete().eq("id", sound.id);
    if (rowError) return t("sounds.error.deleteFailed");
    await supabase.storage.from("sounds").remove([sound.file_path]);
    return null;
  }

  function upload() {
    const file = fileRef.current?.files?.[0];
    const label = target ? builtinLabel(t, target) : name.trim();
    if (!file) return setError(t("sounds.error.pickFile"));
    if (!label || label.length > 30) return setError(t("sounds.error.nameLength"));
    const checked = checkSoundFile(file);
    if (typeof checked === "string") return setError(t(checked));

    run(async () => {
      const supabase = createClient();
      const path = `${groupId}/${crypto.randomUUID()}.${checked.ext}`;
      const { error: uploadError } = await supabase.storage
        .from("sounds")
        .upload(path, file, { contentType: checked.contentType });
      if (uploadError) return t("sounds.error.uploadFailed");

      const replaced = target ? overrides.get(target) : undefined;
      if (replaced) await remove(replaced);

      const { error: insertError } = await supabase.from("sounds").insert({
        group_id: groupId,
        name: label,
        file_path: path,
        builtin_key: target || null,
        sort_order: target ? 0 : Math.max(-1, ...custom.map((s) => s.sort_order)) + 1,
      });
      if (insertError) {
        await supabase.storage.from("sounds").remove([path]);
        return t("sounds.error.saveFailed");
      }
      setName("");
      setTarget("");
      if (fileRef.current) fileRef.current.value = "";
      return null;
    });
  }

  function move(index: number, delta: -1 | 1) {
    const a = custom[index];
    const b = custom[index + delta];
    if (!a || !b) return;
    run(async () => {
      const supabase = createClient();
      // Swap positions (indexes keep the order stable even if sort_order repeats).
      const [r1, r2] = await Promise.all([
        supabase.from("sounds").update({ sort_order: index + delta }).eq("id", a.id),
        supabase.from("sounds").update({ sort_order: index }).eq("id", b.id),
      ]);
      return r1.error || r2.error ? t("sounds.error.orderFailed") : null;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("sounds.uploadTitle")}</CardTitle>
          <CardDescription>{t("sounds.uploadText")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sound-file">{t("sounds.file")}</Label>
            <input
              id="sound-file"
              ref={fileRef}
              type="file"
              accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
              className="min-h-11 text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:font-medium"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sound-target">{t("sounds.target")}</Label>
            <select
              id="sound-target"
              className={selectClassName}
              value={target}
              onChange={(e) => setTarget(e.target.value as "" | BuiltinKey)}
            >
              <option value="">{t("sounds.newButton")}</option>
              {BUILTIN_SOUNDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {t("sounds.replace", { name: builtinLabel(t, b.key) })}
                </option>
              ))}
            </select>
          </div>
          {!target && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="sound-name">{t("sounds.buttonName")}</Label>
              <Input
                id="sound-name"
                maxLength={30}
                placeholder={t("sounds.buttonPlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          {error && <Notice variant="error">{error}</Notice>}
          <Button size="lg" disabled={pending} onClick={upload}>
            <Upload aria-hidden />
            {pending ? t("sounds.uploading") : t("sounds.upload")}
          </Button>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("sounds.builtinTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {BUILTIN_SOUNDS.map((b) => {
              const own = overrides.get(b.key);
              return (
                <li key={b.key} className="flex min-h-12 items-center gap-2 py-1.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{builtinLabel(t, b.key)}</span>
                    <span className="text-xs text-muted-foreground">
                      {own ? t("sounds.ownFile") : b.kind === "speech" ? t("sounds.phoneVoice") : t("sounds.synthWhistle")}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" aria-label={t("sounds.listen", { name: builtinLabel(t, b.key) })} onClick={() => preview(own ?? null, b.key)}>
                    <Play aria-hidden />
                  </Button>
                  {own && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("sounds.restore", { name: builtinLabel(t, b.key) })}
                      disabled={pending}
                      onClick={() => run(() => remove(own))}
                    >
                      <RotateCcw aria-hidden />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("sounds.customTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {custom.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sounds.customEmpty")}</p>
          ) : (
            <ul className="divide-y">
              {custom.map((s, i) => (
                <li key={s.id} className="flex min-h-12 items-center gap-1 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  <Button variant="ghost" size="icon" aria-label={t("sounds.listen", { name: s.name })} onClick={() => preview(s)}>
                    <Play aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={t("sounds.up")} disabled={pending || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("sounds.down")}
                    disabled={pending || i === custom.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={t("sounds.delete", { name: s.name })}
                    disabled={pending}
                    onClick={() => run(() => remove(s))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
