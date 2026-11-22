// Spec: docs/spec/architecture.md §7 (event types are canonical). Owner: lead (T1).
import type { Role, SessionState, EngineError } from './types';

interface Base { seq: number; sessionId: string; runId: string | null; ts: number }

export type OrchestraEvent = Base & (
  | { type: 'session.created'; payload: { title: string; task: string; repoPath: string } }
  | { type: 'session.state'; payload: { state: SessionState } }
  | { type: 'plan.proposed'; payload: { plan: unknown } }
  | { type: 'plan.approved'; payload: Record<string, never> }
  | { type: 'plan.change_requested'; payload: { note: string } }
  | { type: 'run.started'; payload: { role: Role; model: string | null } }
  | { type: 'run.text'; payload: { role: Role; text: string } }
  | { type: 'run.tool_call'; payload: { role: Role; tool: string; summary: string; path?: string } }
  | { type: 'run.tool_result'; payload: { role: Role; tool: string; ok: boolean; summary: string } }
  | { type: 'run.ended'; payload: { role: Role; ok: boolean; error?: EngineError; errorDetail?: string; finalText: string; durationMs: number } }
  | { type: 'baton.passed'; payload: { from: Role; to: Role; note: string } }
  | { type: 'commit.made'; payload: { sha: string; message: string } }
  | { type: 'review.ready'; payload: { summary: string } }
  | { type: 'ship.started'; payload: Record<string, never> }
  | { type: 'ship.pr_opened'; payload: { url: string; number: number } }
  | { type: 'ship.failed'; payload: { cause: string } }
  | { type: 'session.declined'; payload: Record<string, never> }
  | { type: 'session.stopped'; payload: Record<string, never> }
);

export type EventType = OrchestraEvent['type'];
/** An event before the store assigns seq and ts. */
export type NewEvent = Omit<OrchestraEvent, 'seq' | 'ts'> extends infer E ? E : never;
