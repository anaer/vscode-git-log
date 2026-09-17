import type { ChangedFileStatus } from '../shared/models';

export type DiffSide =
  | { kind: 'empty'; path: string }
  | { kind: 'revision'; revision: string; path: string };

export interface DiffRequest {
  hash: string;
  parent?: string;
  path: string;
  oldPath?: string;
  status: ChangedFileStatus;
}

export interface DiffSides {
  left: DiffSide;
  right: DiffSide;
}

export function buildDiffSides(request: DiffRequest): DiffSides {
  const leftPath = request.oldPath ?? request.path;
  const left: DiffSide =
    request.status === 'A' || !request.parent
      ? { kind: 'empty', path: leftPath }
      : { kind: 'revision', revision: request.parent, path: leftPath };
  const right: DiffSide =
    request.status === 'D'
      ? { kind: 'empty', path: request.path }
      : { kind: 'revision', revision: request.hash, path: request.path };
  return { left, right };
}

export function buildRevisionFileTarget(
  request: DiffRequest,
): { revision: string; path: string } | undefined {
  if (request.status === 'D') {
    return request.parent
      ? { revision: request.parent, path: request.oldPath ?? request.path }
      : undefined;
  }
  return { revision: request.hash, path: request.path };
}

export interface RevisionQuery {
  repositoryId: string;
  revision: string;
  path: string;
  empty: boolean;
}

export function encodeRevisionQuery(query: RevisionQuery): string {
  // URLSearchParams encodes a literal '+' as '+' and decodes it back to a space
  // on the other side, which would corrupt file paths containing '+'. Percent-
  // encode each value so '+' (and every reserved character) round-trips exactly.
  return `repositoryId=${encodeURIComponent(query.repositoryId)}&revision=${encodeURIComponent(
    query.revision,
  )}&path=${encodeURIComponent(query.path)}&empty=${query.empty ? '1' : '0'}`;
}

function decodeQueryValue(value: string | null): string | undefined {
  if (value === null) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function parseRevisionQuery(query: string): RevisionQuery | undefined {
  const values = new URLSearchParams(query);
  const repositoryId = decodeQueryValue(values.get('repositoryId'));
  const revision = decodeQueryValue(values.get('revision'));
  const path = decodeQueryValue(values.get('path'));
  const emptyValue = values.get('empty');
  if (!repositoryId || revision === undefined || !path || (emptyValue !== '0' && emptyValue !== '1')) {
    return undefined;
  }
  if (path.includes('\0') || (!revision && emptyValue !== '1')) return undefined;
  return { repositoryId, revision, path, empty: emptyValue === '1' };
}
