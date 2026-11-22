// Clock time for meta lines and the history list, in the user's locale ("2:41 PM").
export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
