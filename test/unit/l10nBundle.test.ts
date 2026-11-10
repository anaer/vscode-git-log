import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type L10nBundle = Record<string, string>;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

describe('l10n bundle', () => {
  it('has no orphan keys that no longer exist in the Git error classifier', async () => {
    const [bundle, source] = await Promise.all([
      readJson<L10nBundle>('l10n/bundle.l10n.zh-cn.json'),
      readFile('src/git/classifyGitError.ts', 'utf8'),
    ]);

    expect(Object.keys(bundle).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(bundle)) {
      expect(source, `stale l10n key: ${key}`).toContain(key);
      expect(value.trim().length, `empty translation for: ${key}`).toBeGreaterThan(0);
    }
  });

  it('declares the l10n directory in package.json', async () => {
    const manifest = await readJson<{ l10n?: string }>('package.json');
    expect(manifest.l10n).toBe('./l10n');
  });
});
