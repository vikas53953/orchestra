// Status chip (C2): copy from status.*; the text crossfades (160 ms) when it changes.
import { t, type CopyKey } from '../../shared/copy';
import { statusTone } from '../store/lanes';
import './status-chip.css';

export function StatusChip({ statusKey }: { statusKey: CopyKey }) {
  const tone = statusTone(statusKey);
  return (
    <span className={`o-chip is-${tone}`}>
      <span key={statusKey} className="o-chip-in o-xfade">
        {tone !== 'quiet' ? <span className={`o-dot${tone === 'working' ? ' is-pulse' : ` is-${tone}`}`} /> : null}
        {t(statusKey)}
      </span>
    </span>
  );
}
