"use client";

import { get, set } from "idb-keyval";
import type { LiveEvent, LiveMatch, LiveTeam } from "./types";
import type { PanelSound } from "@/components/live/sound-panel";

// Last known server state of the organizer console, kept on this device only
// (IndexedDB, not the service-worker cache) so the console can open offline.
export type LiveSnapshot = {
  gameId: string;
  savedAt: number;
  meta: {
    startsAt: string;
    timezone: string;
    place: string;
    // Game format (older snapshots may not have it).
    goalLimit?: number | null;
    matchMinutes?: number;
    autoSounds?: boolean;
  };
  // Sound buttons of the group (files themselves are cached separately).
  sounds?: PanelSound[];
  gameStatus: string;
  teams: LiveTeam[];
  matches: LiveMatch[];
  events: LiveEvent[];
  names: Record<string, string>;
  siteUrl: string;
  offset: number;
};

const key = (gameId: string) => `weekball:snapshot:${gameId}`;

export async function saveSnapshot(snapshot: LiveSnapshot) {
  try {
    await set(key(snapshot.gameId), snapshot);
  } catch {
    // Storage unavailable (private mode): offline reopening just won't work.
  }
}

export async function loadSnapshot(gameId: string): Promise<LiveSnapshot | null> {
  try {
    return ((await get(key(gameId))) as LiveSnapshot | undefined) ?? null;
  } catch {
    return null;
  }
}
