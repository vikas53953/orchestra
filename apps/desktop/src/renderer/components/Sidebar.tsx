// Sidebar (R0.2): logo tile, New session, Your sessions (status dot + title, ellipsis, tooltip).
import { t } from '../../shared/copy';
import type { Session } from '../../shared/types';
import { useApp } from '../store/appStore';
import { statusKey, statusTone } from '../store/lanes';
import logoUrl from '../assets/orchestra-icon.svg';
import { Icon } from './Icon';
import './sidebar.css';

function SessionRow({ session, selected }: { session: Session; selected: boolean }) {
  const events = useApp((s) => s.events[session.id]);
  const openSession = useApp((s) => s.openSession);
  const tone = statusTone(statusKey(session.state, events ?? []));
  const dotCls = tone === 'working' ? 'is-pulse' : tone === 'quiet' ? '' : `is-${tone}`;
  return (
    <li>
      <button
        type="button"
        data-testid="session-item"
        className={`o-side-row${selected ? ' is-sel' : ''}`}
        title={session.title}
        aria-current={selected ? 'page' : undefined}
        onClick={() => void openSession(session.id)}
      >
        <span className={`o-dot ${dotCls}`} />
        <span className="o-side-title o-ellipsis">{session.title}</span>
      </button>
    </li>
  );
}

export function Sidebar() {
  const sessions = useApp((s) => s.sessions);
  const view = useApp((s) => s.view);
  const goHome = useApp((s) => s.goHome);
  const blocked = useApp((s) => s.setup !== null && !s.setup.canStart);
  return (
    <aside className="o-side">
      <div className="o-side-top">
        <img className="o-logo" src={logoUrl} width={24} height={24} alt="" />
        <span className="o-side-name">{t('app.name')}</span>
      </div>
      <button type="button" className={`o-side-row o-side-new${view.kind === 'home' && !blocked ? ' is-sel' : ''}`} onClick={goHome} disabled={blocked}>
        <Icon name="plus" />
        <span>{t('sidebar.new')}</span>
      </button>
      <div className="o-side-sect">{t('sidebar.sessions')}</div>
      <ul className="o-side-list" data-testid="session-list">
        {sessions.length === 0 ? <li className="o-side-empty">{t('sidebar.empty')}</li> : null}
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} selected={view.kind === 'session' && view.id === s.id} />
        ))}
      </ul>
    </aside>
  );
}
