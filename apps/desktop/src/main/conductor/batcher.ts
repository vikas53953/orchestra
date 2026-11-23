// Batches persisted events per session and pushes them to the renderer every 50 ms (architecture.md §8).
import type { OrchestraEvent } from '../../shared/events';
import type { EventsAppendPush } from '../../shared/ipc';

export const PUSH_BATCH_MS = 50;

export class EventBatcher {
  private readonly pending = new Map<string, OrchestraEvent[]>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly push: (p: EventsAppendPush) => void, private readonly intervalMs = PUSH_BATCH_MS) {}

  add(events: OrchestraEvent[]): void {
    for (const e of events) {
      const list = this.pending.get(e.sessionId);
      if (list) list.push(e); else this.pending.set(e.sessionId, [e]);
    }
    if (!this.timer && this.pending.size > 0) this.timer = setTimeout(() => this.flush(), this.intervalMs);
  }

  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const batches = [...this.pending.entries()];
    this.pending.clear();
    for (const [sessionId, events] of batches) {
      try { this.push({ sessionId, events }); } catch { /* window gone: events stay in the store */ }
    }
  }
}
