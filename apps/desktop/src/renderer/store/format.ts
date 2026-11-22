// Clock time for meta lines and the history list, in the user's locale ("2:41 PM").
export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Short clock for the panel history ("2:41", no AM/PM), as in the approved design. */
export function clockShort(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}
