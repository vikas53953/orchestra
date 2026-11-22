// A failed run: what went wrong in plain words, and Try again (wired in Sprint 1; visible now).
import { t, type CopyKey } from '../../shared/copy';
import type { Role } from '../../shared/types';
import { InlineText } from '../components/RichText';
import { errorText, type LaneError } from '../store/lanes';
import { clock } from '../store/format';
import './cards.css';

export function ErrorCard({ role, error }: { role: Role; error: LaneError }) {
  return (
    <div className="o-acard" role="alert">
      <span className="o-acard-lbl"><span className="o-dot is-fail" />{t(`role.${role}` as CopyKey)} · {clock(error.ts)}</span>
      <span className="o-acard-q"><InlineText text={errorText(role, error)} /></span>
      <div className="o-acts">
        <button type="button" className="o-btn is-pri" onClick={() => undefined}>{t('error.tryAgain')}</button>
      </div>
    </div>
  );
}
