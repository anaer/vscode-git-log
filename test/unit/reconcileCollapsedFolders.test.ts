import { describe, expect, it } from 'vitest';
import { reconcileCollapsedFolders } from '../../webview/src/webviewUtils';

describe('reconcileCollapsedFolders', () => {
  it('collapses folders that are listed as default-collapsed and never touched', () => {
    const next = reconcileCollapsedFolders(
      new Set<string>(),
      ['r:tag:["origin"]', 'r:tag:["release"]', 'r:local:["feature"]'],
      ['r:tag:["origin"]', 'r:tag:["release"]'],
      new Set<string>(),
    );

    expect([...next].sort()).toEqual(['r:tag:["origin"]', 'r:tag:["release"]']);
  });

  it('keeps an explicitly expanded default-collapsed folder expanded', () => {
    const next = reconcileCollapsedFolders(
      new Set<string>(),
      ['r:tag:["origin"]'],
      ['r:tag:["origin"]'],
      new Set(['r:tag:["origin"]']),
    );

    expect(next.has('r:tag:["origin"]')).toBe(false);
  });

  it('keeps an explicitly collapsed non-default folder collapsed', () => {
    const next = reconcileCollapsedFolders(
      new Set(['r:local:["feature"]']),
      ['r:local:["feature"]'],
      [],
      new Set(['r:local:["feature"]']),
    );

    expect(next.has('r:local:["feature"]')).toBe(true);
  });

  it('forgets folders that no longer exist after a repository switch', () => {
    const next = reconcileCollapsedFolders(
      new Set(['old:tag:["origin"]']),
      ['new:tag:["origin"]'],
      ['new:tag:["origin"]'],
      new Set(['old:tag:["origin"]']),
    );

    expect([...next]).toEqual(['new:tag:["origin"]']);
  });

  it('returns the same set instance when nothing changes', () => {
    const current = new Set(['r:tag:["origin"]']);
    const next = reconcileCollapsedFolders(
      current,
      ['r:tag:["origin"]', 'r:tag:["release"]'],
      ['r:tag:["origin"]'],
      new Set<string>(),
    );

    expect(next).toBe(current);
  });
});
