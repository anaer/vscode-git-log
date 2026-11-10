import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Changed Files default view', () => {
  it('starts in List view', async () => {
    const { defaultLayout } = await import('../../src/protocol/messages');
    expect(defaultLayout.filesViewMode).toBe('list');
  });

  it('keeps both default-layout definitions in sync', async () => {
    const [protocol, panel] = await Promise.all([
      readFile('src/protocol/messages.ts', 'utf8'),
      readFile('src/webview/WorkbenchPanel.ts', 'utf8'),
    ]);
    expect(protocol.match(/filesViewMode: 'list'/gu)).toHaveLength(1);
    expect(panel.match(/filesViewMode: 'list'/gu)).toHaveLength(1);
  });
});
