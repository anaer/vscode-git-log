import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type NlsBundle = Record<string, string>;

interface ContributionManifest {
  contributes: {
    commands: Array<{ title?: string }>;
    submenus: Array<{ label?: string }>;
    configuration: {
      title?: string;
      properties: Record<string, { description?: string; enumDescriptions?: string[] }>;
    };
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function collectPlaceholders(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/%([^%]+)%/g)) {
      if (match[1]) found.add(match[1]);
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPlaceholders(item, found);
  }
  return found;
}

describe('package.nls bundles', () => {
  it('keeps the English and Simplified Chinese key sets identical and non-empty', async () => {
    const [en, zh] = await Promise.all([
      readJson<NlsBundle>('package.nls.json'),
      readJson<NlsBundle>('package.nls.zh-cn.json'),
    ]);

    expect(Object.keys(en).length).toBeGreaterThan(0);
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(zh[key]?.trim().length).toBeGreaterThan(0);
    }
  });

  it('resolves every package.json placeholder from both bundles without orphan keys', async () => {
    const [manifest, en, zh] = await Promise.all([
      readJson<unknown>('package.json'),
      readJson<NlsBundle>('package.nls.json'),
      readJson<NlsBundle>('package.nls.zh-cn.json'),
    ]);

    const used = [...collectPlaceholders(manifest)].sort();
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((key) => !(key in en))).toEqual([]);
    expect(used.filter((key) => !(key in zh))).toEqual([]);
    expect(Object.keys(en).filter((key) => !used.includes(key))).toEqual([]);
  });

  it('routes every contributed label and description through an nls key', async () => {
    const manifest = await readJson<ContributionManifest>('package.json');
    const labels = [
      ...manifest.contributes.commands.map((command) => command.title),
      ...manifest.contributes.submenus.map((submenu) => submenu.label),
      manifest.contributes.configuration.title,
      ...Object.values(manifest.contributes.configuration.properties)
        .map((property) => property.description)
        .filter((description): description is string => description !== undefined),
      ...Object.values(manifest.contributes.configuration.properties).flatMap(
        (property) => property.enumDescriptions ?? [],
      ),
    ];

    expect(labels.length).toBeGreaterThan(0);
    expect(
      labels.filter((label) => !label?.startsWith('%') || !label.endsWith('%')),
    ).toEqual([]);
  });
});
