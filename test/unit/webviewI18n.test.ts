import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadTranslator(locale: string | null) {
  vi.resetModules();
  vi.stubGlobal('document', {
    querySelector: () => (locale === null ? null : { getAttribute: () => locale }),
  });
  const i18n = await import('../../webview/src/i18n');
  const { en } = await import('../../webview/src/i18n/en');
  const { zhCn } = await import('../../webview/src/i18n/zhCn');
  return { ...i18n, en, zhCn };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('webview i18n', () => {
  it('renders Chinese when VS Code runs in a Chinese locale', async () => {
    const { t, getLocale } = await loadTranslator('zh-cn');
    expect(getLocale()).toBe('zh-cn');
    expect(t('webview.refs.heading')).toBe('分支');
    expect(t('webview.files.selectCommit')).toBe('选择一个提交以查看其变更文件。');
  });

  it('renders English when the injected locale is not Chinese', async () => {
    const { t } = await loadTranslator('en');
    expect(t('webview.refs.heading')).toBe('Branches');
  });

  it('falls back to English when the active locale has no translation for a key', async () => {
    const { t, zhCn } = await loadTranslator('zh');
    delete (zhCn as Record<string, string>)['webview.refs.heading'];
    expect(t('webview.refs.heading')).toBe('Branches');
  });

  it('returns the key itself for unknown keys instead of throwing', async () => {
    const { t } = await loadTranslator('zh-cn');
    expect(t('webview.missing.key')).toBe('webview.missing.key');
  });

  it('interpolates placeholders in both locales', async () => {
    const zh = await loadTranslator('zh-cn');
    expect(zh.t('webview.files.parent', { index: 2, hash: 'abcdef12' })).toBe(
      '父提交 2 · abcdef12',
    );
    const en = await loadTranslator('en-us');
    expect(en.t('webview.files.parent', { index: 2, hash: 'abcdef12' })).toBe(
      'Parent 2 · abcdef12',
    );
  });

  it('keeps the Chinese dictionary a valid subset of the English source', async () => {
    const { en, zhCn } = await loadTranslator('en');
    for (const [key, value] of Object.entries(zhCn)) {
      const english = en[key];
      expect(english, `unexpected translation key ${key}`).toBeTypeOf('string');
      expect(value.length).toBeGreaterThan(0);
      const enPlaceholders = [...(english ?? '').matchAll(/\{(\w+)\}/gu)]
        .map((match) => match[1])
        .sort();
      const zhPlaceholders = [...value.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();
      expect(zhPlaceholders, `placeholder mismatch for ${key}`).toEqual(enPlaceholders);
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value.length, `empty English string for ${key}`).toBeGreaterThan(0);
    }
  });
});
