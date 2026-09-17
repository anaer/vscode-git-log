export function parseTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface CommitSummaryHeader {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorTime: number;
}

/**
 * Parses the common leading fields of a commit record rendered via the
 * NUL-delimited header: hash, parents, author name, author email and author
 * timestamp. Concrete parsers append format-specific trailing fields.
 */
export function parseCommitSummaryHeader(fields: readonly string[]): CommitSummaryHeader {
  return {
    hash: fields[0] ?? '',
    parents: (fields[1] ?? '').split(' ').filter(Boolean),
    authorName: fields[2] ?? '',
    authorEmail: fields[3] ?? '',
    authorTime: parseTimestamp(fields[4]),
  };
}