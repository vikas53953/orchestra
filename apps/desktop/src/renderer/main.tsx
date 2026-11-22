// Renderer entry. In `vite` dev only, a fake window.orchestra is installed when the preload is absent.
import { createRoot } from 'react-dom/client';
import './tokens.css';
import './styles/base.css';
import './styles/shell.css';
import { loadFonts } from './styles/fonts';
import { App } from './App';

async function start(): Promise<void> {
  loadFonts();
  if (import.meta.env.DEV && typeof window.orchestra === 'undefined') {
    const dev = await import('./dev/mockApi');
    dev.installMockApi();
  }
  createRoot(document.getElementById('root')!).render(<App />);
  if (import.meta.env.DEV) {
    const dev = await import('./dev/mockApi');
    dev.applyHashState();
  }
}

void start();
