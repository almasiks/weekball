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
import { BUILTIN_SOUNDS, checkSoundFile, type BuiltinKey } from "@/lib/sounds/builtin";
import { getSoundEngine } from "@/lib/sounds/engine";

type Props = { groupId: string; sounds: PanelSound[] };

async function fetchBytes(path: string) {
  const { data } = await createClient().storage.from("sounds").download(path);
  return data ? data.arrayBuffer() : null;
}

// Organizer: own sound files (Supabase Storage "sounds/<group_id>/…").
// Uploads go straight from the browser; Storage + table RLS allow organizers only.
export function SoundsManager({ groupId, sounds }: Props) {
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
    void engine.play(key ? builtinSound(key, sounds) : { key: sound!.id, filePath: sound!.file_path });
  }

  async function remove(sound: PanelSound): Promise<string | null> {
    const supabase = createClient();
    const { error: rowError } = await supabase.from("sounds").delete().eq("id", sound.id);
    if (rowError) return "Не удалось удалить звук.";
    await supabase.storage.from("sounds").remove([sound.file_path]);
    return null;
  }

  function upload() {
    const file = fileRef.current?.files?.[0];
    const label = target ? BUILTIN_SOUNDS.find((b) => b.key === target)!.label : name.trim();
    if (!file) return setError("Выберите аудиофайл.");
    if (!label || label.length > 30) return setError("Название кнопки — от 1 до 30 символов.");
    const checked = checkSoundFile(file);
    if (typeof checked === "string") return setError(checked);

    run(async () => {
      const supabase = createClient();
      const path = `${groupId}/${crypto.randomUUID()}.${checked.ext}`;
      const { error: uploadError } = await supabase.storage
        .from("sounds")
        .upload(path, file, { contentType: checked.contentType });
      if (uploadError) return "Не удалось загрузить файл. Проверьте формат и размер (до 2 МБ).";

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
        return "Не удалось сохранить звук.";
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
      return r1.error || r2.error ? "Не удалось изменить порядок." : null;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Загрузить звук</CardTitle>
          <CardDescription>mp3, m4a или wav до 2 МБ. Кнопка появится на экране матча.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sound-file">Аудиофайл</Label>
            <input
              id="sound-file"
              ref={fileRef}
              type="file"
              accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
              className="min-h-11 text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:font-medium"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sound-target">Куда</Label>
            <select
              id="sound-target"
              className={selectClassName}
              value={target}
              onChange={(e) => setTarget(e.target.value as "" | BuiltinKey)}
            >
              <option value="">Новая кнопка</option>
              {BUILTIN_SOUNDS.map((b) => (
                <option key={b.key} value={b.key}>
                  Заменить «{b.label}»
                </option>
              ))}
            </select>
          </div>
          {!target && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="sound-name">Название кнопки</Label>
              <Input
                id="sound-name"
                maxLength={30}
                placeholder="Например, «Гол!»"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          {error && <Notice variant="error">{error}</Notice>}
          <Button size="lg" disabled={pending} onClick={upload}>
            <Upload aria-hidden />
            {pending ? "Загружаю…" : "Загрузить"}
          </Button>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Встроенные звуки</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {BUILTIN_SOUNDS.map((b) => {
              const own = overrides.get(b.key);
              return (
                <li key={b.key} className="flex min-h-12 items-center gap-2 py-1.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{b.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {own ? "свой файл" : b.kind === "speech" ? "голос телефона" : "синтезированный свисток"}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" aria-label={`Прослушать «${b.label}»`} onClick={() => preview(own ?? null, b.key)}>
                    <Play aria-hidden />
                  </Button>
                  {own && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Вернуть встроенный «${b.label}»`}
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
          <CardTitle>Свои кнопки</CardTitle>
        </CardHeader>
        <CardContent>
          {custom.length === 0 ? (
            <p className="text-sm text-muted-foreground">Своих звуков пока нет.</p>
          ) : (
            <ul className="divide-y">
              {custom.map((s, i) => (
                <li key={s.id} className="flex min-h-12 items-center gap-1 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  <Button variant="ghost" size="icon" aria-label={`Прослушать «${s.name}»`} onClick={() => preview(s)}>
                    <Play aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Выше" disabled={pending || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Ниже"
                    disabled={pending || i === custom.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`Удалить «${s.name}»`}
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
