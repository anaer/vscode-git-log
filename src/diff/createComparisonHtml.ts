import type { ChangedFile } from '../shared/models';
import {
  renderFileIcon,
  renderFileIconDefinitions,
} from '../shared/fileIconKind';

interface ComparisonFile {
  file: ChangedFile;
  index: number;
  name: string;
}

interface ComparisonDirectory {
  directories: Map<string, ComparisonDirectory>;
  files: ComparisonFile[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createDirectory(): ComparisonDirectory {
  return { directories: new Map(), files: [] };
}

function buildFileTree(files: readonly ChangedFile[]): ComparisonDirectory {
  const root = createDirectory();

  files.forEach((file, index) => {
    const pathParts = file.path.split('/');
    const name = pathParts.pop() ?? file.path;
    let directory = root;

    for (const part of pathParts) {
      let child = directory.directories.get(part);
      if (!child) {
        child = createDirectory();
        directory.directories.set(part, child);
      }
      directory = child;
    }

    directory.files.push({ file, index, name });
  });

  return root;
}

function renderFileRow({ file, index, name }: ComparisonFile): string {
  const additions =
    file.additions === undefined
      ? ''
      : `<span class="file-stat-additions">+${String(file.additions)}</span>`;
  const deletions =
    file.deletions === undefined
      ? ''
      : `<span class="file-stat-deletions">-${String(file.deletions)}</span>`;
  const binary = file.binary ? '<span class="file-binary">Binary</span>' : '';

  return `<button class="file-row" type="button" data-file-index="${String(index)}" title="${escapeHtml(file.path)}"${file.binary ? ' disabled' : ''}>
    <span class="file-status status-${escapeHtml(file.status)}">${escapeHtml(file.status)}</span>
    ${renderFileIcon(name, file.binary)}
    <span class="file-name">${escapeHtml(name)}</span>
    <span class="file-stats">${additions}${deletions}${binary}</span>
  </button>`;
}

function renderDirectory(directory: ComparisonDirectory): string {
  const directories = [...directory.directories.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([name, child]) => `<details class="file-directory" open>
        <summary>${escapeHtml(name)}</summary>
        <div class="file-directory-children">${renderDirectory(child)}</div>
      </details>`,
    )
    .join('');
  const files = [...directory.files]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(renderFileRow)
    .join('');

  return directories + files;
}

export function createComparisonHtml(options: {
  title: string;
  files: readonly ChangedFile[];
  nonce: string;
}): string {
  const rows = renderDirectory(buildFileTree(options.files));
  const textFileCount = options.files.filter((file) => !file.binary).length;
  const binaryFileCount = options.files.length - textFileCount;
  const binarySummary = binaryFileCount > 0 ? ` · ${String(binaryFileCount)} binary omitted` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${options.nonce}'; script-src 'nonce-${options.nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  <style nonce="${options.nonce}">
    :root { --explorer-row-height: 22px; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body { overflow: hidden; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    .comparison-shell { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; }
    .comparison-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding: 10px 12px; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    .comparison-heading { min-width: 0; }
    .comparison-title { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .comparison-summary { margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .comparison-mode-button { display: inline-flex; align-items: center; justify-content: center; height: 26px; padding: 0 8px; gap: 5px; border: 0; border-radius: 3px; color: var(--vscode-icon-foreground, currentColor); background: transparent; font: inherit; cursor: pointer; }
    .comparison-mode-button:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); }
    .comparison-mode-button.selected { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); }
    .comparison-mode-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .comparison-mode-button:disabled { opacity: 0.45; cursor: default; }
    .comparison-mode-button svg { width: 16px; height: 16px; fill: currentColor; }
    .file-list { min-height: 0; overflow: auto; }
    .file-directory > summary { display: flex; align-items: center; height: var(--explorer-row-height); padding: 0 8px 0 0; overflow: hidden; font-weight: 400; white-space: nowrap; cursor: pointer; user-select: none; }
    .file-directory > summary::-webkit-details-marker { display: none; }
    .file-directory > summary::marker { content: ''; }
    .file-directory > summary::before { width: 7px; height: 7px; margin: 0 7px 0 3px; flex: 0 0 auto; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; content: ''; transform: rotate(-45deg); transform-origin: center; }
    .file-directory[open] > summary::before { transform: rotate(45deg); }
    .file-directory > summary:hover { background: var(--vscode-list-hoverBackground); }
    .file-directory > summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .file-directory-children { margin-left: 10px; padding-left: 10px; border-left: 1px solid var(--vscode-tree-indentGuidesStroke, transparent); }
    .file-row { display: grid; grid-template-columns: 16px 16px minmax(0, 1fr) auto; align-items: center; width: 100%; height: var(--explorer-row-height); padding: 0 8px; gap: 5px; border: 0; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; }
    .file-row:hover { background: var(--vscode-list-hoverBackground); }
    .file-row.selected { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); }
    .file-row:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .file-row:disabled { cursor: default; opacity: 0.7; }
    .file-status { font-weight: 700; text-align: center; }
    .file-icon-definitions { position: absolute; width: 0; height: 0; overflow: hidden; }
    .file-type-icon { display: block; width: 16px; height: 16px; overflow: visible; color: var(--vscode-descriptionForeground); }
    .file-type-dart { color: #40c4ff; }
    .file-type-typescript { color: #3178c6; }
    .file-type-javascript { color: #d6ba32; }
    .file-type-react { color: #61dafb; }
    .file-type-html { color: #e44d26; }
    .file-type-css { color: #42a5f5; }
    .file-type-json, .file-type-yaml, .file-type-config { color: var(--vscode-symbolIcon-objectForeground, #d7ba7d); }
    .file-type-markdown, .file-type-document { color: #519aba; }
    .file-type-image { color: #b180d7; }
    .file-type-archive { color: #cca700; }
    .file-type-shell { color: #89e051; }
    .file-type-python { color: #3572a5; }
    .file-type-java { color: #b07219; }
    .file-type-kotlin { color: #a97bff; }
    .file-type-swift { color: #f05138; }
    .file-type-go { color: #00add8; }
    .file-type-rust { color: #dea584; }
    .file-type-c, .file-type-cpp, .file-type-csharp { color: var(--vscode-symbolIcon-methodForeground, #b180d7); }
    .file-type-php { color: #777bb4; }
    .file-type-ruby { color: #cc342d; }
    .file-type-sql { color: #e38c00; }
    .file-type-xml { color: #e37933; }
    .file-type-binary { color: var(--vscode-disabledForeground); }
    .file-name { overflow: hidden; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
    .file-stats { display: flex; align-items: center; gap: 7px; font-variant-numeric: tabular-nums; }
    .file-stat-additions { color: var(--vscode-gitDecoration-addedResourceForeground); }
    .file-stat-deletions { color: var(--vscode-gitDecoration-deletedResourceForeground); }
    .file-binary { color: var(--vscode-descriptionForeground); }
    .empty { padding: 24px; color: var(--vscode-descriptionForeground); text-align: center; }
  </style>
</head>
<body>
  ${renderFileIconDefinitions()}
  <main class="comparison-shell">
    <header class="comparison-header">
      <div class="comparison-heading">
        <div class="comparison-title">${escapeHtml(options.title)}</div>
        <div class="comparison-summary">${String(options.files.length)} changed files${binarySummary} · Select a file or show all changes</div>
      </div>
      <button class="comparison-mode-button" type="button" data-open-all-comparisons aria-label="Show all changes" title="Show all text changes"${textFileCount > 0 ? '' : ' disabled'}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h5v5H2V2Zm1 1v3h3V3H3Zm6-1h5v5H9V2Zm1 1v3h3V3h-3ZM2 9h5v5H2V9Zm1 1v3h3v-3H3Zm6-1h5v5H9V9Zm1 1v3h3v-3h-3Z"/></svg>
        <span>All Changes</span>
      </button>
    </header>
    <section class="file-list" aria-label="Changed files">${rows || '<div class="empty">No changed files</div>'}</section>
  </main>
  <script nonce="${options.nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const allChanges = event.target instanceof Element ? event.target.closest('[data-open-all-comparisons]') : null;
      if (allChanges instanceof HTMLButtonElement && !allChanges.disabled) {
        document.querySelectorAll('.file-row.selected').forEach((row) => row.classList.remove('selected'));
        allChanges.classList.add('selected');
        vscode.postMessage({ type: 'openAllComparisonFiles' });
        return;
      }
      const target = event.target instanceof Element ? event.target.closest('[data-file-index]') : null;
      if (!(target instanceof HTMLButtonElement) || target.disabled) return;
      document.querySelectorAll('.file-row.selected').forEach((row) => row.classList.remove('selected'));
      document.querySelector('[data-open-all-comparisons]')?.classList.remove('selected');
      target.classList.add('selected');
      vscode.postMessage({ type: 'openComparisonFile', index: Number(target.dataset.fileIndex) });
    });
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message?.type === 'comparisonAllClosed') {
        document.querySelector('[data-open-all-comparisons]')?.classList.remove('selected');
      }
    });
  </script>
</body>
</html>`;
}
