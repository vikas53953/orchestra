// The shell: sidebar + the current screen. C5 replaces the screen while setup blocks starting a session.
import { useEffect } from 'react';
import { useApp } from './store/appStore';
import { Sidebar } from './components/Sidebar';
import { Home } from './screens/Home';
import { SessionScreen } from './screens/Session';
import { Setup } from './screens/Setup';

export function App() {
  const view = useApp((s) => s.view);
  const blocked = useApp((s) => s.setup !== null && !s.setup.canStart);
  const init = useApp((s) => s.init);
  useEffect(() => { void init(); }, [init]);
  return (
    <div className="o-app">
      <Sidebar />
      {blocked ? <Setup /> : view.kind === 'session' ? <SessionScreen id={view.id} /> : <Home />}
    </div>
  );
}
