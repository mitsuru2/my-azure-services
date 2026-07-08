import { describe, expect, it } from 'vitest';
import { isLastDayOfMonth, jstTimeToUtcCronExpression } from './date';

describe('isLastDayOfMonth', () => {
  it('returns true for the last day of a 31-day month', () => {
    expect(isLastDayOfMonth(new Date(Date.UTC(2026, 0, 31)))).toBe(true);
  });

  it('returns true for the last day of a 30-day month', () => {
    expect(isLastDayOfMonth(new Date(Date.UTC(2026, 3, 30)))).toBe(true);
  });

  it('returns true for the last day of February in a leap year', () => {
    expect(isLastDayOfMonth(new Date(Date.UTC(2024, 1, 29)))).toBe(true);
  });

  it('returns true for the last day of February in a non-leap year', () => {
    expect(isLastDayOfMonth(new Date(Date.UTC(2026, 1, 28)))).toBe(true);
  });

  it('returns false for a day that is not the last day of the month', () => {
    expect(isLastDayOfMonth(new Date(Date.UTC(2026, 0, 30)))).toBe(false);
  });

  it('returns false for the first day of the month', () => {
    expect(isLastDayOfMonth(new Date(Date.UTC(2026, 0, 1)))).toBe(false);
  });
});

describe('jstTimeToUtcCronExpression', () => {
  it('converts a JST time to the equivalent UTC NCRONTAB expression', () => {
    expect(jstTimeToUtcCronExpression('1800')).toBe('0 0 9 * * *');
  });

  it('wraps around midnight when the JST hour is before the offset', () => {
    expect(jstTimeToUtcCronExpression('0530')).toBe('0 30 20 * * *');
  });

  it('preserves minutes', () => {
    expect(jstTimeToUtcCronExpression('0915')).toBe('0 15 0 * * *');
  });

  it('throws for an invalid time format', () => {
    expect(() => jstTimeToUtcCronExpression('25:00')).toThrow();
    expect(() => jstTimeToUtcCronExpression('9999')).toThrow();
  });
});
