/**
 * Helpers for the combined `YYYY-MM` field that replaces flatpickr's native
 * month `<select>` + year number input pair.
 */

const MONTH_YEAR_PATTERN = /^(\d{4})-(\d{1,2})$/u;

/** `{ year: 2026, monthIndex: 8 }` -> `'2026-09'`. */
export function formatMonthYear(year: number, monthIndex: number): string {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/**
 * Parses a `YYYY-MM` draft. Returns `undefined` for anything that is not a
 * complete, in-range month so the caller can leave the draft untouched.
 *
 * `monthIndex` is zero-based to match `Date`; `month` in the result is
 * one-based for display and clamp reporting.
 */
export function parseMonthYear(
  draft: string,
  min?: string | undefined,
  max?: string | undefined,
): { year: number; monthIndex: number } | undefined {
  const match = MONTH_YEAR_PATTERN.exec(draft.trim());
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return undefined;
  if (month < 1 || month > 12) return undefined;

  const target = year * 12 + (month - 1);
  const floor = boundToMonths(min);
  const ceiling = boundToMonths(max);
  if (floor !== undefined && target < floor) return undefined;
  if (ceiling !== undefined && target > ceiling) return undefined;

  return { year, monthIndex: month - 1 };
}

/**
 * Clamps a parsed month into the allowed bounds, so a rejected draft still
 * resolves to the nearest legal month rather than bouncing back to wherever the
 * calendar happened to be.
 */
export function clampMonthYear(
  year: number,
  monthIndex: number,
  min?: string | undefined,
  max?: string | undefined,
): { year: number; monthIndex: number } {
  let value = year * 12 + monthIndex;
  const floor = boundToMonths(min);
  const ceiling = boundToMonths(max);
  if (floor !== undefined && value < floor) value = floor;
  if (ceiling !== undefined && value > ceiling) value = ceiling;
  return { year: Math.floor(value / 12), monthIndex: value % 12 };
}

/** Converts a `YYYY-MM-DD` bound into a month ordinal for comparison. */
function boundToMonths(bound: string | undefined): number | undefined {
  if (!bound) return undefined;
  const match = /^(\d{4})-(\d{1,2})/u.exec(bound.trim());
  if (!match) return undefined;
  return Number(match[1]) * 12 + (Number(match[2]) - 1);
}
