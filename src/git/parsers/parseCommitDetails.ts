import type { CommitDetails, SignatureStatus } from '../../shared/models';
import { parseCommitSummaryHeader, parseTimestamp } from './commitSummary';

function parseSignature(value: string | undefined): SignatureStatus {
  switch (value) {
    case 'G':
      return 'good';
    case 'B':
      return 'bad';
    case 'U':
      return 'unknown';
    case 'X':
    case 'Y':
      return 'expired';
    case 'R':
      return 'revoked';
    case 'E':
      return 'error';
    case 'N':
    default:
      return 'none';
  }
}

export function parseCommitDetails(output: Buffer): CommitDetails {
  const fields = output.toString('utf8').split('\0');
  const body = fields[8] ?? '';
  const subject = body.split(/\r?\n/u, 1)[0] ?? '';

  return {
    ...parseCommitSummaryHeader(fields),
    committerName: fields[5] ?? '',
    committerEmail: fields[6] ?? '',
    commitTime: parseTimestamp(fields[7]),
    subject,
    body,
    refs: [],
    signature: parseSignature(fields[9]),
  };
}
