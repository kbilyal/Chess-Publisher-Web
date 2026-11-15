/** Public Hub tournament lifecycle from scheduled calendar dates.
 * End dates are inclusive in the tournament's local calendar.
 * Missing or invalid dates return null rather than falsely claiming Live.
 */
export type TournamentDateStatus = 'upcoming' | 'live' | 'completed';

function dateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.toISOString().slice(0, 10) === `${year}-${month}-${day}`
    ? `${year}-${month}-${day}` : null;
}

export function tournamentDateStatus(
  startDate: unknown,
  endDate: unknown,
  now: Date = new Date(),
  timeZone = 'Europe/Sofia'
): TournamentDateStatus | null {
  const start = dateKey(startDate);
  const end = dateKey(endDate);
  if (!start || !end || end < start || !Number.isFinite(now.getTime())) return null;
  let today: string;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const get = (type: string) => parts.find(part => part.type === type)?.value || '';
    today = `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return null;
  }
  return today < start ? 'upcoming' : today > end ? 'completed' : 'live';
}
