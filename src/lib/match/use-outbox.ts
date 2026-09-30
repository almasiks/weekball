"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { del, get, set } from "idb-keyval";
import { createClient } from "@/lib/supabase/client";
import { toMessage } from "@/lib/errors";
import { OutboxQueue, shouldRetry, type QueueItem, type QueueStorage, type SendResult } from "./queue";

function idbStorage(key: string): QueueStorage {
  return {
    async load() {
      try {
        return ((await get(key)) as QueueItem[] | undefined) ?? [];
      } catch {
        return []; // private mode / blocked storage: queue lives in memory only
      }
    },
    async save(items) {
      try {
        if (items.length) await set(key, items);
        else await del(key);
      } catch {}
    },
  };
}

async function sendItem(supabase: ReturnType<typeof createClient>, item: QueueItem): Promise<SendResult> {
  let error: { code?: string; message?: string } | null = null;
  if (item.kind === "event") {
    ({ error } = await supabase.rpc("add_event", { payload: item.payload }));
  } else if (item.kind === "void") {
    ({ error } = await supabase.rpc("void_event", { p_event_id: item.eventId }));
  } else {
    const base = { p_match_id: item.matchId, p_client_ts: item.clientTs };
    const cmd = item.command;
    ({ error } =
      cmd.kind === "start"
        ? await supabase.rpc("timer_start", base)
        : cmd.kind === "pause"
          ? await supabase.rpc("timer_pause", base)
          : cmd.kind === "resume"
            ? await supabase.rpc("timer_resume", base)
            : cmd.kind === "break"
              ? await supabase.rpc("timer_break", { ...base, p_period: cmd.period })
              : cmd.kind === "next_period"
                ? await supabase.rpc("timer_next_period", { ...base, p_period: cmd.period })
                : await supabase.rpc("finish_match", { ...base, p_reason: cmd.reason ?? "manual" }));
  }
  if (!error) return { ok: true };
  return { ok: false, retry: shouldRetry(error), error: toMessage(error) };
}

/**
 * Persistent outbox for one game. Items are sent in order; the UI renders
 * `overlay` (pending + just-sent items) on top of server data until the next refresh.
 */
export function useOutbox(gameId: string, onSent: () => void, serverVersion: unknown) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [sent, setSent] = useState<QueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const queueRef = useRef<OutboxQueue | null>(null);
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  }, [onSent]);

  useEffect(() => {
    const supabase = createClient();
    const queue = new OutboxQueue(
      idbStorage(`weekball:outbox:${gameId}`),
      (item) => sendItem(supabase, item),
      (item) => {
        setSent((s) => [...s, item]);
        onSentRef.current();
      },
    );
    queueRef.current = queue;
    const unsubscribe = queue.subscribe(setItems);
    queue.init().then(() => queue.flush());

    const flush = () => queue.flush();
    const updateOnline = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) flush();
    };
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const timer = setInterval(flush, 3000);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, [gameId]);

  // Fresh server data includes everything sent so far: drop the "just sent" overlay.
  const [seenVersion, setSeenVersion] = useState(serverVersion);
  if (seenVersion !== serverVersion) {
    setSeenVersion(serverVersion);
    setSent([]);
  }

  const enqueue = useCallback(async (item: QueueItem) => {
    await queueRef.current?.enqueue(item);
    queueRef.current?.flush();
  }, []);
  const update = useCallback(async (id: string, patch: (i: QueueItem) => QueueItem) => {
    await queueRef.current?.update(id, patch);
    queueRef.current?.flush();
  }, []);
  const remove = useCallback((id: string) => queueRef.current?.remove(id), []);

  const pending = items.filter((i) => i.status === "pending");
  const rejected = items.filter((i) => i.status === "rejected");
  return { overlay: [...sent, ...pending], pending, rejected, online, enqueue, update, remove };
}
