// C2 Session: title + status chip + meta, the task, lanes, then the answer or the error. Right panel on Ctrl+Alt+B.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../shared/copy';
import type { OrchestraEvent } from '../../shared/events';
import type { Role } from '../../shared/types';
import { useApp } from '../store/appStore';
import { lanes as reduceLanes, statusKey } from '../store/lanes';
import { folderName } from '../store/merge';
import { clock } from '../store/format';
import { TopBar } from '../components/TopBar';
import { StatusChip } from '../components/StatusChip';
import { Icon } from '../components/Icon';
import { Panel } from '../components/Panel';
import { Lanes } from '../lanes/Lanes';
import { AnswerCard } from '../cards/AnswerCard';
import { ErrorCard } from '../cards/ErrorCard';
import { Loading } from './Loading';
import './session.css';

const NO_EVENTS: OrchestraEvent[] = [];

export function SessionScreen({ id }: { id: string }) {
  const session = useApp((s) => s.sessions.find((x) => x.id === id));
  const events = useApp((s) => s.events[id] ?? NO_EVENTS);
  const loading = useApp((s) => s.loading[id] === true);
  const panelOpen = useApp((s) => s.panelOpen);
  const togglePanel = useApp((s) => s.togglePanel);
  const stop = useApp((s) => s.stop);
  const [role, setRole] = useState<Role>('TeamLead');
  const [stopping, setStopping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const lanes = useMemo(() => reduceLanes(events), [events]);
  const created = events.find((e) => e.type === 'session.created');
  const task = session?.task ?? (created?.type === 'session.created' ? created.payload.task : '');
  const repoPath = session?.repoPath ?? (created?.type === 'session.created' ? created.payload.repoPath : '');
  const running = lanes.some((l) => l.working) || session?.state === 'planning' && !lanes.some((l) => l.outcome !== 'none');
  const showStop = running && session?.state !== 'stopped' && session?.state !== 'failed';

  useEffect(() => { setStopping(false); setRole('TeamLead'); }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && !e.shiftKey && (e.code === 'KeyB' || e.key.toLowerCase() === 'b')) { e.preventDefault(); togglePanel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePanel]);
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const onSelectLane = (r: Role) => {
    if (panelOpen && r === role) togglePanel(false);
    else { setRole(r); togglePanel(true); }
  };

  const showSkeleton = loading;
  const key = session ? statusKey(session.state, events) : null;

  return (
    <div className="o-work">
      <main className="o-main">
        <TopBar captionGap={!panelOpen}>
          {repoPath ? <span className="o-crumb"><span className="o-tag o-ellipsis" title={repoPath}>{folderName(repoPath)}</span></span> : null}
          <span className="o-grow" />
          <button type="button" className={`o-iconbtn${panelOpen ? ' is-on' : ''}`} onClick={() => togglePanel()} title={t('session.panel.toggle')} aria-label={t('session.panel.toggle')} aria-pressed={panelOpen}>
            <Icon name="panel" />
          </button>
        </TopBar>
        <div className="o-msgs" ref={scroller}>
          {showSkeleton || !session || !key ? <Loading /> : (
            <div className={`o-col${panelOpen ? ' is-narrow' : ''}`}>
              <div className="o-sh">
                <h1 className="o-h2t" data-testid="session-title" title={session.title}>{session.title}</h1>
                <div className="o-shm">
                  <StatusChip statusKey={key} />
                  <span className="o-ellipsis o-shm-repo" title={session.repoPath}>{folderName(session.repoPath)}</span>
                  <span>{t('session.meta.started', { time: clock(session.createdAt) })}</span>
                  <span className="o-grow" />
                  {showStop ? (
                    <button type="button" className="o-btn is-gh" data-testid="stop" disabled={stopping}
                      onClick={() => { setStopping(true); void stop(id).catch(() => setStopping(false)); }}>
                      {t('session.stop')}
                    </button>
                  ) : null}
                </div>
              </div>
              {task ? <div className="o-youmsg">{task}</div> : null}
              <Lanes lanes={lanes} selected={role} panelOpen={panelOpen} onSelect={onSelectLane} />
              {lanes.map((l) => (l.answer ? <AnswerCard key={`a-${l.role}`} role={l.role} text={l.answer.text} ts={l.answer.ts} /> : null))}
              {lanes.map((l) => (l.error ? <ErrorCard key={`e-${l.role}`} role={l.role} error={l.error} /> : null))}
            </div>
          )}
        </div>
        <div className="o-compwrap">
          <div className={`o-pcomp is-off o-col-w${panelOpen ? ' is-narrow' : ''}`} title={t('session.composer.soon')}>
            <span className="o-pcomp-plus"><Icon name="plus" /></span>
            <input className="o-pcomp-input" placeholder={t('session.composer.disabled')} aria-label={t('session.composer.disabled')} disabled />
            <span className="o-send"><Icon name="up" /></span>
          </div>
        </div>
      </main>
      <Panel open={panelOpen} role={role} lane={lanes.find((l) => l.role === role)} onClose={() => togglePanel(false)} />
    </div>
  );
}
