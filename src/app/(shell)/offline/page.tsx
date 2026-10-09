import type { Metadata } from "next";
import { OfflineMessage } from "@/components/offline-message";

// Static (precached), so the title can't follow the language; the page text does.
export const metadata: Metadata = { title: "Нет сети" };

// Precached by the service worker; shown for any page that can't load offline.
export default function OfflinePage() {
  return <OfflineMessage />;
}
