import { describe, expect, it } from 'vitest';
import { formatCommitDate } from '../../webview/src/formatCommitDate';

describe('formatCommitDate', () => {
  it('formats a commit timestamp as a fixed-width local date and time', () => {
    const formatted = formatCommitDate(1_700_000_000);
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u);
  });

  it('produces a stable string for the same timestamp', () => {
    expect(formatCommitDate(1_700_000_000)).toBe(formatCommitDate(1_700_000_000));
  });

  it('returns an empty string for a falsy (empty) timestamp', () => {
    expect(formatCommitDate(0)).toBe('');
    expect(formatCommitDate(Number.NaN)).toBe('');
  });
});
