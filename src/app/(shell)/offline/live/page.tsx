import type { Metadata } from "next";
import { OfflineLiveShell } from "@/components/live/offline-live-shell";

export const metadata: Metadata = { title: "Матч (без сети)" };

// Precached static shell. The service worker serves it for /game/<id>/live when
// the network is down; the client part restores the match from IndexedDB.
export default function OfflineLivePage() {
  return <OfflineLiveShell />;
}
