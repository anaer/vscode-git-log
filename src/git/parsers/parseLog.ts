import type { CommitSummary } from '../../shared/models';
import { parseCommitSummaryHeader, parseTimestamp } from './commitSummary';

export function parseLog(output: Buffer): CommitSummary[] {
  return output
    .toString('utf8')
    .split('\x1e')
    .filter((record) => record.length > 0)
    .map((record) => {
      const fields = record.replace(/^\r?\n/u, '').split('\0');

      return {
        ...parseCommitSummaryHeader(fields),
        commitTime: parseTimestamp(fields[5]),
        subject: fields[6] ?? '',
        refs: [],
      } satisfies CommitSummary;
    })
    .filter((commit) => commit.hash.length > 0);
}

export interface SearchableCommit {
  commit: CommitSummary;
  body: string;
}

export function parseSearchableLog(output: Buffer): SearchableCommit[] {
  return output
    .toString('utf8')
    .split('\x1e')
    .filter((record) => record.length > 0)
    .map((record) => {
      const fields = record.replace(/^\r?\n/u, '').split('\0');
      return {
        commit: {
          ...parseCommitSummaryHeader(fields),
          commitTime: parseTimestamp(fields[5]),
          subject: fields[6] ?? '',
          refs: [],
        },
        body: fields[7] ?? '',
      } satisfies SearchableCommit;
    })
    .filter(({ commit }) => commit.hash.length > 0);
}
