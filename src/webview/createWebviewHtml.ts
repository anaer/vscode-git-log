import { renderFileIconDefinitions } from '../shared/fileIconKind';

export interface WebviewHtmlOptions {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  nonce: string;
  /** VS Code display language (e.g. `zh-cn`); the webview reads it to pick a locale. */
  locale?: string;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createWebviewHtml(options: WebviewHtmlOptions): string {
  const cspSource = escapeAttribute(options.cspSource);
  const scriptUri = escapeAttribute(options.scriptUri);
  const styleUri = escapeAttribute(options.styleUri);
  const nonce = escapeAttribute(options.nonce);
  const locale = escapeAttribute(options.locale?.trim() || 'en');

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="vscode-locale" content="${locale}" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource}; font-src ${cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Git Log</title>
  </head>
  <body>
    ${renderFileIconDefinitions()}
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
