// Main process entry. Spec: architecture.md §3, §8-§10; PRD.md R0.2-R0.4, §4. Owner: T3.
import { app, BrowserWindow } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC, type EventsAppendPush } from '../shared/ipc';
import type { Engine } from '../shared/engine';
import { createEngine } from './engine';
import { Conductor } from './conductor/ask';
import { killAllTrackedIfPresent } from './conductor/shutdown';
import { registerIpc } from './ipc/handlers';
import { dataDir as resolveDataDir, dbPath, logsDir } from './paths';
import { createSetupChecker } from './setup/check';
import { Store } from './store';

const RENDERER_FILE = join(__dirname, '../renderer/index.html');
const PRELOAD_FILE = join(__dirname, '../preload/index.js');
const APP_URL = pathToFileURL(RENDERER_FILE).href;

let win: BrowserWindow | null = null;
let conductor: Conductor | null = null;
let store: Store | null = null;
let quitting = false;

let engine: Engine | null = null;
function getEngine(): Engine {
  if (!engine) engine = createEngine(process.env);
  return engine;
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#121212',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0E0E0E', symbolColor: '#A6A6A6', height: 40 },
    show: true,
    webPreferences: {
      preload: PRELOAD_FILE,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e, url) => { if (url.split('#')[0] !== APP_URL) e.preventDefault(); });
  w.webContents.on('will-redirect', (e, url) => { if (url.split('#')[0] !== APP_URL) e.preventDefault(); });
  w.on('closed', () => { if (win === w) win = null; });
  void w.loadFile(RENDERER_FILE);
  return w;
}

function push(p: EventsAppendPush): void {
  if (win && !win.isDestroyed()) win.webContents.send(IPC.eventsAppend, p);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-attach-webview', (e) => e.preventDefault());
  });

  void app.whenReady().then(() => {
    const dir = resolveDataDir(app.getPath('appData'));
    mkdirSync(logsDir(dir), { recursive: true });
    store = new Store(dbPath(dir));
    store.recoverInterrupted(); // J7: sessions left running show Stopped
    const checker = createSetupChecker({ engine: getEngine, dataDir: dir });
    void checker.check(); // R0.3: runs on every start; the renderer's setup:check awaits the same run
    conductor = new Conductor({ store, engine: getEngine, push });
    registerIpc({ store, conductor, checker, window: () => win, appUrl: APP_URL });
    win = createWindow();
  });

  app.on('before-quit', (e) => {
    if (quitting) return;
    quitting = true;
    e.preventDefault();
    const c = conductor;
    void (async () => {
      try {
        // AC-L1 / PRD §4: every agent process gone within 2 s of closing.
        await Promise.all([c?.stopAll(), killAllTrackedIfPresent(2000)]);
        c?.flush();
      } finally {
        store?.close();
        store = null;
        app.quit();
      }
    })();
  });

  app.on('window-all-closed', () => app.quit());
}
