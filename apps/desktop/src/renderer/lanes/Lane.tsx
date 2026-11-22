// One lane (F3): face, name in crew colour, latest step, working dot while running.
import { t, type CopyKey } from '../../shared/copy';
import { Face, type FaceState } from '../components/Face';
import { Icon } from '../components/Icon';
import type { LaneView } from '../store/lanes';

function faceState(l: LaneView): FaceState {
  if (l.working) return 'work';
  if (l.outcome === 'ok') return 'done';
  if (l.outcome === 'failed') return 'fail';
  if (l.outcome === 'stopped') return 'idle';
  return 'rest';
}

export function Lane({ lane, selected, onSelect }: { lane: LaneView; selected: boolean; onSelect: () => void }) {
  const name = t(`role.${lane.role}` as CopyKey);
  return (
    <button
      type="button"
      className={`o-lane is-${lane.role}${selected ? ' is-sel' : ''}`}
      data-testid={`lane-${lane.role}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <Face role={lane.role} state={faceState(lane)} />
      <span className="o-lane-nm o-ellipsis" title={name}>{name}</span>
      <span className={`o-lane-st${lane.outcome === 'failed' ? ' is-fail' : ''}`}>
        {lane.working ? <span className="o-dot is-pulse" data-testid="working-dot" /> : null}
        <span key={lane.latestStep} className="o-lane-tx o-ellipsis o-xfade" title={lane.latestStep}>{lane.latestStep}</span>
      </span>
      <span className="o-lane-ch">{lane.lineCounts ? `+${lane.lineCounts.added} −${lane.lineCounts.removed}` : ''}</span>
      <span className="o-lane-chev"><Icon name="chev" /></span>
    </button>
  );
}
