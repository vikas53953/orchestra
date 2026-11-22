// Engine factory. Owner: T2 (engine). Stub from T1 so other tickets can import it before T2 lands.
// ORCHESTRA_ENGINE unset or "claude-code" -> ClaudeCodeEngine; "cassette:<path>" -> CassetteEngine (pre-check only).
import type { Engine } from '../../shared/engine';

export function createEngine(_env: NodeJS.ProcessEnv = process.env): Engine {
  throw new Error('createEngine: not implemented yet (T2)');
}
