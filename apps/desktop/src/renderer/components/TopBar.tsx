// Top 40 px drag region of the main column. Leaves room on the right for the Windows caption buttons
// unless the right panel is open (then the panel's own top strip sits under them).
import type { ReactNode } from 'react';
import './topbar.css';

export function TopBar({ children, captionGap = true }: { children?: ReactNode; captionGap?: boolean }) {
  return <div className={`o-topbar${captionGap ? ' has-caption' : ''}`}>{children}</div>;
}
