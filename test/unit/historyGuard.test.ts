import { describe, expect, it, vi } from 'vitest';
import {
  assessHistoryGuard,
  DEFAULT_PROTECTED_BRANCHES,
  isGuardedOperation,
  isProtectedBranch,
  operationTargetHashes,
  pushedRewriteWarning,
  type PushedRewriteInfo,
} from '../../src/git/historyGuard';
import { getOperationConfirmation } from '../../src/git/GitOperationService';
import type { GitRunner } from '../../src/git/GitRunner';
import type { GitOperationRequest } from '../../src/protocol/messages';
import type { RepositorySummary } from '../../src/shared/models';

const repository: RepositorySummary = {
  id: 'repo-1',
  rootUri: 'file:///C:/workspace/project',
  gitDirUri: 'file:///C:/workspace/project/.git',
  displayName: 'project',
  isBare: false,
};

const hashes = ['a'.repeat(40), 'b'.repeat(40)];
const drop: GitOperationRequest = { kind: 'dropCommits', hashes };
const forcePush: GitOperationRequest = { kind: 'push', forceWithLease: true };
const amend: GitOperationRequest = { kind: 'amendCommit', message: 'amended' };
const pushed: PushedRewriteInfo = { count: 2, branches: ['origin/main'], uncertain: false };
const clean: PushedRewriteInfo = { count: 0, branches: [], uncertain: false };
const uncertain: PushedRewriteInfo = { count: 3, branches: [], uncertain: true };

describe('history guard', () => {
  it('treats main/master as protected, an empty list as disabled, and detached HEAD conservatively', () => {
    expect(isProtectedBranch('main', DEFAULT_PROTECTED_BRANCHES)).toBe(true);
    expect(isProtectedBranch('master', DEFAULT_PROTECTED_BRANCHES)).toBe(true);
    expect(isProtectedBranch('feature/x', DEFAULT_PROTECTED_BRANCHES)).toBe(false);
    expect(isProtectedBranch(undefined, DEFAULT_PROTECTED_BRANCHES)).toBe(true);
    expect(isProtectedBranch('main', [])).toBe(false);
    expect(isProtectedBranch(undefined, [])).toBe(false);
    expect(isProtectedBranch('release', ['release'])).toBe(true);
  });

  it('guards every rewrite kind and force push, but never Amend HEAD', () => {
    const guarded: GitOperationRequest[] = [
      drop,
      { kind: 'squashCommits', hashes, message: 'combined' },
      { kind: 'editCommitMessages', edits: [{ hash: hashes[0]!, message: 'rewritten' }] },
      { kind: 'rewriteAuthorIdentity', hashes: [hashes[0]!], name: 'A', email: 'a@example.com' },
      { kind: 'undoLastCommit', hash: hashes[0]! },
      { kind: 'fixupCommit', hash: hashes[0]! },
      forcePush,
    ];
    const unguarded: GitOperationRequest[] = [
      amend,
      { kind: 'push' },
      { kind: 'checkout', ref: 'main' },
      { kind: 'reset', hash: hashes[0]!, mode: 'hard' },
    ];
    for (const operation of guarded) expect(isGuardedOperation(operation)).toBe(true);
    for (const operation of unguarded) expect(isGuardedOperation(operation)).toBe(false);
  });

  it('extracts target hashes from every rewrite payload', () => {
    expect(operationTargetHashes(drop)).toEqual(hashes);
    expect(
      operationTargetHashes({
        kind: 'editCommitMessages',
        edits: [{ hash: hashes[0]!, message: 'rewritten' }],
      }),
    ).toEqual([hashes[0]]);
    expect(operationTargetHashes({ kind: 'undoLastCommit', hash: hashes[0]! })).toEqual([
      hashes[0],
    ]);
    expect(operationTargetHashes({ kind: 'fixupCommit', hash: hashes[1]! })).toEqual([hashes[1]]);
    expect(operationTargetHashes(forcePush)).toEqual([]);
    expect(operationTargetHashes(amend)).toEqual([]);
  });

  it('blocks force push on protected branches regardless of pushed state', () => {
    expect(
      assessHistoryGuard('main', DEFAULT_PROTECTED_BRANCHES, forcePush, undefined).blocked,
    ).toContain('protected branch');
    expect(
      assessHistoryGuard('feature', DEFAULT_PROTECTED_BRANCHES, forcePush, undefined).blocked,
    ).toBeUndefined();
    expect(assessHistoryGuard('main', [], forcePush, undefined).blocked).toBeUndefined();
  });

  it('blocks pushed rewrites on protected branches and warns elsewhere', () => {
    expect(
      assessHistoryGuard('main', DEFAULT_PROTECTED_BRANCHES, drop, pushed).blocked,
    ).toContain('already-pushed');
    expect(
      assessHistoryGuard('feature', DEFAULT_PROTECTED_BRANCHES, drop, pushed).pushedRewrite,
    ).toEqual(pushed);
    expect(
      assessHistoryGuard('main', DEFAULT_PROTECTED_BRANCHES, drop, clean).blocked,
    ).toBeUndefined();
    expect(assessHistoryGuard('main', [], drop, pushed).pushedRewrite).toEqual(pushed);
    expect(
      assessHistoryGuard('main', DEFAULT_PROTECTED_BRANCHES, { kind: 'undoLastCommit', hash: hashes[0]! }, pushed)
        .blocked,
    ).toContain('already-pushed');
    expect(
      assessHistoryGuard('main', DEFAULT_PROTECTED_BRANCHES, { kind: 'fixupCommit', hash: hashes[0]! }, pushed)
        .blocked,
    ).toContain('already-pushed');
  });

  it('falls back to "all pushed" when remote detection is uncertain', () => {
    expect(
      assessHistoryGuard('main', DEFAULT_PROTECTED_BRANCHES, drop, uncertain).blocked,
    ).toContain('3 already-pushed');
    expect(
      assessHistoryGuard('feature', DEFAULT_PROTECTED_BRANCHES, drop, uncertain).pushedRewrite,
    ).toEqual(uncertain);
  });

  it.each([
    ['feature', DEFAULT_PROTECTED_BRANCHES, pushed],
    ['main', [], pushed],
    ['feature', [], uncertain],
    ['feature', [], { count: 0, branches: [], uncertain: true }],
    ['feature', [], undefined],
  ] as const)('blocks undo of pushed or unknown HEAD on %s regardless of protection', (branch, protection, info) => {
    const result = assessHistoryGuard(branch, protection, { kind: 'undoLastCommit', hash: hashes[0]! }, info);
    expect(result.blocked).toMatch(/already-pushed|could not be verified/u);
    expect(result.pushedRewrite).toBeUndefined();
  });

  it('allows undo only when HEAD is known to be unpushed', () => {
    expect(assessHistoryGuard('main', DEFAULT_PROTECTED_BRANCHES, { kind: 'undoLastCommit', hash: hashes[0]! }, clean)).toEqual({});
  });

  it('never guards Amend HEAD and renders a readable pushed warning', () => {
    expect(assessHistoryGuard('main', DEFAULT_PROTECTED_BRANCHES, amend, pushed)).toEqual({});
    expect(pushedRewriteWarning(pushed)).toContain(
      '2 of these commits are already pushed on origin/main',
    );
    expect(pushedRewriteWarning(uncertain)).toContain('remote state could not be verified');
  });

  it('appends the pushed warning only to rewrite confirmations that have one', async () => {
    expect(getOperationConfirmation(repository, drop, pushed)?.detail).toContain(
      '2 of these commits are already pushed on origin/main',
    );
    expect(getOperationConfirmation(repository, drop)?.detail).not.toContain('Warning:');
    expect(getOperationConfirmation(repository, drop, clean)?.detail).not.toContain('Warning:');
    // Force push is guarded but has no target hashes, so its confirmation stays unchanged.
    expect(getOperationConfirmation(repository, forcePush, pushed)?.detail).not.toContain(
      'Warning:',
    );
  });

  it('blocks a protected force push before any Git command runs', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn();
    const service = new GitOperationService({ run } as unknown as GitRunner, {
      inspectRepository: async () => ({ ...repository, currentBranch: 'main' }),
    });

    await expect(service.run(repository, forcePush)).rejects.toThrow('protected branch');
    expect(run).not.toHaveBeenCalled();
  });

  it('applies protected-branch setting changes without recreating the service', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn(async () => ({
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      exitCode: 0,
      durationMs: 1,
    }));
    const service = new GitOperationService({ run } as unknown as GitRunner, {
      inspectRepository: async () => ({ ...repository, currentBranch: 'main' }),
    });

    service.setProtectedBranches([]);
    await service.run(repository, forcePush, { confirm: async () => true }).catch(() => undefined);
    expect(run).toHaveBeenCalled();

    run.mockClear();
    service.setProtectedBranches(['main']);
    await expect(service.run(repository, forcePush)).rejects.toThrow('protected branch');
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves Amend HEAD on an unprotected path even on a protected branch', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn(async () => ({
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      exitCode: 0,
      durationMs: 1,
    }));
    const service = new GitOperationService({ run } as unknown as GitRunner, {
      inspectRepository: async () => ({ ...repository, currentBranch: 'main' }),
    });

    await expect(
      service.run(repository, amend, { confirm: async () => true }),
    ).resolves.toMatchObject({ message: 'amendCommit completed.' });
    expect(run).toHaveBeenCalledOnce();
  });
});
