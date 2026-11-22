// Composer pill (C1, 44 px). Enter sends; empty Enter does nothing (J9).
import { useState } from 'react';
import { t } from '../../shared/copy';
import { useApp } from '../store/appStore';
import { Icon } from './Icon';

export function HomeComposer({ enabled }: { enabled: boolean }) {
  const [draft, setDraft] = useState('');
  const send = useApp((s) => s.send);
  const sending = useApp((s) => s.sending);
  const canSend = enabled && !sending && draft.trim().length > 0;
  const submit = () => {
    if (!canSend) return;
    const task = draft;
    void send(task).then(() => setDraft(''));
  };
  return (
    <div className={`o-pcomp${enabled ? '' : ' is-off'}`}>
      <input
        data-testid="home-composer"
        className="o-pcomp-input"
        placeholder={t('home.placeholder')}
        aria-label={t('home.placeholder')}
        value={draft}
        disabled={!enabled}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
        }}
      />
      <button type="button" className={`o-send${canSend ? ' is-on' : ''}`} aria-label={t('home.send')} title={t('home.send')} disabled={!canSend} onClick={submit}>
        <Icon name="up" />
      </button>
    </div>
  );
}
