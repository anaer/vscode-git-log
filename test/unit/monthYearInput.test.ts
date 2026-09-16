import { describe, expect, it } from 'vitest';

import { clampMonthYear, formatMonthYear, parseMonthYear } from '../../webview/src/monthYearInput';

describe('formatMonthYear', () => {
  it('zero-pads the month to two digits', () => {
    expect(formatMonthYear(2026, 0)).toBe('2026-01');
    expect(formatMonthYear(2026, 8)).toBe('2026-09');
    expect(formatMonthYear(2026, 11)).toBe('2026-12');
  });

  it('pads a year below 1000 to four digits', () => {
    expect(formatMonthYear(7, 0)).toBe('0007-01');
  });
});

describe('parseMonthYear', () => {
  it('parses a well-formed value into a zero-based month index', () => {
    expect(parseMonthYear('2026-09')).toEqual({ year: 2026, monthIndex: 8 });
    expect(parseMonthYear('2026-01')).toEqual({ year: 2026, monthIndex: 0 });
    expect(parseMonthYear('2026-12')).toEqual({ year: 2026, monthIndex: 11 });
  });

  it('accepts an unpadded month so a mid-edit draft can still parse', () => {
    expect(parseMonthYear('2026-9')).toEqual({ year: 2026, monthIndex: 8 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseMonthYear('  2026-09  ')).toEqual({ year: 2026, monthIndex: 8 });
  });

  it.each([
    ['2026-13', 'month above 12'],
    ['2026-00', 'month below 1'],
    ['2026', 'year only'],
    ['2026-1x', 'non-numeric month'],
    ['2026-09-15', 'full date rather than a month'],
    ['not-a-date', 'garbage'],
    ['', 'empty'],
  ])('rejects %s (%s)', (draft) => {
    expect(parseMonthYear(draft)).toBeUndefined();
  });

  it('rejects a month below the lower bound', () => {
    expect(parseMonthYear('2026-08', '2026-09-15')).toBeUndefined();
    expect(parseMonthYear('2026-09', '2026-09-15')).toEqual({ year: 2026, monthIndex: 8 });
  });

  it('rejects a month above the upper bound', () => {
    expect(parseMonthYear('2026-10', undefined, '2026-09-15')).toBeUndefined();
    expect(parseMonthYear('2026-09', undefined, '2026-09-15')).toEqual({
      year: 2026,
      monthIndex: 8,
    });
  });

  it('ignores a bound it cannot parse', () => {
    expect(parseMonthYear('2026-09', 'nonsense', undefined)).toEqual({ year: 2026, monthIndex: 8 });
  });
});

describe('clampMonthYear', () => {
  it('leaves an in-range month untouched', () => {
    expect(clampMonthYear(2026, 8, '2026-01-01', '2026-12-31')).toEqual({
      year: 2026,
      monthIndex: 8,
    });
  });

  it('snaps forward to the lower bound when below it', () => {
    expect(clampMonthYear(2026, 0, '2026-09-15')).toEqual({ year: 2026, monthIndex: 8 });
  });

  it('snaps back to the upper bound when above it', () => {
    expect(clampMonthYear(2026, 11, undefined, '2026-09-15')).toEqual({
      year: 2026,
      monthIndex: 8,
    });
  });

  it('crosses year boundaries when clamping', () => {
    expect(clampMonthYear(2025, 11, '2026-03-01')).toEqual({ year: 2026, monthIndex: 2 });
    expect(clampMonthYear(2027, 0, undefined, '2026-09-15')).toEqual({
      year: 2026,
      monthIndex: 8,
    });
  });

  it('returns the input when no bounds are given', () => {
    expect(clampMonthYear(2026, 5)).toEqual({ year: 2026, monthIndex: 5 });
  });

  it('never produces a negative month index when clamped to the floor', () => {
    const result = clampMonthYear(1, 0, '2026-01-01');
    expect(result.monthIndex).toBeGreaterThanOrEqual(0);
    expect(result).toEqual({ year: 2026, monthIndex: 0 });
  });
});
