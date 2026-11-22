// Pure helpers the store uses to fold pushed events into what it already holds.
import type { OrchestraEvent } from '../../shared/events';
import type { Session } from '../../shared/types';

/** Append events not seen yet (by seq), keeping seq order. */
export function mergeEvents(have: readonly OrchestraEvent[], incoming: readonly OrchestraEvent[]): OrchestraEvent[] {
  const seen = new Set(have.map((e) => e.seq));
  const fresh = incoming.filter((e) => !seen.has(e.seq));
  if (!fresh.length) return have as OrchestraEvent[];
  return [...have, ...fresh].sort((a, b) => a.seq - b.seq);
}

/** Newest first: a new session appears at the top of "Your sessions". */
export function sortSessions(list: readonly Session[]): Session[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

/** Apply state changes carried by events to the session list. */
export function applyToSessions(list: readonly Session[], sessionId: string, events: readonly OrchestraEvent[]): Session[] {
  let state: Session['state'] | null = null;
  let updatedAt = 0;
  for (const e of events) {
    if (e.type === 'session.state') { state = e.payload.state; updatedAt = e.ts; }
    if (e.type === 'session.stopped') { state = 'stopped'; updatedAt = e.ts; }
  }
  if (!state) return list as Session[];
  return list.map((s) => (s.id === sessionId ? { ...s, state: state!, updatedAt: Math.max(s.updatedAt, updatedAt) } : s));
}

/** Folder name from a path, for the repo chip and meta line. */
export function folderName(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
