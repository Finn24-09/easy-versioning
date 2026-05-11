import { computeNextVersion, parseCalVer, formatToday } from '../src/version';

describe('formatToday', () => {
  it('formats a Date as YY.M.D in UTC by default', () => {
    const d = new Date(Date.UTC(2026, 4, 10));
    expect(formatToday(d, 'UTC')).toBe('26.5.10');
  });
});

describe('formatToday with non-UTC timezones', () => {
  it('formats correctly in America/Los_Angeles', () => {
    const d = new Date(Date.UTC(2026, 4, 11, 2, 0));
    expect(formatToday(d, 'America/Los_Angeles')).toBe('26.5.10');
  });

  it('formats correctly in Asia/Tokyo', () => {
    const d = new Date(Date.UTC(2026, 4, 9, 16, 0));
    expect(formatToday(d, 'Asia/Tokyo')).toBe('26.5.10');
  });

  it('strips leading zeros from month and day', () => {
    const d = new Date(Date.UTC(2027, 0, 1));
    expect(formatToday(d, 'UTC')).toBe('27.1.1');
  });
});

describe('parseCalVer', () => {
  it('parses base version', () => {
    expect(parseCalVer('26.5.10')).toEqual({ year: 26, month: 5, day: 10, counter: null });
  });

  it('parses version with counter', () => {
    expect(parseCalVer('26.5.10-2')).toEqual({ year: 26, month: 5, day: 10, counter: 2 });
  });

  it('returns null for non-CalVer string', () => {
    expect(parseCalVer('1.2.3-beta')).toBeNull();
    expect(parseCalVer('not-a-version')).toBeNull();
    expect(parseCalVer('')).toBeNull();
  });

  it('rejects leading zeros', () => {
    expect(parseCalVer('26.05.10')).toBeNull();
    expect(parseCalVer('26.5.05')).toBeNull();
  });

  it('handles multi-digit counters', () => {
    expect(parseCalVer('26.5.10-12')).toEqual({ year: 26, month: 5, day: 10, counter: 12 });
  });

  it('handles two-digit days', () => {
    expect(parseCalVer('26.12.31')).toEqual({ year: 26, month: 12, day: 31, counter: null });
  });
});

describe('computeNextVersion', () => {
  const today = '26.5.10';

  it('writes today when current is missing', () => {
    expect(computeNextVersion(undefined, today)).toBe('26.5.10');
  });

  it('writes today when current is empty string', () => {
    expect(computeNextVersion('', today)).toBe('26.5.10');
  });

  it('writes today when current is non-CalVer garbage', () => {
    expect(computeNextVersion('1.2.3-beta', today)).toBe('26.5.10');
    expect(computeNextVersion('not-a-version', today)).toBe('26.5.10');
  });

  it('writes today when current base date is in the past', () => {
    expect(computeNextVersion('26.5.9', today)).toBe('26.5.10');
    expect(computeNextVersion('26.5.9-3', today)).toBe('26.5.10');
    expect(computeNextVersion('25.12.31', today)).toBe('26.5.10');
  });

  it('writes today-1 when current matches today with no counter', () => {
    expect(computeNextVersion('26.5.10', today)).toBe('26.5.10-1');
  });

  it('increments the counter when current matches today with a counter', () => {
    expect(computeNextVersion('26.5.10-1', today)).toBe('26.5.10-2');
    expect(computeNextVersion('26.5.10-9', today)).toBe('26.5.10-10');
  });

  it('throws when current base date is in the future', () => {
    expect(() => computeNextVersion('26.5.11', today)).toThrow(/future|backwards/i);
    expect(() => computeNextVersion('27.1.1', today)).toThrow(/future|backwards/i);
  });

  it('handles year rollover correctly', () => {
    expect(computeNextVersion('26.12.31', '27.1.1')).toBe('27.1.1');
  });

  it('handles single-digit day vs two-digit day comparison numerically', () => {
    expect(computeNextVersion('26.5.9', '26.5.10')).toBe('26.5.10');
    expect(() => computeNextVersion('26.5.10', '26.5.9')).toThrow();
  });
});
