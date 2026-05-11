export interface ParsedCalVer {
  year: number;
  month: number;
  day: number;
  counter: number | null;
}

const CALVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(0|[1-9]\d*))?$/;

export function formatToday(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);

  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

  const year = get('year');
  const month = get('month');
  const day = get('day');

  return `${year}.${month}.${day}`;
}

export function parseCalVer(v: string): ParsedCalVer | null {
  const m = CALVER_REGEX.exec(v);
  if (!m) return null;

  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    counter: m[4] !== undefined ? Number(m[4]) : null,
  };
}

function compareDate(a: ParsedCalVer, b: ParsedCalVer): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function computeNextVersion(current: string | undefined, today: string): string {
  const todayParsed = parseCalVer(today);
  if (!todayParsed) throw new Error(`Invalid today string: ${today}`);

  if (!current) return today;

  const currentParsed = parseCalVer(current);
  if (!currentParsed) return today;

  const cmp = compareDate(currentParsed, todayParsed);

  if (cmp < 0) return today;

  if (cmp === 0) {
    const counter = currentParsed.counter === null ? 1 : currentParsed.counter + 1;
    return `${today}-${counter}`;
  }

  // cmp > 0: current date is in the future
  throw new Error(
    `current version ${current} is dated in the future relative to today ${today}; refusing to bump backwards`
  );
}
