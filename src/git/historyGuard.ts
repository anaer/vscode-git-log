import type { GitOperationRequest } from '../protocol/messages';

export const DEFAULT_PROTECTED_BRANCHES: readonly string[] = ['main', 'master'];

const HISTORY_REWRITE_KINDS = new Set<GitOperationRequest['kind']>([
  'dropCommits',
  'squashCommits',
  'editCommitMessages',
  'rewriteAuthorIdentity',
]);

export interface PushedRewriteInfo {
  /** Target commits already reachable from a remote ref. */
  count: number;
  /** Remote branch short names containing those commits. */
  branches: readonly string[];
  /** Remote state could not be verified; every target was treated as pushed. */
  uncertain: boolean;
}

export interface GuardAssessment {
  blocked?: string;
  pushedRewrite?: PushedRewriteInfo;
}

/** An empty list disables every guard; a detached HEAD is treated as protected. */
export function isProtectedBranch(
  branch: string | undefined,
  protectedBranches: readonly string[],
): boolean {
  if (protectedBranches.length === 0) return false;
  if (!branch) return true;
  return protectedBranches.includes(branch);
}

export function isHistoryRewriteOperation(operation: GitOperationRequest): boolean {
  return HISTORY_REWRITE_KINDS.has(operation.kind);
}

export function isGuardedOperation(operation: GitOperationRequest): boolean {
  return (
    isHistoryRewriteOperation(operation) ||
    (operation.kind === 'push' && operation.forceWithLease === true)
  );
}

export function operationTargetHashes(operation: GitOperationRequest): readonly string[] {
  switch (operation.kind) {
    case 'dropCommits':
    case 'squashCommits':
    case 'rewriteAuthorIdentity':
      return operation.hashes;
    case 'editCommitMessages':
      return operation.edits.map((edit) => edit.hash);
    default:
      return [];
  }
}

export function pushedRewriteWarning(info: PushedRewriteInfo): string {
  const branches = info.branches.length > 0 ? ` on ${info.branches.join(', ')}` : '';
  const uncertainty = info.uncertain ? ' (remote state could not be verified)' : '';
  return (
    `Warning: ${String(info.count)} of these commits are already pushed${branches}${uncertainty}. ` +
    'Rewriting them requires a force push and affects other users.'
  );
}

export function assessHistoryGuard(
  branch: string | undefined,
  protectedBranches: readonly string[],
  operation: GitOperationRequest,
  pushedRewrite: PushedRewriteInfo | undefined,
): GuardAssessment {
  if (!isGuardedOperation(operation)) return {};
  const protectedBranch = isProtectedBranch(branch, protectedBranches);
  const branchLabel = branch ?? 'detached HEAD';

  if (operation.kind === 'push' && operation.forceWithLease) {
    return protectedBranch
      ? {
          blocked: `Force Push with Lease is blocked on protected branch “${branchLabel}”. Create a new branch instead.`,
        }
      : {};
  }
  if (!pushedRewrite || pushedRewrite.count === 0) return {};
  if (protectedBranch) {
    return {
      blocked:
        `Rewriting ${String(pushedRewrite.count)} already-pushed commit(s) is blocked on protected branch “${branchLabel}”. ` +
        'Create a new branch instead.',
    };
  }
  return { pushedRewrite };
}
