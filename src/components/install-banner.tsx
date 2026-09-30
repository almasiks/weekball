"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "weekball:install-dismissed";

function isDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// "Установить приложение": Android/Chrome via beforeinstallprompt, iOS via a hint.
export function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || isDismissed()) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos) {
      queueMicrotask(() => {
        setIosHint(true);
        setHidden(false);
      });
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome === "accepted") setHidden(true);
  }

  if (hidden || (!prompt && !iosHint)) return null;

  return (
    <aside
      aria-label="Установка приложения"
      className="mb-4 flex items-center gap-3 rounded-xl border bg-card p-3 text-sm"
    >
      <span aria-hidden className="text-2xl">⚽</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Установите приложение</p>
        {iosHint && !prompt ? (
          <p className="text-muted-foreground">
            Нажмите <Share className="inline size-4 align-text-bottom" aria-label="«Поделиться»" /> →
            «На экран „Домой“».
          </p>
        ) : (
          <p className="text-muted-foreground">Откроется с экрана телефона, как обычное приложение.</p>
        )}
      </div>
      {prompt && (
        <Button className="shrink-0" onClick={install}>
          <Download aria-hidden />
          Установить
        </Button>
      )}
      <Button variant="ghost" size="icon" className="shrink-0" aria-label="Закрыть" onClick={dismiss}>
        <X aria-hidden />
      </Button>
    </aside>
  );
}
