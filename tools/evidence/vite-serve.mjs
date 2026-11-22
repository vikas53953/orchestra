// Serve a worktree's renderer with vite, allowing the shared node_modules it reaches through a
// junction (Windows) or symlink. Without this, vite on Windows resolves deps to the real path
// outside the worktree and refuses them ("outside of Vite serving allow list").
// Usage (cwd = worktree): node vite-serve.mjs <port> <sharedNodeModules>
import { join } from 'node:path';
import { createServer } from 'vite';

const [port, shared] = process.argv.slice(2);
const dir = process.cwd();
const server = await createServer({
  configFile: join(dir, 'vite.config.ts'),
  server: { port: Number(port), strictPort: true, host: '127.0.0.1', fs: { allow: [dir, shared] } },
});
await server.listen();
console.log(`vite-serve: ${dir} on ${port}`);
