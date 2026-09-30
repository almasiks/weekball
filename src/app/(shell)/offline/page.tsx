import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { RetryButton } from "@/components/retry-button";

export const metadata: Metadata = { title: "Нет сети" };

// Precached by the service worker; shown for any page that can't load offline.
export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center gap-4 pt-10 text-center">
      <WifiOff className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">Нет подключения к интернету</h1>
      <p className="text-muted-foreground">
        Эта страница откроется, когда появится сеть. Если вы вели матч — откройте страницу матча:
        она работает и без интернета, если уже открывалась на этом телефоне.
      </p>
      <RetryButton />
    </div>
  );
}
