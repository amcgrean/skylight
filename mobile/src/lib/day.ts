// Date helpers. The family lives in one time zone, so the phone's local time is the
// source of truth. Weeks start on Monday; weekdays are ISO (1 = Monday … 7 = Sunday).

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/** "yyyy-MM-dd" in local time. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(n: number, d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function isoWeekday(d: Date): number {
  const w = d.getDay(); // 0 = Sunday
  return w === 0 ? 7 : w;
}

export function startOfWeek(d: Date): Date {
  return addDays(-(isoWeekday(d) - 1), startOfDay(d));
}

export function weekContaining(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(i, start));
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Combines a day with a Postgres time string like "07:30:00". */
export function atTime(time: string, day: Date): Date {
  const [h, m] = time.split(':').map(Number);
  return at(h || 0, m || 0, day);
}

export function at(hour: number, minute: number, day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

// Display formatting
export const fmt = {
  weekdayShort: (d: Date) => WEEKDAYS_SHORT[d.getDay()],
  weekdayLong: (d: Date) => WEEKDAYS_LONG[d.getDay()],
  dayNumber: (d: Date) => String(d.getDate()),
  monthDay: (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
  headerDate: (d: Date) => `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
  clock: (d: Date) => `${d.getHours() % 12 === 0 ? 12 : d.getHours() % 12}:${pad(d.getMinutes())}`,
  ampm: (d: Date) => (d.getHours() < 12 ? 'AM' : 'PM'),
};
