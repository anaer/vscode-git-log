import { describe, expect, it } from 'vitest';
import {
  emptyCommitSelection,
  isContiguousSelection,
  nextCommitSelection,
  type CommitSelection,
} from '../../webview/src/commitSelection';

const commits = [{ hash: 'a' }, { hash: 'b' }, { hash: 'c' }, { hash: 'd' }];

describe('nextCommitSelection', () => {
  it('selects a single commit and moves the anchor to it', () => {
    const result = nextCommitSelection(emptyCommitSelection, commits, 'b');
    expect(result).toEqual({
      selection: { hashes: ['b'], anchor: 'b' },
      focusedHash: 'b',
    });
  });

  it('extends from the anchor to the target in commit order', () => {
    const current: CommitSelection = { hashes: ['a'], anchor: 'a' };
    expect(nextCommitSelection(current, commits, 'c', { extend: true })?.selection).toEqual({
      hashes: ['a', 'b', 'c'],
      anchor: 'a',
    });
  });

  it('falls back to a single selection when the anchor left the window', () => {
    const current: CommitSelection = { hashes: ['z'], anchor: 'z' };
    expect(nextCommitSelection(current, commits, 'c', { extend: true })?.selection).toEqual({
      hashes: ['c'],
      anchor: 'c',
    });
  });

  it('adds a commit to the selection on toggle and keeps commit order', () => {
    const current: CommitSelection = { hashes: ['c'], anchor: 'c' };
    expect(nextCommitSelection(current, commits, 'a', { toggle: true })?.selection).toEqual({
      hashes: ['a', 'c'],
      anchor: 'a',
    });
  });

  it('removes a commit on toggle and focuses the remaining one', () => {
    const current: CommitSelection = { hashes: ['a', 'c'], anchor: 'a' };
    expect(
      nextCommitSelection(current, commits, 'a', { toggle: true, selectedHash: 'a' }),
    ).toEqual({
      selection: { hashes: ['c'], anchor: 'c' },
      focusedHash: 'c',
    });
  });

  it('refuses to empty the selection when toggling the last selected commit', () => {
    const current: CommitSelection = { hashes: ['b'], anchor: 'b' };
    expect(nextCommitSelection(current, commits, 'b', { toggle: true })).toBeUndefined();
  });
});

describe('isContiguousSelection', () => {
  it('accepts a consecutive run of commits', () => {
    expect(isContiguousSelection(['b', 'c', 'd'], commits)).toBe(true);
  });

  it('rejects a selection with a gap', () => {
    expect(isContiguousSelection(['a', 'c'], commits)).toBe(false);
  });

  it('rejects selections shorter than two commits', () => {
    expect(isContiguousSelection(['a'], commits)).toBe(false);
    expect(isContiguousSelection([], commits)).toBe(false);
  });
});
