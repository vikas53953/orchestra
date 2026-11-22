// Right panel (F3, AC-F3c): hidden until asked; slides in 300 ms; shows the selected agent's history.
import { t, type CopyKey } from '../../shared/copy';
import type { Role } from '../../shared/types';
import type { LaneView } from '../store/lanes';
import { clock } from '../store/format';
import { Icon } from './Icon';
import './panel.css';

export function Panel({ open, role, lane, onClose }: { open: boolean; role: Role; lane: LaneView | undefined; onClose: () => void }) {
  const name = t(`role.${role}` as CopyKey);
  const history = lane?.history ?? [];
  return (
    <aside className={`o-panel${open ? ' is-open' : ''}`} data-testid="panel" aria-hidden={!open} aria-label={t('session.panel.history')}>
      <div className="o-panel-drag" />
      <div className="o-ptabs">
        <span className="o-ptab is-on"><Icon name="term" />{name}</span>
        <button type="button" className="o-iconbtn o-panel-x" onClick={onClose} title={t('session.panel.close')} aria-label={t('session.panel.close')} tabIndex={open ? 0 : -1}>
          <Icon name="x" />
        </button>
      </div>
      <div className="o-panel-sect">{t('session.panel.history')}</div>
      {history.length ? (
        <ol className="o-log">
          {history.map((h, i) => (
            <li key={i}><span className="o-log-tm">{clock(h.ts)}</span><span className="o-log-tx">{h.text}</span></li>
          ))}
        </ol>
      ) : (
        <p className="o-panel-quiet">{t('session.panel.empty', { role: name })}</p>
      )}
    </aside>
  );
}
