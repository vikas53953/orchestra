// Spec: docs/spec/architecture.md §4 (Engine adapter LLD). Owner: lead (T1).
import type { EngineError, Role } from './types';

export type PermissionMode = 'plan' | 'acceptEdits';

export interface RunRequest {
  role: Role;
  cwd: string;
  prompt: string;
  systemAppend: string;
  allowedTools: string[];
  disallowedTools: string[];
  permissionMode: PermissionMode;
  maxTurns: number;
  timeoutMs: number;
  resumeSessionId?: string;
  /** when set, the final text must contain a JSON object valid against this check */
  outputSchema?: (value: unknown) => boolean;
}

export type EngineEvent =
  | { kind: 'started'; engineSessionId: string; model: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool_call'; tool: string; summary: string; path?: string }
  | { kind: 'tool_result'; tool: string; ok: boolean; summary: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number };

export interface RunResult {
  ok: boolean;
  finalText: string;
  json?: unknown;
  error?: EngineError;
  /** plain detail for the error, e.g. the usage-limit reset time from the CLI */
  errorDetail?: string;
  durationMs: number;
}

export interface ProbeResult {
  installed: boolean;
  version: string | null;
  signedIn: boolean | null; // null = not probed
  /** stream-json fields this build relies on were present */
  supportsStreamJson: boolean | null;
}

export interface Engine {
  id: 'claude-code' | 'cassette';
  probe(opts?: { signedIn?: boolean }): Promise<ProbeResult>;
  run(req: RunRequest, onEvent: (e: EngineEvent) => void, signal: AbortSignal): Promise<RunResult>;
}
