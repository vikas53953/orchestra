// C5 First run / setup check (R0.3, AC-S0.2a): one row per tool, the fix in plain words, Check again.
import { t, type CopyKey } from '../../shared/copy';
import type { SetupItem } from '../../shared/types';
import { useApp } from '../store/appStore';
import { InlineText } from '../components/RichText';
import { TopBar } from '../components/TopBar';
import './setup.css';

function Row({ item }: { item: SetupItem }) {
  const label = item.status === 'ok' ? t('setup.ok') : item.status === 'warn' ? t('setup.status.warn') : t('setup.status.missing');
  const tone = item.status === 'ok' ? 'is-done' : item.status === 'warn' ? 'is-needs' : 'is-fail';
  const fix = item.status !== 'ok' && item.fixKey ? t(item.fixKey as CopyKey) : null;
  return (
    <li className={`o-setup-row is-${item.status}`}>
      <span className={`o-dot ${tone}`} />
      <div className="o-setup-tx">
        <span className="o-setup-nm">{t(`setup.item.${item.id}` as CopyKey)}</span>
        {fix ? <span className="o-setup-fix"><InlineText text={fix} /></span> : null}
      </div>
      <span className={`o-setup-st ${tone}`}>{item.status === 'ok' && item.detail ? item.detail : label}</span>
    </li>
  );
}

export function Setup() {
  const setup = useApp((s) => s.setup);
  const checking = useApp((s) => s.setupChecking);
  const recheck = useApp((s) => s.recheck);
  if (!setup) return null;
  return (
    <main className="o-main">
      <TopBar />
      <div className="o-setup" data-testid="setup-check">
        <div className="o-setup-col">
          <div className="o-setup-hd">
            <h1 className="o-h1">{t('setup.title')}</h1>
            <p className="o-setup-lede">{t('setup.lede')}</p>
          </div>
          <ul className="o-setup-list">{setup.items.map((i) => <Row key={i.id} item={i} />)}</ul>
          <div className="o-acts">
            <button type="button" className="o-btn is-pri" data-testid="setup-recheck" disabled={checking} onClick={() => void recheck()}>
              {t('setup.recheck')}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
