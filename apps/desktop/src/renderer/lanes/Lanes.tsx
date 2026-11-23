// Lanes area (C2): one row per agent, in a filled well. Clicking a lane opens its history in the panel.
import type { Role } from '../../shared/types';
import type { LaneView } from '../store/lanes';
import { Lane } from './Lane';
import './lanes.css';

export function Lanes({ lanes, selected, panelOpen, onSelect }: { lanes: LaneView[]; selected: Role; panelOpen: boolean; onSelect: (r: Role) => void }) {
  return (
    <div className="o-crew">
      {lanes.map((l) => (
        <Lane key={l.role} lane={l} selected={panelOpen && selected === l.role} onSelect={() => onSelect(l.role)} />
      ))}
    </div>
  );
}
