// The Team Lead's answer (S0): author line, then a Grokbot-style bot card (gradient fill, 1 px edge, ≤560 px).
import { t } from '../../shared/copy';
import type { Role } from '../../shared/types';
import { Face } from '../components/Face';
import { RichText } from '../components/RichText';
import { clock } from '../store/format';
import './cards.css';

export function AnswerCard({ role, text, ts }: { role: Role; text: string; ts: number }) {
  return (
    <div className="o-said">
      <div className="o-au"><Face role={role} size={20} state="idle" />{t('session.answer.from')}<span className="o-au-tm">{clock(ts)}</span></div>
      <div className="o-bcard" data-testid="answer-card"><RichText text={text} /></div>
    </div>
  );
}
