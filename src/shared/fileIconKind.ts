export type FileIconKind =
  | 'archive'
  | 'binary'
  | 'c'
  | 'config'
  | 'cpp'
  | 'csharp'
  | 'css'
  | 'dart'
  | 'document'
  | 'file'
  | 'go'
  | 'html'
  | 'image'
  | 'java'
  | 'javascript'
  | 'json'
  | 'kotlin'
  | 'markdown'
  | 'php'
  | 'python'
  | 'react'
  | 'ruby'
  | 'rust'
  | 'shell'
  | 'sql'
  | 'swift'
  | 'typescript'
  | 'xml'
  | 'yaml';

export const iconLabels: Readonly<Record<FileIconKind, string>> = {
  archive: 'ZIP',
  binary: '01',
  c: 'C',
  config: '⚙',
  cpp: 'C+',
  csharp: 'C#',
  css: '#',
  dart: 'D',
  document: 'TXT',
  file: '',
  go: 'GO',
  html: '<>',
  image: '▧',
  java: 'J',
  javascript: 'JS',
  json: '{}',
  kotlin: 'K',
  markdown: 'M',
  php: 'P',
  python: 'PY',
  react: '⚛',
  ruby: 'RB',
  rust: 'RS',
  shell: '$_',
  sql: 'DB',
  swift: 'S',
  typescript: 'TS',
  xml: '<>',
  yaml: 'Y',
};

export const extensionIconKinds: Readonly<Record<string, FileIconKind>> = {
  '7z': 'archive',
  aac: 'binary',
  avi: 'binary',
  bmp: 'image',
  bz2: 'archive',
  c: 'c',
  cc: 'cpp',
  cfg: 'config',
  conf: 'config',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  csv: 'document',
  cxx: 'cpp',
  dart: 'dart',
  doc: 'document',
  docx: 'document',
  env: 'config',
  flac: 'binary',
  gif: 'image',
  go: 'go',
  gradle: 'config',
  gz: 'archive',
  h: 'c',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  ico: 'image',
  ini: 'config',
  java: 'java',
  jpeg: 'image',
  jpg: 'image',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'react',
  kt: 'kotlin',
  kts: 'kotlin',
  lock: 'config',
  m: 'c',
  md: 'markdown',
  mdx: 'markdown',
  mk: 'config',
  mov: 'binary',
  mp3: 'binary',
  mp4: 'binary',
  pdf: 'document',
  php: 'php',
  plist: 'config',
  png: 'image',
  properties: 'config',
  ps1: 'shell',
  py: 'python',
  rar: 'archive',
  rb: 'ruby',
  rs: 'rust',
  sass: 'css',
  scss: 'css',
  sh: 'shell',
  sql: 'sql',
  svg: 'image',
  swift: 'swift',
  tar: 'archive',
  toml: 'config',
  ts: 'typescript',
  tsx: 'react',
  txt: 'document',
  wav: 'binary',
  webp: 'image',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zip: 'archive',
  zsh: 'shell',
};

export const specialIconBodies: Readonly<Partial<Record<FileIconKind, string>>> = {
  archive: `<path fill="currentColor" d="M3 1.5h7l3 3v10H3z"/><path fill="#fff" fill-opacity=".9" d="M7.1 2h1.8v1.6H7.1zm0 2.2h1.8v1.6H7.1zm0 2.2h1.8V8H7.1zm-.4 2.2h2.6v3.8H6.7z"/>`,
  binary: `<path fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-linejoin="round" d="M3 1.5h6.5L13 5v9.5H3z"/><path fill="none" stroke="currentColor" stroke-linecap="round" d="M9.5 1.5V5H13"/><circle cx="6" cy="8" r="1" fill="currentColor"/><path stroke="currentColor" stroke-width="1.3" d="M9.5 7v2m-4 2v2m4-2v2"/>`,
  config: `<path fill="currentColor" d="M7 1h2l.5 1.7 1.4.6 1.6-.8 1.4 1.4-.8 1.6.6 1.4 1.7.6v2l-1.7.5-.6 1.4.8 1.6-1.4 1.4-1.6-.8-1.4.6L9 15H7l-.5-1.7-1.4-.6-1.6.8-1.4-1.4.8-1.6-.6-1.4-1.7-.6v-2l1.7-.6.6-1.4-.8-1.6 1.4-1.4 1.6.8 1.4-.6z"/><circle cx="8" cy="8" r="2.3" fill="var(--vscode-editor-background)"/>`,
  dart: `<path fill="currentColor" d="M2 3.3 5.2 1h5.1L15 5.7v4.8L11.5 15H6.3L2 10.7z"/><path fill="#fff" fill-opacity=".82" d="m5.2 3.2 4.2.1 3.2 3H7.3z"/><path fill="#075b80" fill-opacity=".65" d="M7.3 6.3h5.3l-2.1 3.2H6z"/><path fill="#fff" fill-opacity=".68" d="m6 9.5 4.5.1-1.3 2.1H7.8z"/>`,
  document: `<path fill="currentColor" d="M3 1.5h6.5L13 5v9.5H3z"/><path fill="#fff" fill-opacity=".88" d="M9.5 1.5V5H13zM5 7h6v1H5zm0 2.2h6v1H5zm0 2.2h4.5v1H5z"/>`,
  file: `<path fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-linejoin="round" d="M3 1.5h6.5L13 5v9.5H3z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M9.5 1.5V5H13"/>`,
  image: `<rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="currentColor"/><circle cx="5" cy="5.5" r="1.4" fill="#fff" fill-opacity=".9"/><path fill="#fff" fill-opacity=".88" d="m3 12 3.4-3.5 2.1 2 1.8-2.2L13 12z"/>`,
  json: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" d="M6.2 2.2H5c-1 0-1.5.6-1.5 1.6v2.1c0 1-.5 1.7-1.5 2.1 1 .4 1.5 1.1 1.5 2.1v2.1c0 1 .5 1.6 1.5 1.6h1.2m3.6-11.6H11c1 0 1.5.6 1.5 1.6v2.1c0 1 .5 1.7 1.5 2.1-1 .4-1.5 1.1-1.5 2.1v2.1c0 1-.5 1.6-1.5 1.6H9.8"/>`,
  markdown: `<rect x="1" y="2.5" width="14" height="11" rx="1.5" fill="currentColor"/><path fill="#fff" d="M3 10.8V5.2h1.4L6 7.3l1.6-2.1H9v5.6H7.6V7.3L6 9.2 4.4 7.3v3.5zm8-5.6h1.4v3h1.4L11.7 11 9.6 8.2H11z"/>`,
  react: `<g fill="none" stroke="currentColor" stroke-width="1"><ellipse cx="8" cy="8" rx="6.8" ry="2.5"/><ellipse cx="8" cy="8" rx="6.8" ry="2.5" transform="rotate(60 8 8)"/><ellipse cx="8" cy="8" rx="6.8" ry="2.5" transform="rotate(120 8 8)"/></g><circle cx="8" cy="8" r="1.5" fill="currentColor"/>`,
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fileIconKind(name: string, binary: boolean): FileIconKind {
  const lowerName = name.toLowerCase();
  if (lowerName === 'dockerfile' || lowerName === 'makefile' || lowerName === 'podfile') {
    return 'config';
  }
  if (lowerName === '.gitignore' || lowerName === '.gitattributes' || lowerName === '.editorconfig') {
    return 'config';
  }
  const extension = lowerName.includes('.') ? lowerName.slice(lowerName.lastIndexOf('.') + 1) : '';
  return extensionIconKinds[extension] ?? (binary ? 'binary' : 'file');
}

export function renderFileIconDefinitions(): string {
  const definitions = (Object.entries(iconLabels) as Array<[FileIconKind, string]>)
    .map(([kind, label]) => {
      const specialBody = specialIconBodies[kind];
      const labelSize = label.length > 2 ? '4.2' : label.length > 1 ? '5.2' : '7';
      const labelColor = kind === 'javascript' ? '#252525' : '#fff';
      const body =
        specialBody ??
        `<rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="currentColor"/><text x="8" y="10.6" text-anchor="middle" fill="${labelColor}" font-family="Arial, sans-serif" font-size="${labelSize}" font-weight="700">${escapeHtml(label)}</text>`;
      return `<symbol id="file-icon-${kind}" viewBox="0 0 16 16">${body}</symbol>`;
    })
    .join('');

  return `<svg class="file-icon-definitions" aria-hidden="true">${definitions}</svg>`;
}

export function renderFileIcon(name: string, binary: boolean): string {
  const kind = fileIconKind(name, binary);
  return `<svg class="file-type-icon file-type-${kind}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="#file-icon-${kind}" /></svg>`;
}
