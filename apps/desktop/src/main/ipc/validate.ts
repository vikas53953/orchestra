// Pure argument validators for IPC commands (architecture.md §8, §10). Anything else is rejected. Owner: T3.
import { posix, win32 } from 'node:path';
import { IPC_ERROR_PREFIX, type SessionCreateRequest } from '../../shared/ipc';

export const MAX_TASK_CHARS = 100_000;
export const MAX_PATH_CHARS = 4_096;
export const MAX_ID_CHARS = 128;

export class IpcValidationError extends Error {
  constructor(what: string) {
    super(`${IPC_ERROR_PREFIX}bad_request ${what}`);
    this.name = 'IpcValidationError';
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function onlyKeys(o: Record<string, unknown>, keys: string[], what: string): void {
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new IpcValidationError(`${what}: unexpected field ${k}`);
}

export function isAbsolutePath(p: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' ? win32.isAbsolute(p) && /^([a-zA-Z]:[\\/]|\\\\)/.test(p) : posix.isAbsolute(p);
}

/** setup:check takes nothing or a boolean `force`. */
export function validateSetupCheck(arg: unknown): boolean {
  if (arg === undefined || arg === null) return false;
  if (typeof arg === 'boolean') return arg;
  throw new IpcValidationError('setup:check: force must be a boolean');
}

/** repo:pick, session:list take no argument. */
export function validateNoArg(arg: unknown, channel: string): void {
  if (arg !== undefined && arg !== null) throw new IpcValidationError(`${channel}: takes no argument`);
}

export function validateSessionCreate(arg: unknown, platform: NodeJS.Platform = process.platform): SessionCreateRequest {
  if (!isPlainObject(arg)) throw new IpcValidationError('session:create: expected {repoPath, task}');
  onlyKeys(arg, ['repoPath', 'task'], 'session:create');
  const { repoPath, task } = arg;
  if (typeof repoPath !== 'string' || repoPath.length === 0 || repoPath.length > MAX_PATH_CHARS
    || repoPath.includes('\0') || !isAbsolutePath(repoPath, platform)) {
    throw new IpcValidationError('session:create: repoPath must be an absolute folder path');
  }
  if (typeof task !== 'string' || task.length > MAX_TASK_CHARS || task.includes('\0')) {
    throw new IpcValidationError('session:create: task must be text');
  }
  if (task.trim() === '') throw new IpcValidationError('session:create: task is empty');
  return { repoPath, task };
}

function validateId(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(v)) throw new IpcValidationError(`${what}: bad id`);
  return v;
}

/** session:get {id} */
export function validateSessionGet(arg: unknown): string {
  if (!isPlainObject(arg)) throw new IpcValidationError('session:get: expected {id}');
  onlyKeys(arg, ['id'], 'session:get');
  return validateId(arg.id, 'session:get');
}

/** session:stop {sessionId} */
export function validateSessionStop(arg: unknown): string {
  if (!isPlainObject(arg)) throw new IpcValidationError('session:stop: expected {sessionId}');
  onlyKeys(arg, ['sessionId'], 'session:stop');
  return validateId(arg.sessionId, 'session:stop');
}
