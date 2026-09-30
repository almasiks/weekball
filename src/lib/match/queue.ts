// Outbox for match actions: persisted locally, sent in order, safe to retry.
// Pure logic; storage and sender are injected (IndexedDB + Supabase in the browser,
// in-memory fakes in tests).
import type { LiveEvent } from "./types";
import type { TimerCommand } from "./timer";

export type EventPayload = Omit<LiveEvent, "voided_at">;

type Base = {
  id: string; // unique per item; for events it equals the event id
  createdAt: number;
  status: "pending" | "rejected";
  error?: string;
  // Not sent before this moment (goal waiting for an optional assist).
  holdUntil?: number;
};

export type QueueItem =
  | (Base & { kind: "event"; matchId: string; payload: EventPayload })
  | (Base & { kind: "void"; matchId: string; eventId: string })
  | (Base & { kind: "timer"; matchId: string; command: TimerCommand; clientTs: string });

export type SendResult = { ok: true } | { ok: false; retry: boolean; error: string };

export interface QueueStorage {
  load(): Promise<QueueItem[]>;
  save(items: QueueItem[]): Promise<void>;
}

// PostgREST / Postgres codes that mean "try again later" rather than "this is invalid".
const RETRYABLE_CODES = new Set(["PGRST301", "PGRST303", "28000", "57014", "40001", "40P01", "53300"]);

/** Network failures and auth/transient errors are retried; validation errors are rejected. */
export function shouldRetry(error: { code?: string | null; message?: string } | null | undefined): boolean {
  const code = error?.code ?? "";
  if (!code) return true; // fetch failed, offline, timeout
  if (code.startsWith("08")) return true; // connection exceptions
  return RETRYABLE_CODES.has(code);
}

export class OutboxQueue {
  private items: QueueItem[] = [];
  private flushing = false;
  private listeners = new Set<(items: QueueItem[]) => void>();

  constructor(
    private storage: QueueStorage,
    private send: (item: QueueItem) => Promise<SendResult>,
    private onSent?: (item: QueueItem) => void,
  ) {}

  async init() {
    this.items = await this.storage.load();
    this.emit();
  }

  get snapshot(): readonly QueueItem[] {
    return this.items;
  }

  subscribe(listener: (items: QueueItem[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async persist() {
    await this.storage.save(this.items);
    this.emit();
  }

  private emit() {
    const copy = [...this.items];
    this.listeners.forEach((l) => l(copy));
  }

  /** Adds an item; an id that is already queued is ignored (no duplicates). */
  async enqueue(item: QueueItem) {
    if (this.items.some((i) => i.id === item.id)) return;
    this.items = [...this.items, item];
    await this.persist();
  }

  /** Changes a pending item before it is sent (e.g. adds the assist to a held goal). */
  async update(id: string, patch: (item: QueueItem) => QueueItem) {
    this.items = this.items.map((i) => (i.id === id && i.status === "pending" ? patch(i) : i));
    await this.persist();
  }

  /** Removes an item that has not been sent yet (undo) or a rejected one (dismiss). */
  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
  }

  /**
   * Sends pending items strictly in order. Stops at the first retryable failure
   * (keeps order); a rejected item is marked and skipped so it never blocks the rest.
   */
  async flush(now = Date.now()): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (;;) {
        const next = this.items.find((i) => i.status === "pending");
        if (!next) return;
        if (next.holdUntil && next.holdUntil > now) return;

        let result: SendResult;
        try {
          result = await this.send(next);
        } catch (error) {
          result = { ok: false, retry: true, error: String(error) };
        }

        if (result.ok) {
          this.items = this.items.filter((i) => i.id !== next.id);
          await this.persist();
          this.onSent?.(next);
        } else if (result.retry) {
          return;
        } else {
          this.items = this.items.map((i) =>
            i.id === next.id ? { ...i, status: "rejected", error: result.error } : i,
          );
          await this.persist();
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}

export function memoryStorage(initial: QueueItem[] = []): QueueStorage & { data: QueueItem[] } {
  const store = {
    data: initial,
    async load() {
      return [...store.data];
    },
    async save(items: QueueItem[]) {
      store.data = [...items];
    },
  };
  return store;
}
