// Engine factory (architecture.md §4). Owner: T2 (engine).
// ORCHESTRA_ENGINE unset or "claude-code" -> ClaudeCodeEngine; "cassette:<path>" -> CassetteEngine (pre-check only).
import { resolve } from 'node:path';
import type { Engine } from '../../shared/engine';
import { ClaudeCodeEngine } from './claudeCode';
import { CassetteEngine } from './cassette';

export function createEngine(env: NodeJS.ProcessEnv = process.env): Engine {
  const sel = env.ORCHESTRA_ENGINE?.trim();
  if (!sel || sel === 'claude-code') return new ClaudeCodeEngine({ env });
  if (sel.startsWith('cassette:')) {
    const file = sel.slice('cassette:'.length).trim();
    if (!file) throw new Error('ORCHESTRA_ENGINE=cassette:<path> needs a path');
    return new CassetteEngine(resolve(file), { env });
  }
  throw new Error(`ORCHESTRA_ENGINE: unknown engine "${sel}"`);
}

export { ClaudeCodeEngine } from './claudeCode';
export { CassetteEngine } from './cassette';
export { killAllTracked } from '../process/treeKill';
