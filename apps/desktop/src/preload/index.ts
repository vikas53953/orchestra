// Preload: exposes window.orchestra (OrchestraApi). Runs sandboxed, so it may only require 'electron':
// shared/ipc is imported for types only, and CH is checked against IPC's literal channel names. Owner: T3.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { EventsAppendPush, IPC, OrchestraApi } from '../shared/ipc';

const CH: Pick<typeof IPC, 'setupCheck' | 'repoPick' | 'sessionCreate' | 'sessionList' | 'sessionGet' | 'sessionStop' | 'eventsAppend'> = {
  setupCheck: 'setup:check',
  repoPick: 'repo:pick',
  sessionCreate: 'session:create',
  sessionList: 'session:list',
  sessionGet: 'session:get',
  sessionStop: 'session:stop',
  eventsAppend: 'events:append',
};

const api: OrchestraApi = {
  setupCheck: (force) => ipcRenderer.invoke(CH.setupCheck, force === true),
  repoPick: () => ipcRenderer.invoke(CH.repoPick),
  sessionCreate: (req) => ipcRenderer.invoke(CH.sessionCreate, { repoPath: req.repoPath, task: req.task }),
  sessionList: () => ipcRenderer.invoke(CH.sessionList),
  sessionGet: (id) => ipcRenderer.invoke(CH.sessionGet, { id }),
  sessionStop: (id) => ipcRenderer.invoke(CH.sessionStop, { sessionId: id }),
  onEvents: (cb) => {
    const listener = (_e: IpcRendererEvent, push: EventsAppendPush): void => cb(push);
    ipcRenderer.on(CH.eventsAppend, listener);
    return () => { ipcRenderer.removeListener(CH.eventsAppend, listener); };
  },
};

contextBridge.exposeInMainWorld('orchestra', api);
