// Shutdown shim. T2 owns main/process/treeKill (killAllTracked). Until that lands on this branch the
// require fails and this is a no-op; once merged it tree-kills every tracked child (AC-L1, PRD §4).
type TreeKill = { killAllTracked?: (graceMs: number) => Promise<unknown> | unknown };

export async function killAllTrackedIfPresent(graceMs = 2000): Promise<void> {
  let mod: TreeKill | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../process/treeKill') as TreeKill;
  } catch {
    return;
  }
  if (typeof mod?.killAllTracked === 'function') await mod.killAllTracked(graceMs);
}
