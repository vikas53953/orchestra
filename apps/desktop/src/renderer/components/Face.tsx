// Crew visor faces (round 3): silhouette in crew colour, dark visor, two eyes. Eyes shift while working (240 ms).
import type { Role } from '../../shared/types';
import { t, type CopyKey } from '../../shared/copy';
import './face.css';

export type FaceState = 'rest' | 'idle' | 'work' | 'done' | 'fail' | 'needs';

const COLOUR: Record<Role, string> = { TeamLead: 'var(--o-lead)', Builder: 'var(--o-build)', Tester: 'var(--o-test)' };

function Shape({ role, fill }: { role: Role; fill: string }) {
  if (role === 'TeamLead') return <><rect x="3" y="7" width="17" height="14" rx="5" fill={fill} /><path d="M16.5 7.5 20.5 2.5" stroke={fill} strokeWidth="2" strokeLinecap="round" /></>;
  if (role === 'Builder') return <><rect x="3" y="5" width="18" height="16" rx="3" fill={fill} /><rect x="9.5" y="2" width="5" height="3.5" rx="1" fill={fill} /></>;
  return <circle cx="12" cy="12.5" r="9.5" fill={fill} />;
}

const EYE_Y: Record<Role, number> = { TeamLead: 14, Builder: 13, Tester: 12.5 };

export function Face({ role, size = 22, state = 'idle' }: { role: Role; size?: number; state?: FaceState }) {
  const cy = EYE_Y[role];
  const r = 1.05;
  const dot = state === 'done' || state === 'fail' || state === 'needs' ? state : null;
  return (
    <span className="o-face" title={t(`role.${role}` as CopyKey)}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <Shape role={role} fill={COLOUR[role]} />
        <rect x="6" y={cy - 3} width="12" height="6" rx="3" fill="var(--o-visor)" />
        {state === 'rest' ? (
          <path d={`M${9.7 - r} ${cy + 0.4}h${2 * r}M${14.3 - r} ${cy + 0.4}h${2 * r}`} stroke="var(--o-eye)" strokeWidth="1" strokeLinecap="round" />
        ) : (
          <g className={`o-eyes${state === 'work' ? ' is-work' : ''}`}>
            <circle cx="9.7" cy={cy} r={r} fill="var(--o-eye)" />
            <circle cx="14.3" cy={cy} r={r} fill="var(--o-eye)" />
          </g>
        )}
      </svg>
      {dot && size >= 16 ? <span className={`o-face-dot is-${dot}`} /> : null}
    </span>
  );
}
