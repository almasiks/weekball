"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clockOffset } from "./timer";

/** Re-renders every `intervalMs` so clocks tick locally. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Server − device clock difference, measured once (best of 3 round trips). */
export function useServerOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      let best: { rtt: number; offset: number } | null = null;
      for (let i = 0; i < 3; i++) {
        const sent = Date.now();
        const { data, error } = await supabase.rpc("server_time");
        const received = Date.now();
        if (error || !data) continue;
        const rtt = received - sent;
        if (!best || rtt < best.rtt) best = { rtt, offset: clockOffset(data, sent, received) };
      }
      if (!cancelled && best) setOffset(best.offset);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return offset;
}

/** Keeps the screen on while `active`. Returns false when the API is unavailable. */
export function useWakeLock(active: boolean): boolean {
  const [supported] = useState(() => typeof navigator !== "undefined" && "wakeLock" in navigator);
  useEffect(() => {
    if (!active || !supported) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Denied (battery saver, not visible) — retried on visibility change.
      }
    };
    // The lock is dropped when the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active, supported]);
  return supported;
}

/** One short vibration + beep. */
export function signalTimeUp() {
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {}
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {}
}
