// The renderer's one store. Fed by window.orchestra: sessionList, sessionGet and the events push.
import { create } from 'zustand';
import type { OrchestraApi, RepoPickResult } from '../../shared/ipc';
import type { OrchestraEvent } from '../../shared/events';
import type { Session, SetupReport } from '../../shared/types';
import { applyToSessions, mergeEvents, sortSessions } from './merge';

export type View = { kind: 'home' } | { kind: 'session'; id: string };

export interface AppState {
  view: View;
  setup: SetupReport | null;
  setupChecking: boolean;
  sessions: Session[];
  events: Record<string, OrchestraEvent[]>;
  /** sessionGet still pending for these ids (C6 skeleton) */
  loading: Record<string, boolean>;
  repo: RepoPickResult | null;
  sending: boolean;
  panelOpen: boolean;

  init(): Promise<void>;
  recheck(): Promise<void>;
  pickRepo(): Promise<void>;
  setRepo(repo: RepoPickResult | null): void;
  send(task: string): Promise<void>;
  goHome(): void;
  openSession(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  togglePanel(open?: boolean): void;
  refreshSessions(): Promise<void>;
}

const api = (): OrchestraApi => window.orchestra;
let unsubscribe: (() => void) | null = null;

export const useApp = create<AppState>((set, get) => ({
  view: { kind: 'home' },
  setup: null,
  setupChecking: false,
  sessions: [],
  events: {},
  loading: {},
  repo: null,
  sending: false,
  panelOpen: false,

  async init() {
    if (!unsubscribe) {
      unsubscribe = api().onEvents(({ sessionId, events }) => {
        const known = get().sessions.some((s) => s.id === sessionId);
        set((s) => ({
          events: { ...s.events, [sessionId]: mergeEvents(s.events[sessionId] ?? [], events) },
          sessions: applyToSessions(s.sessions, sessionId, events),
        }));
        if (!known) void get().refreshSessions();
      });
    }
    await Promise.all([get().refreshSessions(), get().recheck()]);
  },

  async recheck() {
    set({ setupChecking: true });
    try {
      const report = await api().setupCheck(get().setup !== null);
      set({ setup: report });
    } finally {
      set({ setupChecking: false });
    }
  },

  async refreshSessions() {
    const list = await api().sessionList();
    set({ sessions: sortSessions(list) });
  },

  async pickRepo() {
    const picked = await api().repoPick();
    if (picked) set({ repo: picked });
  },

  setRepo(repo) { set({ repo }); },

  async send(task) {
    const { repo, sending } = get();
    const text = task.trim();
    if (!text || !repo?.isGitRepo || sending) return;
    set({ sending: true });
    try {
      const session = await api().sessionCreate({ repoPath: repo.path, task: text });
      set((s) => ({
        sessions: sortSessions([session, ...s.sessions.filter((x) => x.id !== session.id)]),
        view: { kind: 'session', id: session.id },
        panelOpen: false,
      }));
      void get().openSession(session.id);
    } finally {
      set({ sending: false });
    }
  },

  goHome() { set({ view: { kind: 'home' }, panelOpen: false }); },

  async openSession(id) {
    set((s) => ({ view: { kind: 'session', id }, loading: { ...s.loading, [id]: !s.events[id] }, panelOpen: s.view.kind === 'session' && s.view.id === id ? s.panelOpen : false }));
    try {
      const got = await api().sessionGet(id);
      if (got) {
        set((s) => {
          const merged = mergeEvents(s.events[id] ?? [], got.events);
          const list = sortSessions([got.session, ...s.sessions.filter((x) => x.id !== id)]);
          return { events: { ...s.events, [id]: merged }, sessions: applyToSessions(list, id, merged) };
        });
      }
    } finally {
      set((s) => ({ loading: { ...s.loading, [id]: false } }));
    }
  },

  async stop(id) { await api().sessionStop(id); },

  togglePanel(open) { set((s) => ({ panelOpen: open ?? !s.panelOpen })); },
}));
