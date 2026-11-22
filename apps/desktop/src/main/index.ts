// Placeholder entry. T3 (core) replaces this with the real main process wiring (architecture.md §3, §8).
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1440, height: 900, backgroundColor: '#121212', show: true });
  void win.loadFile(join(__dirname, '../renderer/index.html'));
});
app.on('window-all-closed', () => app.quit());
