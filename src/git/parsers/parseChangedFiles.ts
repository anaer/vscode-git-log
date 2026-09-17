import type { ChangedFile, ChangedFileStatus } from '../../shared/models';

const supportedStatuses = new Set<ChangedFileStatus>(['A', 'M', 'D', 'R', 'C', 'T', 'U']);

function statusFromToken(token: string): ChangedFileStatus | undefined {
  const status = token[0] as ChangedFileStatus | undefined;
  return status && supportedStatuses.has(status) ? status : undefined;
}

export function parseNameStatus(output: Buffer): ChangedFile[] {
  const fields = output.toString('utf8').split('\0');
  const files: ChangedFile[] = [];
  let index = 0;

  while (index < fields.length) {
    const token = fields[index]?.replace(/^\r?\n/u, '') ?? '';
    index += 1;
    if (!token) continue;

    const status = statusFromToken(token);
    if (!status) continue;

    if (status === 'R' || status === 'C') {
      const oldPath = fields[index] ?? '';
      const path = fields[index + 1] ?? '';
      index += 2;
      if (oldPath && path) files.push({ status, oldPath, path, binary: false });
      continue;
    }

    const path = fields[index] ?? '';
    index += 1;
    if (path) files.push({ status, path, binary: false });
  }

  return files;
}

interface NumstatEntry {
  additions?: number;
  deletions?: number;
  binary: boolean;
}

function parseCount(value: string): number | undefined {
  if (value === '-') return undefined;
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) ? count : undefined;
}

function parseNumstat(output: Buffer): Map<string, NumstatEntry> {
  const fields = output.toString('utf8').split('\0');
  const entries = new Map<string, NumstatEntry>();
  let index = 0;

  while (index < fields.length) {
    const header = fields[index] ?? '';
    index += 1;
    if (!header) continue;

    const parts = header.split('\t');
    // In numstat, only an explicit '-' marks a binary file. Anything else
    // (including a missing value) is not a reliable binary signal, so we do
    // not infer binary from an absent count.
    const binary = parts[0] === '-' || parts[1] === '-';
    const additions = parseCount(binary ? '-' : (parts[0] ?? ''));
    const deletions = parseCount(binary ? '-' : (parts[1] ?? ''));
    let path = parts.slice(2).join('\t');

    if (!path) {
      index += 1;
      path = fields[index] ?? '';
      index += 1;
    }

    if (!path) continue;
    const entry: NumstatEntry = {
      ...(additions !== undefined ? { additions } : {}),
      ...(deletions !== undefined ? { deletions } : {}),
      binary,
    };
    registerNumstatPath(entries, path, entry);
  }

  return entries;
}

/**
 * Registers a numstat entry under the path key(s) that consumers will look up.
 *
 * For renames/copies git renders the numstat path as `{old} => {new}`, which
 * does not equal the file's `path` field, so the entry is registered under both
 * the old and new paths to keep rename/copy statistics findable.
 */
function registerNumstatPath(
  entries: Map<string, NumstatEntry>,
  path: string,
  entry: NumstatEntry,
): void {
  const rename = path.match(/^(.*) => (.*)$/u);
  if (rename) {
    entries.set(rename[1]!, entry);
    entries.set(rename[2]!, entry);
    return;
  }
  entries.set(path, entry);
}

export function applyNumstat(files: readonly ChangedFile[], output: Buffer): ChangedFile[] {
  const stats = parseNumstat(output);
  return files.map((file) => {
    const entry = stats.get(file.path) ?? (file.oldPath ? stats.get(file.oldPath) : undefined);
    if (!entry) return file;
    return {
      ...file,
      ...(entry.additions !== undefined ? { additions: entry.additions } : {}),
      ...(entry.deletions !== undefined ? { deletions: entry.deletions } : {}),
      binary: entry.binary,
    };
  });
}
