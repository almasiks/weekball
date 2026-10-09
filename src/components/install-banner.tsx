"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

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
  const t = useT();
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
    // Floating above the bottom navigation: it appears after load, so it must not
    // push the page content (layout shift).
    <aside
      aria-label={t("install.label")}
      className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-lg"
    >
      <span aria-hidden className="text-2xl">⚽</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t("install.title")}</p>
        {iosHint && !prompt ? (
          <p className="text-muted-foreground">
            {t("install.iosBefore")}{" "}
            <Share className="inline size-4 align-text-bottom" aria-label={t("install.iosShare")} />{" "}
            {t("install.iosAfter")}
          </p>
        ) : (
          <p className="text-muted-foreground">{t("install.hint")}</p>
        )}
      </div>
      {prompt && (
        <Button className="shrink-0" onClick={install}>
          <Download aria-hidden />
          {t("install.button")}
        </Button>
      )}
      <Button variant="ghost" size="icon" className="shrink-0" aria-label={t("common.close")} onClick={dismiss}>
        <X aria-hidden />
      </Button>
    </aside>
  );
}
