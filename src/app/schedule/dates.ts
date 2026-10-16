/** A week is identified by its Monday as an ISO date, e.g. "2026-10-12". */
export type WeekKey = string;

const DAY = 86_400_000;

function toUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Monday of the week containing `date` (local calendar day). */
export function weekOf(date = new Date()): WeekKey {
  const ms = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (new Date(ms).getUTCDay() + 6) % 7;
  return fromUtc(ms - mondayOffset * DAY);
}

export function addDays(key: string, days: number): string {
  return fromUtc(toUtc(key) + days * DAY);
}

export function addWeeks(key: WeekKey, weeks: number): WeekKey {
  return addDays(key, weeks * 7);
}

export function weeksBetween(from: WeekKey, to: WeekKey): number {
  return Math.round((toUtc(to) - toUtc(from)) / (7 * DAY));
}

export function toDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });

/** "12 – 18 Oct" or "29 Sep – 5 Oct". */
export function formatRange(key: WeekKey): string {
  const start = toDate(key);
  const end = toDate(addDays(key, 6));
  const startText = start.getMonth() === end.getMonth() ? day.format(start) : dayMonth.format(start);
  return `${startText} – ${dayMonth.format(end)}`;
}

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

export function formatMonth(key: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(toDate(key));
}

/** ISO 8601 week number. */
export function isoWeek(key: WeekKey): number {
  const thursday = toUtc(addDays(key, 3));
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - yearStart) / (7 * DAY)) + 1;
}
