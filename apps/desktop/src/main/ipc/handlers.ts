// IPC handlers for Sprint 0 (architecture.md §8). plan/review/diff channels are not registered yet. Owner: T3.
import { basename } from 'node:path';
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { IPC, type RepoPickResult, type SessionWithEvents } from '../../shared/ipc';
import type { Session, SetupReport } from '../../shared/types';
import type { Conductor } from '../conductor/ask';
import { repoTopLevel } from '../conductor/git';
import type { SetupChecker } from '../setup/check';
import type { Store } from '../store';
import {
  IpcValidationError, validateNoArg, validateSessionCreate, validateSessionGet, validateSessionStop, validateSetupCheck,
} from './validate';

export interface IpcDeps {
  store: Store;
  conductor: Conductor;
  checker: SetupChecker;
  window: () => BrowserWindow | null;
  /** file:// URL of the app page; only that page may call in */
  appUrl: string;
}

export const SPRINT0_CHANNELS = [
  IPC.setupCheck, IPC.repoPick, IPC.sessionCreate, IPC.sessionList, IPC.sessionGet, IPC.sessionStop,
] as const;

function assertTrusted(e: IpcMainInvokeEvent, appUrl: string): void {
  const url = e.senderFrame?.url ?? '';
  if (url.split('#')[0] !== appUrl) throw new IpcValidationError('untrusted sender');
}

export function registerIpc(d: IpcDeps): () => void {
  ipcMain.handle(IPC.setupCheck, async (e, arg: unknown): Promise<SetupReport> => {
    assertTrusted(e, d.appUrl);
    return d.checker.check(validateSetupCheck(arg));
  });

  ipcMain.handle(IPC.repoPick, async (e, arg: unknown): Promise<RepoPickResult | null> => {
    assertTrusted(e, d.appUrl);
    validateNoArg(arg, IPC.repoPick);
    const win = d.window();
    const opts = { properties: ['openDirectory' as const] };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const path = r.canceled ? undefined : r.filePaths[0];
    if (!path) return null;
    return { path, name: basename(path), isGitRepo: (await repoTopLevel(path)) !== null };
  });

  ipcMain.handle(IPC.sessionCreate, async (e, arg: unknown): Promise<Session> => {
    assertTrusted(e, d.appUrl);
    return d.conductor.createSession(validateSessionCreate(arg));
  });

  ipcMain.handle(IPC.sessionList, async (e, arg: unknown): Promise<Session[]> => {
    assertTrusted(e, d.appUrl);
    validateNoArg(arg, IPC.sessionList);
    return d.store.listSessions();
  });

  ipcMain.handle(IPC.sessionGet, async (e, arg: unknown): Promise<SessionWithEvents | null> => {
    assertTrusted(e, d.appUrl);
    const id = validateSessionGet(arg);
    const session = d.store.getSession(id);
    return session ? { session, events: d.store.eventsFor(id) } : null;
  });

  ipcMain.handle(IPC.sessionStop, async (e, arg: unknown): Promise<void> => {
    assertTrusted(e, d.appUrl);
    await d.conductor.stop(validateSessionStop(arg));
  });

  return () => { for (const ch of SPRINT0_CHANNELS) ipcMain.removeHandler(ch); };
}
