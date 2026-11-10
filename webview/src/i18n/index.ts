import { en } from './en';
import { zhCn } from './zhCn';

function detectLocale(): string {
  if (typeof document === 'undefined') return 'en';
  const meta = document.querySelector('meta[name="vscode-locale"]');
  const content = meta?.getAttribute('content')?.trim().toLowerCase();
  return content && content.length > 0 ? content : 'en';
}

const locale = detectLocale();
const isZh = locale.startsWith('zh');

/**
 * Translate a webview UI string by key.
 *
 * Resolution order: active-locale override → English source → the key itself,
 * so a missing translation renders English (never the raw key) and never throws.
 * `{placeholder}` tokens are filled from `params` when provided.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let value = (isZh ? zhCn[key] : undefined) ?? en[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

export function getLocale(): string {
  return locale;
}
