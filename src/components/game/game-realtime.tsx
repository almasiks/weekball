"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Re-renders the server components when this game or its signups change.
export function GameRealtime({ gameId }: { gameId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const refresh = () => {
      clearTimeout(timer);
      // Offline, a failed RSC refresh makes Next fall back to a full page reload
      // (which would throw the organizer out of the console). Wait for "online".
      if (!navigator.onLine) return;
      timer = setTimeout(() => navigator.onLine && router.refresh(), 50);
    };

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signups", filter: `game_id=eq.${gameId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `game_id=eq.${gameId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `game_id=eq.${gameId}` },
        refresh,
      )
      // SUBSCRIBED fires before Postgres changes are actually streamed; this system
      // message marks the real start. Refresh once to catch changes made in between.
      .on("system", {}, (payload: { extension?: string; status?: string }) => {
        if (payload.extension === "postgres_changes" && payload.status === "ok") refresh();
      });

    // Realtime evaluates RLS with the user's JWT, so pass it before subscribing.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });

    // Phones drop websockets in the background: catch up when the tab returns.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      supabase.removeChannel(channel);
    };
  }, [gameId, router]);

  return null;
}
