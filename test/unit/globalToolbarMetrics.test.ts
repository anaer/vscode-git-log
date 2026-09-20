// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  GLOBAL_TOOLBAR_ACTIONS,
  TOOLBAR_ACTION_GAP,
  TOOLBAR_ACTION_WIDTH,
  globalToolbarMetrics,
} from '../../webview/src/Toolbars';

const total = GLOBAL_TOOLBAR_ACTIONS.length;

// Width needed to show `count` action buttons directly beside the More button:
// (count + 1) buttons worth of width plus `count` gaps. Reaching count === total
// instead drops the More button, so the content width excludes its trailing gap.
const withMoreWidth = (count: number): number =>
  (count + 1) * TOOLBAR_ACTION_WIDTH + count * TOOLBAR_ACTION_GAP;
const allDirectWidth = (): number =>
  total * TOOLBAR_ACTION_WIDTH + (total - 1) * TOOLBAR_ACTION_GAP;

describe('globalToolbarMetrics', () => {
  // available -> { visibleCount, contentWidth }. Each boundary is derived from
  // the layout contract, not from re-running the function, so the expectations
  // stay independent of the implementation.
  const cases: Array<[number, number, number]> = [
    // A lone More button must still reserve its own width (regression: it used
    // to return contentWidth 0, letting the fixed toolbar overlap the filter bar).
    [0, 0, TOOLBAR_ACTION_WIDTH],
    [40, 0, TOOLBAR_ACTION_WIDTH],
    [withMoreWidth(0) - 1, 0, TOOLBAR_ACTION_WIDTH],
    // First action button promoted.
    [withMoreWidth(1), 1, withMoreWidth(1)],
    [withMoreWidth(2), 2, withMoreWidth(2)],
    // Matches the files-expanded default: Pull / Push / Force Push overflow.
    [274, 6, 274],
    [withMoreWidth(7), 7, withMoreWidth(7)],
    // Enough room for all actions: More button disappears and the reserved width
    // excludes it.
    [withMoreWidth(total), total, allDirectWidth()],
    [635, total, allDirectWidth()],
  ];

  for (const [available, visibleCount, contentWidth] of cases) {
    it(`available=${available} → ${visibleCount} direct, contentWidth=${contentWidth}`, () => {
      expect(globalToolbarMetrics(available)).toEqual({ visibleCount, contentWidth });
    });
  }

  it('never under-reserves the always-rendered More button when actions overflow', () => {
    for (let available = 0; available <= 800; available += 1) {
      const { visibleCount, contentWidth } = globalToolbarMetrics(available);
      // Whatever overflows is reachable through the More menu, so the toolbar
      // keeps a More button and must reserve at least one button width for it.
      const moreRendered = visibleCount < total;
      const floor = moreRendered ? TOOLBAR_ACTION_WIDTH : 0;
      expect(contentWidth, `available=${available}`).toBeGreaterThanOrEqual(floor);
      // The reserved width must stay coherent: it is exactly the rendered row.
      expect(contentWidth).toBe(moreRendered ? withMoreWidth(visibleCount) : allDirectWidth());
    }
  });
});
