// Serve a worktree's renderer with vite, allowing the shared node_modules it reaches through a
// junction (Windows) or symlink. Without this, vite on Windows resolves deps to the real path
// outside the worktree and refuses them ("outside of Vite serving allow list").
// Usage (cwd = worktree): node vite-serve.mjs <port> <sharedNodeModules>
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';

const [port, shared] = process.argv.slice(2);
// Windows temp dirs come back as 8.3 short names (C:\Users\RUNNER~1\...) while vite checks real long paths,
// so allow both spellings of the worktree and of the shared node_modules.
const dir = realpathSync.native(process.cwd());
const allow = [...new Set([process.cwd(), dir, shared, realpathSync.native(shared)])];
const server = await createServer({
  root: join(dir, 'apps/desktop/src/renderer'),
  configFile: join(dir, 'vite.config.ts'),
  server: { port: Number(port), strictPort: true, host: '127.0.0.1', fs: { allow } },
});
await server.listen();
console.log(`vite-serve: ${dir} on ${port}`);
