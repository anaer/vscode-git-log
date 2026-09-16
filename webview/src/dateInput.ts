/**
 * Converts a filter timestamp (epoch seconds, as stored on `LogFilters`) into
 * the `'YYYY-MM-DD'` form the date fields use. Returns `''` for an absent or
 * out-of-range value so a field renders empty rather than "Invalid Date".
 *
 * Local time is intentional: the picker's calendar days are local, and the
 * toolbar turns the value back into a local-midnight timestamp on apply.
 */
export function epochSecondsToDateInput(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
