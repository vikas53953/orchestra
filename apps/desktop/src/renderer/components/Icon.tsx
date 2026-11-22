// Line icons from the approved prototype (16 px grid, 1.5 stroke, currentColor).
const PATHS = {
  plus: <path d="M8 3v10M3 8h10" />,
  up: <path d="M8 13V3M4 7l4-4 4 4" />,
  chev: <path d="m6 4 4 4-4 4" />,
  chevd: <path d="m4 6 4 4 4-4" />,
  folder: <path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />,
  term: <><rect x="2" y="3" width="12" height="10" rx="2" /><path d="m5 6.5 2 1.5-2 1.5M8.5 10H11" /></>,
  panel: <><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M10 3v10" /></>,
  x: <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="o-ic" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
