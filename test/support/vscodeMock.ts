import { vi } from 'vitest';

/**
 * `vscode` only exists inside the extension host. Modules under test that call
 * `vscode.l10n.t()` need a stand-in, so translate to the source (English) text
 * with `{0}`-style argument substitution — the same behaviour the host has when
 * no translation bundle is active. Test files may override this with their own
 * `vi.mock('vscode', ...)`.
 */
vi.mock('vscode', () => {
  const translate = (message: string | { message: string }, ...args: unknown[]): string => {
    const text = typeof message === 'string' ? message : message.message;
    return args.reduce<string>(
      (result, arg, index) => result.replaceAll(`{${index}}`, String(arg)),
      text,
    );
  };
  const api = { l10n: { t: translate } };
  return { ...api, default: api };
});
