import { fileURLToPath } from 'node:url';
import { normalize, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { MAX_FETCH_DEPTH, type GitOperationRequest } from '../protocol/messages';
import type { RepositorySummary } from '../shared/models';
import { inspectRepository } from '../repositories/discoverRepositories';
import { GitCommandError, type GitRunner } from './GitRunner';
import { classifyGitError, redactGitDiagnostic } from './classifyGitError';

export interface GitOperationResult {
  message: string;
  cancelled?: boolean;
  /** Ref names removed by a batch deletion, so callers can drop them from their filters. */
  deletedRefs?: string[];
}

export interface GitOperationRunOptions {
  confirm?(confirmation: OperationConfirmation): Promise<boolean>;
}

export interface GitOperationServiceOptions {
  inspectRepository?(repository: RepositorySummary): Promise<RepositorySummary | undefined>;
}

export interface OperationConfirmation {
  title: string;
  detail: string;
  confirmLabel: string;
  destructive: true;
}

function validateToken(value: string, label: string): string {
  if (!value || value.startsWith('-') || /[\0\r\n]/u.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function validateHash(value: string): string {
  if (!/^[0-9a-f]{4,64}$/iu.test(value)) throw new Error(`Invalid commit hash: ${value}`);
  return value;
}

/** Mirrors the protocol's depth bound; the extension is the last line of defence before spawn. */
function validateFetchDepth(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_FETCH_DEPTH) {
    throw new Error(`Invalid fetch depth: ${String(value)}`);
  }
  return value;
}

function validateStashRef(value: string): string {
  if (!/^stash@\{\d+\}$/u.test(value)) throw new Error(`Invalid stash reference: ${value}`);
  return value;
}

function validateCommitMessage(value: string, label: string): string {
  if (!value.trim() || value.length > 100_000 || value.includes('\0')) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function isRebaseControlOperation(operation: GitOperationRequest): boolean {
  return (
    operation.kind === 'rebaseContinue' ||
    operation.kind === 'rebaseSkip' ||
    operation.kind === 'rebaseAbort'
  );
}

/** Treats the buffer as a sequence of `\n`-terminated lines (the final line may lack a terminator) and returns each line without the trailing `\n`. */
function splitBufferLines(buffer: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0x0a) {
      lines.push(buffer.subarray(start, index));
      start = index + 1;
    }
  }
  if (start < buffer.length) lines.push(buffer.subarray(start));
  return lines;
}

/** ASCII header keywords are safe to compare after decoding the buffer with latin1. */
function headerLineStartsWith(line: Buffer, prefix: string): boolean {
  if (line.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (line[index] !== prefix.charCodeAt(index)) return false;
  }
  return true;
}

export function buildOperationArguments(
  operation: GitOperationRequest,
  forceSourceHash?: string,
): string[] {
  switch (operation.kind) {
    case 'checkout':
      return ['checkout', validateToken(operation.ref, 'revision'), '--'];
    case 'createBranch':
      return [
        'branch',
        '--',
        validateToken(operation.name, 'branch name'),
        validateToken(operation.startPoint, 'start point'),
      ];
    case 'createOrphanBranch':
      return ['switch', '--orphan', validateToken(operation.name, 'branch name')];
    case 'createTag':
      return [
        'tag',
        '--',
        validateToken(operation.name, 'tag name'),
        validateToken(operation.target, 'tag target'),
      ];
    case 'deleteTag':
      return ['tag', '-d', '--', validateToken(operation.name, 'tag name')];
    case 'checkoutRemote':
      return [
        'checkout',
        '-b',
        validateToken(operation.name, 'branch name'),
        '--track',
        validateToken(operation.startPoint, 'remote branch'),
      ];
    case 'deleteRemoteBranch':
      return [
        'push',
        validateToken(operation.remote, 'remote'),
        '--delete',
        `refs/heads/${validateToken(operation.branch, 'remote branch')}`,
      ];
    case 'fetch':
      return operation.remote
        ? ['fetch', validateToken(operation.remote, 'remote')]
        : ['fetch', '--all', '--prune'];
    case 'fetchFullHistory': {
      if (!operation.remote) {
        throw new Error('Fetch remote must be resolved before execution.');
      }
      const remote = validateToken(operation.remote, 'remote');
      // `--deepen N` adds N commits to the current depth and is cumulative across calls. Once
      // the increment reaches past the root, git drops the shallow boundary entirely.
      return operation.depth === undefined
        ? ['fetch', '--unshallow', remote]
        : ['fetch', `--deepen=${String(validateFetchDepth(operation.depth))}`, remote];
    }
    case 'pull':
      return ['pull'];
    case 'push':
      if (operation.forceWithLease) {
        if (!operation.remote || !operation.targetRef || !forceSourceHash) {
          throw new Error('Force push target must be resolved before execution.');
        }
        return [
          'push',
          `--force-with-lease=${validateToken(operation.targetRef, 'push target')}`,
          validateToken(operation.remote, 'push remote'),
          `${validateHash(forceSourceHash)}:${validateToken(operation.targetRef, 'push target')}`,
        ];
      }
      return ['push'];
    case 'publishBranch':
      if (!operation.remote || !operation.branch) {
        throw new Error('Publish target must be resolved before execution.');
      }
      return [
        'push',
        '--set-upstream',
        validateToken(operation.remote, 'push remote'),
        validateToken(operation.branch, 'branch name'),
      ];
    case 'cherryPick':
      return ['cherry-pick', validateHash(operation.hash)];
    case 'revert':
      return ['revert', '--no-edit', validateHash(operation.hash)];
    case 'merge':
      return ['merge', '--no-edit', validateToken(operation.ref, 'merge ref')];
    case 'rebase':
      return ['rebase', validateToken(operation.ref, 'rebase ref')];
    case 'rebaseContinue':
      return ['rebase', '--continue'];
    case 'rebaseSkip':
      return ['rebase', '--skip'];
    case 'rebaseAbort':
      return ['rebase', '--abort'];
    case 'reset':
      return ['reset', `--${operation.mode}`, validateHash(operation.hash), '--'];
    case 'renameBranch':
      return [
        'branch',
        '-m',
        '--',
        validateToken(operation.oldName, 'branch name'),
        validateToken(operation.newName, 'branch name'),
      ];
    case 'deleteBranch':
      return [
        'branch',
        operation.force ? '-D' : '-d',
        '--',
        validateToken(operation.name, 'branch name'),
      ];
    case 'deleteBranches':
      throw new Error('deleteBranches must be expanded into single branch deletions.');
    case 'deleteRefs':
      throw new Error('deleteRefs must be expanded into per-category deletions.');
    case 'createStash': {
      const message = operation.message.trim() || 'Git Log stash';
      if (message.length > 10_000 || message.includes('\0')) {
        throw new Error('Invalid stash message.');
      }
      return [
        'stash',
        'push',
        ...(operation.includeUntracked ? ['--include-untracked'] : []),
        '-m',
        message,
      ];
    }
    case 'applyStash':
      return ['stash', 'apply', validateStashRef(operation.stash)];
    case 'popStash':
      return ['stash', 'pop', validateStashRef(operation.stash)];
    case 'dropStash':
      return ['stash', 'drop', validateStashRef(operation.stash)];
    case 'amendCommit':
      return ['commit', '--amend', '-m', validateCommitMessage(operation.message, 'amend message')];
    case 'dropCommits':
    case 'squashCommits':
    case 'editCommitMessages':
    case 'rewriteAuthorIdentity':
      throw new Error(`${operation.kind} requires a validated history rewrite plan.`);
    case 'abortCherryPick':
      return ['cherry-pick', '--abort'];
    case 'abortRevert':
      return ['revert', '--abort'];
  }
}

export function getOperationConfirmation(
  repository: RepositorySummary,
  operation: GitOperationRequest,
): OperationConfirmation | undefined {
  if (operation.kind === 'reset' && operation.mode === 'hard') {
    return {
      title: 'Hard reset current branch?',
      detail: `Repository “${repository.displayName}” will be hard reset to ${operation.hash}. Uncommitted changes can be lost.`,
      confirmLabel: 'Hard Reset',
      destructive: true,
    };
  }
  if (operation.kind === 'createOrphanBranch') {
    return {
      title: `Create orphan branch “${operation.name}”?`,
      detail:
        `Repository “${repository.displayName}” will run “git switch --orphan” from ` +
        `“${repository.currentBranch ?? 'the detached HEAD'}” to “${operation.name}”, removing all tracked files ` +
        `from the working tree. Uncommitted tracked changes cannot be recovered; untracked and ignored files are kept. ` +
        `The new branch appears in the ref tree only after its first commit.`,
      confirmLabel: 'Create Orphan Branch',
      destructive: true,
    };
  }
  if (operation.kind === 'deleteBranch') {
    return {
      title: `Delete branch “${operation.name}”?`,
      detail: `Repository “${repository.displayName}” will delete local branch “${operation.name}”${operation.force ? ' even if it is not merged' : ''}.`,
      confirmLabel: operation.force ? 'Force Delete Branch' : 'Delete Branch',
      destructive: true,
    };
  }
  if (operation.kind === 'deleteBranches') {
    const total = operation.branches.length;
    const unmergedCount = operation.branches.filter((branch) => branch.force).length;
    const listed = operation.branches
      .slice(0, 8)
      .map((branch) => `${branch.name}${branch.force ? ' (not merged)' : ''}`)
      .join(', ');
    const remaining = total - 8;
    return {
      title: `Delete ${String(total)} local branches?`,
      detail:
        `Repository “${repository.displayName}” will delete: ${listed}` +
        `${remaining > 0 ? `, and ${String(remaining)} more` : ''}.` +
        (unmergedCount > 0
          ? ` ${String(unmergedCount)} of them are not merged into the current branch; their commits become unreachable.`
          : ''),
      confirmLabel: `Delete ${String(total)} Branches`,
      destructive: true,
    };
  }
  if (operation.kind === 'deleteRefs') {
    const { local, remote, tags } = operation;
    const parts: string[] = [];
    if (local.length > 0) {
      parts.push(`${String(local.length)} local branch${local.length === 1 ? '' : 'es'}`);
    }
    if (remote.length > 0) {
      parts.push(`${String(remote.length)} remote branch${remote.length === 1 ? '' : 's'}`);
    }
    if (tags.length > 0) {
      parts.push(`${String(tags.length)} tag${tags.length === 1 ? '' : 's'}`);
    }
    const unmerged = local.filter((branch) => branch.force).length;
    const detail =
      `Repository “${repository.displayName}” will delete ${parts.join(', ')}. ` +
      (remote.length > 0
        ? 'Remote entries are deleted on the shared remote and affect other users. '
        : '') +
      (unmerged > 0
        ? ` ${String(unmerged)} local branch(es) are not merged into the current branch and will be force-deleted; their commits become unreachable.`
        : 'Any unmerged local branch is refused and reported rather than force-deleted.');
    return {
      title: `Delete ${String(local.length + remote.length + tags.length)} reference${
        local.length + remote.length + tags.length === 1 ? '' : 's'
      }?`,
      detail,
      confirmLabel: 'Delete References',
      destructive: true,
    };
  }
  if (operation.kind === 'fetchFullHistory') {
    const refspecChange =
      operation.refspecTo !== undefined
        ? ` It will also change “remote.${operation.remote}.fetch” from “${operation.refspecFrom}” to “${operation.refspecTo}” so other branches become visible.`
        : '';
    if (operation.depth !== undefined) {
      return {
        title: `Fetch ${String(operation.depth)} more commits?`,
        detail:
          `Repository “${repository.displayName}” will run “git fetch --deepen=${String(operation.depth)}” against remote “${operation.remote}” to add ${String(operation.depth)} more commits of history. ` +
          `Existing history is kept, and this can be repeated. It contacts the remote and downloads history, so it may take a while.${refspecChange}`,
        confirmLabel: `Fetch ${String(operation.depth)} More`,
        destructive: true,
      };
    }
    return {
      title: 'Fetch full history?',
      detail:
        `Repository “${repository.displayName}” will run “git fetch --unshallow” against remote “${operation.remote}” to download the complete history. ` +
        `This contacts the remote and can take a long time and use significant disk space.${refspecChange}`,
      confirmLabel: 'Fetch Full History',
      destructive: true,
    };
  }
  if (operation.kind === 'deleteRemoteBranch') {
    return {
      title: `Delete remote branch “${operation.remote}/${operation.branch}”?`,
      detail: `Repository “${repository.displayName}” will delete remote branch “${operation.remote}/${operation.branch}”. Other users may depend on it.`,
      confirmLabel: 'Delete Remote Branch',
      destructive: true,
    };
  }
  if (operation.kind === 'deleteTag') {
    return {
      title: `Delete tag “${operation.name}”?`,
      detail: `Repository “${repository.displayName}” will delete local tag “${operation.name}”.`,
      confirmLabel: 'Delete Tag',
      destructive: true,
    };
  }
  if (operation.kind === 'dropStash') {
    return {
      title: `Drop ${operation.stash}?`,
      detail: `Repository “${repository.displayName}” will permanently remove ${operation.stash}.`,
      confirmLabel: 'Drop Stash',
      destructive: true,
    };
  }
  if (operation.kind === 'rebaseSkip') {
    return {
      title: 'Skip the current commit?',
      detail: `Repository “${repository.displayName}” will omit the current commit and continue the rebase.`,
      confirmLabel: 'Skip Commit',
      destructive: true,
    };
  }
  if (operation.kind === 'rebaseAbort') {
    return {
      title: 'Abort the current rebase?',
      detail: `Repository “${repository.displayName}” will stop rebasing and restore the branch to its pre-rebase state.`,
      confirmLabel: 'Abort Rebase',
      destructive: true,
    };
  }
  if (operation.kind === 'push' && operation.forceWithLease) {
    const target =
      operation.remote && operation.targetRef
        ? `${operation.remote}/${operation.targetRef}`
        : 'an unresolved remote branch';
    return {
      title: 'Force push with lease?',
      detail: `Repository “${repository.displayName}” will rewrite ${target} if its lease still matches.`,
      confirmLabel: 'Force Push with Lease',
      destructive: true,
    };
  }
  if (operation.kind === 'dropCommits' || operation.kind === 'squashCommits') {
    const count = operation.hashes.length;
    return {
      title: operation.kind === 'dropCommits' ? `Drop ${String(count)} commits?` : `Squash ${String(count)} commits?`,
      detail:
        operation.kind === 'dropCommits'
          ? `Repository “${repository.displayName}” will remove ${String(count)} commits from the current branch and rewrite newer commits.`
          : `Repository “${repository.displayName}” will combine ${String(count)} commits and rewrite newer commits.`,
      confirmLabel: operation.kind === 'dropCommits' ? 'Drop Commits' : 'Squash Commits',
      destructive: true,
    };
  }
  if (operation.kind === 'editCommitMessages') {
    const count = operation.edits.length;
    return {
      title: `Rewrite ${String(count)} commit message${count === 1 ? '' : 's'}?`,
      detail: `Repository “${repository.displayName}” will replace ${String(count)} commit message${count === 1 ? '' : 's'} and rewrite every affected commit on the current branch, amending their hashes.`,
      confirmLabel: 'Rewrite Commit Messages',
      destructive: true,
    };
  }
  if (operation.kind === 'rewriteAuthorIdentity') {
    const count = operation.hashes.length;
    return {
      title: `Rewrite author identity of ${String(count)} commit${count === 1 ? '' : 's'}?`,
      detail: `Repository “${repository.displayName}” will replace the author and committer of ${String(count)} commit${count === 1 ? '' : 's'} with “${operation.name} <${operation.email}>” and rewrite every affected commit on the current branch, amending their hashes.`,
      confirmLabel: 'Rewrite Author Identity',
      destructive: true,
    };
  }
  if (operation.kind === 'amendCommit') {
    return {
      title: 'Amend the current HEAD commit?',
      detail: `Repository "${repository.displayName}" will replace the current HEAD commit and include staged changes.`,
      confirmLabel: 'Amend Commit',
      destructive: true,
    };
  }
  if (operation.kind === 'abortCherryPick') {
    return {
      title: 'Abort cherry-pick?',
      detail: `Repository "${repository.displayName}" will abort the in-progress cherry-pick and restore the working tree.`,
      confirmLabel: 'Abort Cherry-pick',
      destructive: true,
    };
  }
  if (operation.kind === 'abortRevert') {
    return {
      title: 'Abort revert?',
      detail: `Repository "${repository.displayName}" will abort the in-progress revert and restore the working tree.`,
      confirmLabel: 'Abort Revert',
      destructive: true,
    };
  }
  return undefined;
}

interface CommitRangeRewritePlan {
  cwd: string;
  branch: string;
  expectedHead: string;
  newest: string;
  oldest: string;
  baseParent: string;
}

interface AuthorIdentity {
  name: string;
  email: string;
}

interface CommitPatchPlan {
  cwd: string;
  branch: string;
  expectedHead: string;
  messageEdits: Map<string, string>;
  identityEdits: Map<string, AuthorIdentity>;
}

interface BatchDeletionOutcome {
  message: string;
  deletedRefs: string[];
}

function validateIdentity(value: string, label: string): string {
  if (!value.trim() || value.length > 512 || /[<>]|[\0\r\n]/u.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

/** Replaces the name and email of an `author` / `committer` header line, preserving its date. */
function rewriteIdentityLine(line: Buffer, identity: AuthorIdentity): Buffer {
  const opening = line.indexOf(0x3c); // '<'
  const closing = opening < 0 ? -1 : line.indexOf(0x3e, opening); // '>'
  if (opening <= 0 || closing <= opening) return line;
  const keywordLength = headerLineStartsWith(line, 'author ')
    ? 'author '.length
    : headerLineStartsWith(line, 'committer ')
      ? 'committer '.length
      : 0;
  if (keywordLength === 0) return line;
  return Buffer.concat([
    line.subarray(0, keywordLength),
    Buffer.from(identity.name, 'utf8'),
    Buffer.from(' <', 'utf8'),
    Buffer.from(identity.email, 'utf8'),
    Buffer.from('>', 'utf8'),
    line.subarray(closing + 1),
  ]);
}

export class GitOperationService {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly inspect: (
    repository: RepositorySummary,
  ) => Promise<RepositorySummary | undefined>;

  constructor(
    private readonly runner: GitRunner,
    options: GitOperationServiceOptions = {},
  ) {
    this.inspect =
      options.inspectRepository ??
      ((repository) => inspectRepository(fileURLToPath(repository.rootUri), this.runner));
  }

  async resolvePushTarget(
    repository: RepositorySummary,
  ): Promise<{ remote: string; targetRef: string }> {
    const plan = await this.resolvePushPlan(repository);
    return { remote: plan.remote, targetRef: plan.targetRef };
  }

  /** Reads a single-valued Git config key; an unset key resolves to `undefined` rather than throwing. */
  private async readConfig(cwd: string, key: string): Promise<string | undefined> {
    try {
      const result = await this.runner.run(['config', '--get', key], { cwd, timeoutMs: 30_000 });
      return result.stdout.toString('utf8').trim() || undefined;
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1 && !error.cancelled) {
        return undefined;
      }
      throw error;
    }
  }

  /** Reads a multi-valued Git config key; an unset key resolves to an empty list. */
  private async readAllConfig(cwd: string, key: string): Promise<string[]> {
    try {
      const result = await this.runner.run(['config', '--get-all', key], {
        cwd,
        timeoutMs: 30_000,
      });
      return result.stdout.toString('utf8').split(/\r?\n/u).filter(Boolean);
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1 && !error.cancelled) return [];
      throw error;
    }
  }

  private async resolvePushPlan(
    repository: RepositorySummary,
  ): Promise<{ remote: string; targetRef: string; sourceRef: string }> {
    if (repository.isBare) throw new Error(`Bare repository “${repository.displayName}” is read-only.`);
    const cwd = fileURLToPath(repository.rootUri);
    const branch = repository.currentBranch;
    if (!branch) throw new Error('Force push is unavailable while HEAD is detached.');
    const pushRemote = await this.readConfig(cwd, `branch.${branch}.pushRemote`);
    const defaultRemote = await this.readConfig(cwd, 'remote.pushDefault');
    const upstreamRemote = await this.readConfig(cwd, `branch.${branch}.remote`);
    let remote = pushRemote ?? defaultRemote ?? upstreamRemote;
    if (!remote) {
      const remotesResult = await this.runner.run(['remote'], { cwd, timeoutMs: 30_000 });
      const remotes = remotesResult.stdout.toString('utf8').split(/\r?\n/u).filter(Boolean);
      remote = remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : undefined;
    }
    if (!remote) throw new Error('Git could not resolve a unique push remote.');
    if (remote === '.') throw new Error('Force push to the local repository is not supported.');
    if ((await this.readConfig(cwd, `remote.${remote}.mirror`)) === 'true') {
      throw new Error(`Force push is unavailable because remote “${remote}” is configured as a mirror.`);
    }

    const configuredRefspecs = await this.readAllConfig(cwd, `remote.${remote}.push`);
    if (configuredRefspecs.length > 1) {
      throw new Error(`Force push is unavailable because remote “${remote}” has multiple push refspecs.`);
    }
    if (configuredRefspecs[0]) {
      return this.parseConfiguredPushRefspec(remote, configuredRefspecs[0]);
    }

    const pushDefault = (await this.readConfig(cwd, 'push.default')) ?? 'simple';
    const upstreamRef = await this.readConfig(cwd, `branch.${branch}.merge`);
    const autoSetupRemote = (await this.readConfig(cwd, 'push.autoSetupRemote')) === 'true';
    let targetRef: string;
    switch (pushDefault) {
      case 'nothing':
        throw new Error('push.default is set to nothing.');
      case 'matching':
        throw new Error('Force push target is ambiguous when push.default is matching.');
      case 'current':
        targetRef = `refs/heads/${branch}`;
        break;
      case 'upstream':
      case 'tracking':
        if (!upstreamRemote || !upstreamRef) {
          throw new Error(`Branch “${branch}” has no upstream push target.`);
        }
        if (remote !== upstreamRemote) {
          throw new Error(
            `${pushDefault} push is unavailable because push remote “${remote}” differs from upstream remote “${upstreamRemote}”.`,
          );
        }
        targetRef = upstreamRef;
        break;
      case 'simple':
        if (!upstreamRemote || !upstreamRef) {
          if (!autoSetupRemote) throw new Error(`Branch “${branch}” has no upstream push target.`);
          targetRef = `refs/heads/${branch}`;
          break;
        }
        if (remote !== upstreamRemote) {
          targetRef = `refs/heads/${branch}`;
          break;
        }
        if (upstreamRef !== `refs/heads/${branch}`) {
          throw new Error(
            `Simple push is blocked because local branch “${branch}” differs from upstream “${upstreamRef.replace(/^refs\/heads\//u, '')}”.`,
          );
        }
        targetRef = upstreamRef;
        break;
      default:
        throw new Error(`Unsupported push.default mode: ${pushDefault}`);
    }
    return {
      remote: validateToken(remote, 'push remote'),
      targetRef: validateToken(targetRef, 'push target'),
      sourceRef: 'HEAD',
    };
  }

  /**
   * Resolves a one-off `git push --set-upstream <remote> <branch>` for a branch that has no
   * upstream yet. Unlike the force-push plan this never falls back to `origin`: a repository with
   * several remotes and no configured push default has no unambiguous publish target.
   */
  private async resolvePublishPlan(
    repository: RepositorySummary,
  ): Promise<{ remote: string; branch: string }> {
    if (repository.isBare) throw new Error(`Bare repository “${repository.displayName}” is read-only.`);
    const cwd = fileURLToPath(repository.rootUri);
    const currentBranch = repository.currentBranch;
    if (!currentBranch) throw new Error('Publishing is unavailable while HEAD is detached.');
    const branch = validateToken(currentBranch, 'branch name');

    const upstreamRemote = await this.readConfig(cwd, `branch.${branch}.remote`);
    const upstreamRef = await this.readConfig(cwd, `branch.${branch}.merge`);
    if (upstreamRemote && upstreamRef) {
      const upstreamName = upstreamRef.replace(/^refs\/heads\//u, '');
      throw new Error(
        `Branch “${branch}” already tracks “${upstreamRemote}/${upstreamName}”; use Push instead.`,
      );
    }
    if (upstreamRemote || upstreamRef) {
      throw new Error(
        `Branch “${branch}” has an incomplete upstream configuration; run “git branch --unset-upstream ${branch}” first.`,
      );
    }

    // `--verify --quiet` reports a missing ref with exit code 1 instead of an unhelpful Git error.
    try {
      await this.runner.run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
        cwd,
        timeoutMs: 30_000,
        maxStdoutBytes: 4096,
      });
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1 && !error.cancelled) {
        throw new Error(`Branch “${branch}” has no commits yet; create a commit before publishing.`, {
          cause: error,
        });
      }
      throw error;
    }

    const pushRemote = await this.readConfig(cwd, `branch.${branch}.pushRemote`);
    const defaultRemote = await this.readConfig(cwd, 'remote.pushDefault');
    let remote = pushRemote ?? defaultRemote;
    if (!remote) {
      const remotesResult = await this.runner.run(['remote'], { cwd, timeoutMs: 30_000 });
      const remotes = remotesResult.stdout.toString('utf8').split(/\r?\n/u).filter(Boolean);
      if (remotes.length === 1) remote = remotes[0];
    }
    if (!remote) {
      throw new Error(
        'Git could not resolve a unique push remote; configure remote.pushDefault or branch.<name>.pushRemote.',
      );
    }
    // Validate before the remote is interpolated into further config keys: `readConfig` treats
    // exit code 1 as "unset", so a key that git rejects would silently skip the mirror guard below.
    const validatedRemote = validateToken(remote, 'push remote');
    if (validatedRemote === '.') {
      throw new Error('Publishing to the local repository is not supported.');
    }
    if ((await this.readConfig(cwd, `remote.${validatedRemote}.mirror`)) === 'true') {
      throw new Error(
        `Publishing is unavailable because remote “${validatedRemote}” is configured as a mirror.`,
      );
    }
    return { remote: validatedRemote, branch };
  }

  /**
   * `git push --set-upstream` writes the upstream configuration, but it only creates the
   * `refs/remotes/<remote>/<branch>` ref when the remote's fetch refspec covers that branch.
   * Repositories cloned with `--single-branch` (and remotes whose fetch refspec was narrowed)
   * therefore publish successfully while no tracking ref exists: the branch never appears in the
   * remote group, and refreshing cannot help because there is nothing to read. Fetch the branch
   * into the default tracking namespace so a published branch becomes visible.
   */
  private async materializePublishedTrackingRef(
    repository: RepositorySummary,
    remote: string,
    branch: string,
  ): Promise<void> {
    // Both tokens were validated before the push ran; a Git ref name cannot contain the `:` that
    // would otherwise let a branch name forge an extra refspec field.
    const validatedRemote = validateToken(remote, 'push remote');
    const validatedBranch = validateToken(branch, 'branch name');
    const cwd = fileURLToPath(repository.rootUri);
    try {
      const upstream = await this.runner.run(
        ['for-each-ref', '--format=%(upstream)', `refs/heads/${validatedBranch}`],
        { cwd, timeoutMs: 30_000 },
      );
      if (upstream.stdout.toString('utf8').trim()) return;
      await this.runner.run(
        [
          'fetch',
          '--no-tags',
          validatedRemote,
          `+refs/heads/${validatedBranch}:refs/remotes/${validatedRemote}/${validatedBranch}`,
        ],
        { cwd, timeoutMs: 10 * 60_000 },
      );
    } catch (error) {
      // The push already succeeded, so a missing tracking ref must not be reported as a failed
      // operation; the published branch simply stays invisible until the user repairs the refspec.
      if (error instanceof GitCommandError && error.cancelled) return;
      console.warn(
        `[git-log] failed to materialize the tracking ref for ${validatedRemote}/${validatedBranch}: ${
          redactGitDiagnostic(error instanceof Error ? error.message : String(error))
        }`,
      );
    }
  }

  /**
   * Resolves what a full-history fetch needs: which remote to unshallow against, and whether that
   * remote's fetch refspec is narrowed to a single branch. For a `--single-branch` clone the
   * refspec maps one specific source, so `git fetch --unshallow` restores history but other
   * branches stay invisible; only then is a change to the default wildcard refspec planned. The
   * change is never applied here — the caller surfaces it verbatim in the confirmation and applies
   * it after a successful unshallow.
   */
  private async planFullHistory(
    repository: RepositorySummary,
  ): Promise<{ remote: string; refspecFrom?: string; refspecTo?: string }> {
    const cwd = fileURLToPath(repository.rootUri);
    const remotesResult = await this.runner.run(['remote'], { cwd, timeoutMs: 30_000 });
    const remotes = remotesResult.stdout.toString('utf8').split(/\r?\n/u).filter(Boolean);

    let remote = repository.currentBranch
      ? await this.readConfig(
          cwd,
          `branch.${validateToken(repository.currentBranch, 'branch name')}.remote`,
        )
      : undefined;
    if (!remote) remote = await this.readConfig(cwd, 'remote.pushDefault');
    if (!remote && remotes.length === 1) remote = remotes[0];
    if (!remote) {
      throw new Error(
        'Git could not resolve a single remote to fetch the full history from; configure a remote first.',
      );
    }
    const validatedRemote = validateToken(remote, 'remote');
    if (!remotes.includes(validatedRemote)) {
      throw new Error(`Remote “${validatedRemote}” is not configured in this repository.`);
    }

    const configuredRefspecs = await this.readAllConfig(cwd, `remote.${validatedRemote}.fetch`);
    const narrowed = configuredRefspecs.find((spec) => {
      const source = spec.replace(/^\+/u, '').split(':')[0] ?? '';
      return !source.includes('*');
    });
    if (narrowed !== undefined) {
      return {
        remote: validatedRemote,
        refspecFrom: narrowed,
        refspecTo: `+refs/heads/*:refs/remotes/${validatedRemote}/*`,
      };
    }
    return { remote: validatedRemote };
  }

  /**
   * After `--unshallow` succeeded, broaden a narrowed fetch refspec to the default wildcard and
   * re-fetch so other branches appear. The history is already restored, so this is best-effort: a
   * failure is logged, never reported as a failed operation.
   */
  private async applyFetchRefspec(
    repository: RepositorySummary,
    remote: string,
    to: string,
  ): Promise<void> {
    const validatedRemote = validateToken(remote, 'remote');
    const validatedTo = validateToken(to, 'fetch refspec');
    const cwd = fileURLToPath(repository.rootUri);
    try {
      await this.runner.run(
        ['config', '--replace-all', `remote.${validatedRemote}.fetch`, validatedTo],
        { cwd, timeoutMs: 30_000 },
      );
      await this.runner.run(['fetch', '--prune', validatedRemote], {
        cwd,
        timeoutMs: 10 * 60_000,
      });
    } catch (error) {
      if (error instanceof GitCommandError && error.cancelled) return;
      console.warn(
        `[git-log] unshallow succeeded but extending the fetch refspec for ${validatedRemote} failed: ${
          redactGitDiagnostic(error instanceof Error ? error.message : String(error))
        }`,
      );
    }
  }

  run(
    repository: RepositorySummary,
    operation: GitOperationRequest,
    options: GitOperationRunOptions = {},
  ): Promise<GitOperationResult> {
    if (repository.isBare) {
      return Promise.reject(new Error(`Bare repository “${repository.displayName}” is read-only.`));
    }
    const queueKey = this.getQueueKey(repository);
    const previous = this.queues.get(queueKey) ?? Promise.resolve();
    const execution = previous
      .catch(() => undefined)
      .then(async () => {
        const freshRepository = await this.inspect(repository);
        if (!freshRepository) throw new Error(`Repository “${repository.displayName}” is unavailable.`);
        const isRebaseControl = isRebaseControlOperation(operation);
        if (
          freshRepository.operationState &&
          operation.kind !== 'fetch' &&
          operation.kind !== 'abortCherryPick' &&
          operation.kind !== 'abortRevert' &&
          !(freshRepository.operationState === 'rebase' && isRebaseControl)
        ) {
          throw new Error(
            `A Git ${freshRepository.operationState} is in progress; finish or abort it first.`,
          );
        }
        if (!freshRepository.operationState && isRebaseControl) {
          throw new Error('No Git rebase is in progress.');
        }
        if (operation.kind === 'rebaseContinue' && freshRepository.hasUnresolvedConflicts) {
          throw new Error('Resolve all conflicts before continuing the rebase.');
        }
        if (operation.kind === 'deleteRemoteBranch') {
          await this.validateRemoteBranchDeletion(freshRepository, operation.remote, operation.branch);
        }
        let rewritePlan: CommitRangeRewritePlan | undefined;
        if (operation.kind === 'dropCommits' || operation.kind === 'squashCommits') {
          rewritePlan = await this.planCommitRangeRewrite(freshRepository, operation.hashes);
        }
        let commitPatchPlan: CommitPatchPlan | undefined;
        if (
          operation.kind === 'editCommitMessages' ||
          operation.kind === 'rewriteAuthorIdentity'
        ) {
          commitPatchPlan = await this.planCommitPatch(freshRepository, operation);
        }
        let preparedOperation = operation;
        let forceSourceHash: string | undefined;
        let batchDeletion: BatchDeletionOutcome | undefined;
        if (operation.kind === 'push' && operation.forceWithLease) {
          const plan = await this.resolvePushPlan(freshRepository);
          preparedOperation = {
            ...operation,
            remote: plan.remote,
            targetRef: plan.targetRef,
          };
          // validateToken rejects option-like sources; rev-parse gained --end-of-options in Git 2.30.
          const source = await this.runner.run(
            ['rev-parse', '--verify', `${plan.sourceRef}^{commit}`],
            { cwd: fileURLToPath(freshRepository.rootUri), timeoutMs: 30_000 },
          );
          forceSourceHash = source.stdout.toString('utf8').trim();
        }
        if (operation.kind === 'publishBranch') {
          const plan = await this.resolvePublishPlan(freshRepository);
          preparedOperation = {
            ...operation,
            remote: plan.remote,
            branch: plan.branch,
          };
        }
        if (operation.kind === 'fetchFullHistory') {
          const plan = await this.planFullHistory(freshRepository);
          preparedOperation =
            operation.depth === undefined
              ? { ...operation, ...plan }
              : // A depth increment only deepens history. Broadening the fetch refspec would change
                // which branches are visible, which is a separate concern the user did not ask for.
                { ...operation, remote: plan.remote };
        }
        const confirmation = getOperationConfirmation(freshRepository, preparedOperation);
        if (confirmation) {
          if (!options.confirm) {
            throw new Error('This destructive Git operation requires confirmation.');
          }
          if (!(await options.confirm(confirmation))) return { message: '', cancelled: true };
        }
        if (rewritePlan) {
          if (operation.kind !== 'dropCommits' && operation.kind !== 'squashCommits') {
            throw new Error('Invalid commit history rewrite operation.');
          }
          await this.assertRewritePlanStillCurrent(rewritePlan);
          const revalidatedPlan = await this.planCommitRangeRewrite(
            freshRepository,
            operation.hashes,
          );
          if (
            revalidatedPlan.branch !== rewritePlan.branch ||
            revalidatedPlan.expectedHead !== rewritePlan.expectedHead ||
            revalidatedPlan.baseParent !== rewritePlan.baseParent
          ) {
            throw new Error(
              'The current branch or HEAD changed during confirmation; select the commits again.',
            );
          }
          rewritePlan = revalidatedPlan;
        }
        if (commitPatchPlan) {
          await this.assertCommitPatchStillCurrent(commitPatchPlan);
          const revalidatedCommitPatchPlan = await this.planCommitPatch(freshRepository, operation);
          if (
            revalidatedCommitPatchPlan.branch !== commitPatchPlan.branch ||
            revalidatedCommitPatchPlan.expectedHead !== commitPatchPlan.expectedHead
          ) {
            throw new Error(
              'The current branch or HEAD changed during confirmation; select the commits again.',
            );
          }
          commitPatchPlan = revalidatedCommitPatchPlan;
        }
        if (rewritePlan && preparedOperation.kind === 'dropCommits') {
          await this.rebaseCommitRange(rewritePlan, rewritePlan.baseParent);
        } else if (rewritePlan && preparedOperation.kind === 'squashCommits') {
          const squashedHash = await this.createSquashedCommit(
            rewritePlan,
            preparedOperation.message,
          );
          await this.rebaseCommitRange(rewritePlan, squashedHash);
        } else if (commitPatchPlan) {
          await this.applyCommitPatch(commitPatchPlan);
        } else if (preparedOperation.kind === 'deleteBranches') {
          batchDeletion = await this.deleteBranches(
            preparedOperation.branches,
            fileURLToPath(freshRepository.rootUri),
          );
        } else if (preparedOperation.kind === 'deleteRefs') {
          batchDeletion = await this.deleteRefs(
            {
              local: preparedOperation.local,
              remote: preparedOperation.remote,
              tags: preparedOperation.tags,
            },
            fileURLToPath(freshRepository.rootUri),
          );
        } else {
          await this.runner.run(buildOperationArguments(preparedOperation, forceSourceHash), {
            cwd: fileURLToPath(freshRepository.rootUri),
            timeoutMs: 10 * 60_000,
            ...(preparedOperation.kind === 'rebaseContinue'
              ? { env: { GIT_EDITOR: 'true' } }
              : {}),
          });
          if (
            preparedOperation.kind === 'publishBranch' &&
            preparedOperation.remote &&
            preparedOperation.branch
          ) {
            await this.materializePublishedTrackingRef(
              freshRepository,
              preparedOperation.remote,
              preparedOperation.branch,
            );
          }
          if (
            preparedOperation.kind === 'fetchFullHistory' &&
            preparedOperation.remote &&
            preparedOperation.refspecTo
          ) {
            await this.applyFetchRefspec(
              freshRepository,
              preparedOperation.remote,
              preparedOperation.refspecTo,
            );
          }
        }
        if (batchDeletion) {
          return {
            message: batchDeletion.message,
            ...(batchDeletion.deletedRefs.length > 0
              ? { deletedRefs: batchDeletion.deletedRefs }
              : {}),
          };
        }
        if (preparedOperation.kind === 'fetchFullHistory') {
          return {
            message:
              preparedOperation.depth === undefined
                ? 'Fetched the full history.'
                : `Fetched ${String(preparedOperation.depth)} more commits.`,
          };
        }
        return { message: `${operation.kind} completed.` };
      });
    const tail = execution.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(queueKey, tail);
    void tail.finally(() => {
      if (this.queues.get(queueKey) === tail) this.queues.delete(queueKey);
    });
    return execution;
  }

  private getQueueKey(repository: RepositorySummary): string {
    const path = normalize(fileURLToPath(repository.commonGitDirUri ?? repository.gitDirUri));
    return process.platform === 'win32' ? path.toLowerCase() : path;
  }

  private async planCommitRangeRewrite(
    repository: RepositorySummary,
    requestedHashes: readonly string[],
  ): Promise<CommitRangeRewritePlan> {
    const cwd = fileURLToPath(repository.rootUri);
    const branchResult = await this.runner.run(['branch', '--show-current'], {
      cwd,
      timeoutMs: 30_000,
    });
    const branch = branchResult.stdout.toString('utf8').trim();
    if (!branch) throw new Error('Commit history rewriting is unavailable while HEAD is detached.');
    const hashes = requestedHashes.map(validateHash);
    if (hashes.length < 2 || hashes.length > 100 || new Set(hashes).size !== hashes.length) {
      throw new Error('Select between 2 and 100 unique commits.');
    }
    const newest = hashes[0];
    const oldest = hashes.at(-1);
    if (!newest || !oldest) throw new Error('Select between 2 and 100 unique commits.');
    const status = await this.runner.run(['status', '--porcelain=v1', '-z'], {
      cwd,
      timeoutMs: 30_000,
    });
    if (status.stdout.length > 0) {
      throw new Error('Drop and squash require a clean worktree. Commit or stash changes first.');
    }
    const historyResult = await this.runner.run(['rev-list', '--first-parent', '--parents', 'HEAD'], {
      cwd,
      timeoutMs: 30_000,
    });
    const historyLines = historyResult.stdout
      .toString('utf8')
      .trim()
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => line.split(/\s+/u));
    const history = historyLines.map(([hash]) => hash).filter((hash): hash is string => Boolean(hash));
    const expectedHead = history[0];
    if (!expectedHead) throw new Error('The current branch has no commits to rewrite.');
    const newestIndex = history.indexOf(newest);
    if (
      newestIndex < 0 ||
      hashes.some((hash, index) => history[newestIndex + index] !== hash)
    ) {
      throw new Error('Selected commits must be contiguous on the current branch first-parent history.');
    }
    const oldestIndex = newestIndex + hashes.length - 1;
    if (oldestIndex >= history.length - 1) {
      throw new Error('The root commit cannot be dropped or squashed.');
    }
    const baseParent = history[oldestIndex + 1];
    if (!baseParent) throw new Error('The root commit cannot be dropped or squashed.');
    if (historyLines.slice(0, oldestIndex + 1).some((line) => line.length !== 2)) {
      throw new Error('Commit history rewriting is unavailable across merge commits.');
    }
    return {
      cwd,
      branch: validateToken(branch, 'branch name'),
      expectedHead,
      newest,
      oldest,
      baseParent,
    };
  }

  private async assertRewritePlanStillCurrent(plan: CommitRangeRewritePlan): Promise<void> {
    const [branchResult, headResult, statusResult] = await Promise.all([
      this.runner.run(['branch', '--show-current'], { cwd: plan.cwd, timeoutMs: 30_000 }),
      this.runner.run(['rev-parse', '--verify', 'HEAD'], { cwd: plan.cwd, timeoutMs: 30_000 }),
      this.runner.run(['status', '--porcelain=v1', '-z'], {
        cwd: plan.cwd,
        timeoutMs: 30_000,
      }),
    ]);
    const branch = branchResult.stdout.toString('utf8').trim();
    const head = headResult.stdout.toString('utf8').trim();
    if (branch !== plan.branch || head !== plan.expectedHead) {
      throw new Error('The current branch or HEAD changed during confirmation; select the commits again.');
    }
    if (statusResult.stdout.length > 0) {
      throw new Error('The worktree changed during confirmation; commit or stash changes first.');
    }
  }

  private async createSquashedCommit(
    plan: CommitRangeRewritePlan,
    message: string,
  ): Promise<string> {
    if (!message.trim() || message.length > 100_000 || message.includes('\0')) {
      throw new Error('The squash commit message is invalid.');
    }
    const treeResult = await this.runner.run(['rev-parse', `${plan.newest}^{tree}`], {
      cwd: plan.cwd,
      timeoutMs: 30_000,
    });
    const authorResult = await this.runner.run(
      ['show', '-s', '--format=%an%x00%ae%x00%aI', plan.oldest, '--'],
      { cwd: plan.cwd, timeoutMs: 30_000 },
    );
    const [authorName, authorEmail, authorDate] = authorResult.stdout
      .toString('utf8')
      .replace(/\r?\n$/u, '')
      .split('\0');
    const commitResult = await this.runner.run(
      ['commit-tree', treeResult.stdout.toString('utf8').trim(), '-p', plan.baseParent],
      {
        cwd: plan.cwd,
        timeoutMs: 30_000,
        input: message.endsWith('\n') ? message : `${message}\n`,
        env: {
          GIT_AUTHOR_NAME: authorName,
          GIT_AUTHOR_EMAIL: authorEmail,
          GIT_AUTHOR_DATE: authorDate,
        },
      },
    );
    return validateHash(commitResult.stdout.toString('utf8').trim());
  }

  private async rebaseCommitRange(
    plan: CommitRangeRewritePlan,
    newBase: string,
  ): Promise<void> {
    await this.assertRewritePlanStillCurrent(plan);
    await this.runner.run(
      [
        '-c',
        'rebase.updateRefs=false',
        '-c',
        'rebase.autoStash=false',
        'rebase',
        '--onto',
        validateHash(newBase),
        plan.newest,
      ],
      { cwd: plan.cwd, timeoutMs: 10 * 60_000 },
    );
  }

  private async planCommitPatch(
    repository: RepositorySummary,
    operation: GitOperationRequest,
  ): Promise<CommitPatchPlan> {
    const cwd = fileURLToPath(repository.rootUri);
    const branchResult = await this.runner.run(['branch', '--show-current'], {
      cwd,
      timeoutMs: 30_000,
    });
    const branch = branchResult.stdout.toString('utf8').trim();
    if (!branch) throw new Error('Commit history rewriting is unavailable while HEAD is detached.');
    if (operation.kind !== 'editCommitMessages' && operation.kind !== 'rewriteAuthorIdentity') {
      throw new Error('Invalid commit history rewrite operation.');
    }
    const headResult = await this.runner.run(['rev-parse', '--verify', 'HEAD'], {
      cwd,
      timeoutMs: 30_000,
    });
    const expectedHead = validateHash(headResult.stdout.toString('utf8').trim());
    const logResult = await this.runner.run(['log', '-100', '--format=%H', expectedHead], {
      cwd,
      timeoutMs: 30_000,
    });
    const reachable = new Set(logResult.stdout.toString('utf8').split(/\r?\n/u).filter(Boolean));
    const messageEdits = new Map<string, string>();
    const identityEdits = new Map<string, AuthorIdentity>();
    if (operation.kind === 'editCommitMessages') {
      if (operation.edits.length < 1 || operation.edits.length > 100) {
        throw new Error('Select between 1 and 100 commits.');
      }
      for (const edit of operation.edits) {
        const hash = validateHash(edit.hash);
        if (messageEdits.has(hash)) throw new Error('Duplicate commit hashes are not allowed.');
        if (!reachable.has(hash)) {
          throw new Error('Edits must refer to commits reachable from the current branch tip.');
        }
        messageEdits.set(hash, validateCommitMessage(edit.message, 'commit message'));
      }
    } else {
      if (operation.hashes.length < 1 || operation.hashes.length > 100) {
        throw new Error('Select between 1 and 100 commits.');
      }
      const identity = {
        name: validateIdentity(operation.name, 'author name'),
        email: validateIdentity(operation.email, 'author email'),
      };
      for (const hash of operation.hashes) {
        const validatedHash = validateHash(hash);
        if (identityEdits.has(validatedHash)) {
          throw new Error('Duplicate commit hashes are not allowed.');
        }
        if (!reachable.has(validatedHash)) {
          throw new Error('Edits must refer to commits reachable from the current branch tip.');
        }
        identityEdits.set(validatedHash, identity);
      }
    }
    return {
      cwd,
      branch: validateToken(branch, 'branch name'),
      expectedHead,
      messageEdits,
      identityEdits,
    };
  }

  private async patchCommitObjects(
    plan: CommitPatchPlan,
  ): Promise<{ affected: string[]; mapping: Map<string, string> }> {
    const revResult = await this.runner.run(
      ['rev-list', '--topo-order', '--reverse', '--parents', plan.expectedHead],
      { cwd: plan.cwd, timeoutMs: 30_000 },
    );
    const rows = revResult.stdout
      .toString('utf8')
      .trim()
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => line.split(/\s+/u));
    const affected = new Set<string>();
    const work: string[] = [];
    for (const [oid, ...parents] of rows) {
      if (!oid) continue;
      if (
        plan.messageEdits.has(oid) ||
        plan.identityEdits.has(oid) ||
        parents.some((parent) => affected.has(parent))
      ) {
        affected.add(oid);
        work.push(oid);
      }
    }
    const mapping = new Map<string, string>();
    for (const oid of work) {
      const rawResult = await this.runner.run(['cat-file', 'commit', oid], {
        cwd: plan.cwd,
        timeoutMs: 30_000,
        maxStdoutBytes: 100 * 1024,
      });
      const raw = rawResult.stdout;
      const separator = raw.indexOf(Buffer.from('\n\n', 'utf8'));
      const header = separator < 0 ? raw : raw.subarray(0, separator);
      const originalMessage = separator < 0 ? Buffer.alloc(0) : raw.subarray(separator + 2);
      const newMessage = plan.messageEdits.get(oid);
      const identity = plan.identityEdits.get(oid);
      const output: Buffer[] = [];
      let skip = false;
      for (const line of splitBufferLines(header)) {
        const isContinuation = line.length > 0 && line[0] === 0x20;
        if (isContinuation) {
          if (!skip) output.push(Buffer.concat([line, Buffer.from('\n', 'utf8')]));
          continue;
        }
        skip =
          headerLineStartsWith(line, 'gpgsig ') ||
          headerLineStartsWith(line, 'gpgsig-sha256 ') ||
          headerLineStartsWith(line, 'mergetag ');
        if (skip) continue;
        if (headerLineStartsWith(line, 'parent ')) {
          const parent = line.subarray('parent '.length).toString('latin1');
          const mapped = mapping.get(parent);
          output.push(
            Buffer.concat([
              Buffer.from('parent ', 'utf8'),
              Buffer.from(mapped ?? parent, 'utf8'),
              Buffer.from('\n', 'utf8'),
            ]),
          );
        } else if (
          identity &&
          (headerLineStartsWith(line, 'author ') || headerLineStartsWith(line, 'committer '))
        ) {
          output.push(Buffer.concat([rewriteIdentityLine(line, identity), Buffer.from('\n', 'utf8')]));
        } else {
          output.push(Buffer.concat([line, Buffer.from('\n', 'utf8')]));
        }
      }
      const body = Buffer.concat([
        Buffer.concat(output),
        Buffer.from('\n', 'utf8'),
        newMessage === undefined ? originalMessage : Buffer.from(newMessage, 'utf8'),
      ]);
      const hashed = await this.runner.run(
        ['hash-object', '-t', 'commit', '-w', '--stdin'],
        { cwd: plan.cwd, timeoutMs: 30_000, input: body, maxStdoutBytes: 4096 },
      );
      mapping.set(oid, validateHash(hashed.stdout.toString('utf8').trim()));
    }
    return { affected: work, mapping };
  }

  private async assertCommitPatchStillCurrent(plan: CommitPatchPlan): Promise<void> {
    const [branchResult, headResult, shallowResult, conflictsResult] = await Promise.all([
      this.runner.run(['branch', '--show-current'], { cwd: plan.cwd, timeoutMs: 30_000 }),
      this.runner.run(['rev-parse', '--verify', 'HEAD'], { cwd: plan.cwd, timeoutMs: 30_000 }),
      this.runner.run(['rev-parse', '--is-shallow-repository'], {
        cwd: plan.cwd,
        timeoutMs: 30_000,
        maxStdoutBytes: 4096,
      }),
      this.runner.run(['ls-files', '--unmerged'], { cwd: plan.cwd, timeoutMs: 30_000 }),
    ]);
    const branch = branchResult.stdout.toString('utf8').trim();
    const head = headResult.stdout.toString('utf8').trim();
    if (branch !== plan.branch || head !== plan.expectedHead) {
      throw new Error('The current branch or HEAD changed during confirmation; select the commits again.');
    }
    if (shallowResult.stdout.toString('utf8').trim() === 'true') {
      throw new Error('A complete clone is required; this repository is shallow.');
    }
    if (conflictsResult.stdout.length > 0) {
      throw new Error('Resolve index conflicts before rewriting.');
    }
    for (const marker of [
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'rebase-merge',
      'rebase-apply',
      'BISECT_LOG',
      'sequencer',
    ]) {
      const pathResult = await this.runner.run(['rev-parse', '--git-path', marker], {
        cwd: plan.cwd,
        timeoutMs: 30_000,
        maxStdoutBytes: 4096,
      });
      const markerPath = pathResult.stdout.toString('utf8').trim();
      if (markerPath.includes('..')) throw new Error(`Unusable Git marker path: ${marker}`);
      if (await this.pathExists(normalize(join(plan.cwd, markerPath)))) {
        throw new Error('Finish the active Git operation before rewriting.');
      }
    }
    const worktreesResult = await this.runner.run(['worktree', 'list', '--porcelain'], {
      cwd: plan.cwd,
      timeoutMs: 30_000,
    });
    const currentToplevel = (await this.runner.run(['rev-parse', '--show-toplevel'], {
      cwd: plan.cwd,
      timeoutMs: 30_000,
      maxStdoutBytes: 4096,
    })).stdout.toString('utf8').trim();
    const ref = `refs/heads/${plan.branch}`;
    for (const record of worktreesResult.stdout.toString('utf8').split(/\r?\n\n/u)) {
      const lines = record.split(/\r?\n/u);
      const worktreeLine = lines.find((line) => line.startsWith('worktree '));
      if (lines.includes(`branch ${ref}`) && worktreeLine) {
        const worktreePath = normalize(worktreeLine.slice('worktree '.length));
        if (worktreePath !== normalize(currentToplevel)) {
          throw new Error(
            'The current branch is checked out in another worktree; run this operation there.',
          );
        }
      }
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private timestampedBranchName(prefix: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
    return `${prefix}/${stamp}-${randomBytes(3).toString('hex')}`;
  }

  private async applyCommitPatch(plan: CommitPatchPlan): Promise<void> {
    await this.assertCommitPatchStillCurrent(plan);
    const backup = this.timestampedBranchName(
      plan.identityEdits.size > 0 ? 'identity-rewrite-backup' : 'commit-rewrite-backup',
    );
    await this.runner.run(
      ['update-ref', `refs/heads/${backup}`, plan.expectedHead, '0'.repeat(plan.expectedHead.length)],
      { cwd: plan.cwd, timeoutMs: 30_000 },
    );
    const { affected, mapping } = await this.patchCommitObjects(plan);
    if (!affected.includes(plan.expectedHead)) {
      throw new Error('The current branch tip is not among the affected commits.');
    }
    const newTip = mapping.get(plan.expectedHead);
    if (!newTip) throw new Error('The current branch tip could not be rewritten.');
    await this.assertCommitPatchStillCurrent(plan);
    const label = plan.identityEdits.size > 0 ? 'rewrite author identity' : 'rewrite commit messages';
    await this.runner.run(
      ['update-ref', '-m', `Git Log: ${label} (backup ${backup})`, `refs/heads/${plan.branch}`, newTip, plan.expectedHead],
      { cwd: plan.cwd, timeoutMs: 30_000 },
    );
  }

  /**
   * Deletes branches one at a time so a single failure (a branch that is not fully merged, or
   * one that disappeared between the dialog and the confirmation) cannot abort the rest of the
   * batch. Successful and failed branches are both reported back to the caller.
   */
  private async deleteBranches(
    branches: ReadonlyArray<{ name: string; force: boolean }>,
    cwd: string,
  ): Promise<BatchDeletionOutcome> {
    const deletedRefs: string[] = [];
    const failures: string[] = [];
    for (const branch of branches) {
      try {
        await this.runner.run(
          buildOperationArguments({
            kind: 'deleteBranch',
            name: branch.name,
            force: branch.force,
          }),
          { cwd, timeoutMs: 30_000 },
        );
        deletedRefs.push(`refs/heads/${branch.name}`);
      } catch (error) {
        const reason =
          error instanceof GitCommandError ? classifyGitError(error).message : undefined;
        failures.push(`${branch.name} (${reason ?? 'unknown error'})`);
      }
    }

    const deleted = deletedRefs.length;
    const noun = deleted === 1 ? 'branch' : 'branches';
    if (failures.length === 0) {
      return { message: `Deleted ${String(deleted)} ${noun}.`, deletedRefs };
    }
    return {
      message: `Deleted ${String(deleted)} of ${String(branches.length)} branches; failed: ${failures.join('; ')}.`,
      deletedRefs,
    };
  }

  private async deleteRefs(
    refs: {
      local: ReadonlyArray<{ name: string; force: boolean }>;
      remote: ReadonlyArray<{ remote: string; branch: string }>;
      tags: readonly string[];
    },
    cwd: string,
  ): Promise<BatchDeletionOutcome> {
    const deletedRefs: string[] = [];
    const failures: string[] = [];
    const total = refs.local.length + refs.remote.length + refs.tags.length;

    for (const branch of refs.local) {
      try {
        await this.runner.run(
          buildOperationArguments({
            kind: 'deleteBranch',
            name: branch.name,
            force: branch.force,
          }),
          { cwd, timeoutMs: 30_000 },
        );
        deletedRefs.push(`refs/heads/${branch.name}`);
      } catch (error) {
        const reason =
          error instanceof GitCommandError ? classifyGitError(error).message : undefined;
        failures.push(`${branch.name} (${reason ?? 'unknown error'})`);
      }
    }
    for (const entry of refs.remote) {
      try {
        await this.runner.run(
          buildOperationArguments({
            kind: 'deleteRemoteBranch',
            remote: entry.remote,
            branch: entry.branch,
          }),
          // Terminal-prompt suppression is centralized in GitRunner, so an auth prompt fails
          // fast and is reported per-item instead of hanging the whole batch.
          { cwd, timeoutMs: 10 * 60_000 },
        );
        deletedRefs.push(`refs/remotes/${entry.remote}/${entry.branch}`);
      } catch (error) {
        const reason =
          error instanceof GitCommandError ? classifyGitError(error).message : undefined;
        failures.push(`${entry.remote}/${entry.branch} (${reason ?? 'unknown error'})`);
      }
    }
    for (const tag of refs.tags) {
      try {
        await this.runner.run(buildOperationArguments({ kind: 'deleteTag', name: tag }), {
          cwd,
          timeoutMs: 30_000,
        });
        deletedRefs.push(`refs/tags/${tag}`);
      } catch (error) {
        const reason =
          error instanceof GitCommandError ? classifyGitError(error).message : undefined;
        failures.push(`${tag} (${reason ?? 'unknown error'})`);
      }
    }

    if (failures.length === 0) {
      return { message: `Deleted ${String(deletedRefs.length)} of ${String(total)} references.`, deletedRefs };
    }
    return {
      message: `Deleted ${String(deletedRefs.length)} of ${String(total)} references; failed: ${failures.join('; ')}.`,
      deletedRefs,
    };
  }

  private async validateRemoteBranchDeletion(
    repository: RepositorySummary,
    remote: string,
    branch: string,
  ): Promise<void> {
    const cwd = fileURLToPath(repository.rootUri);
    const validatedRemote = validateToken(remote, 'remote');
    const validatedBranch = validateToken(branch, 'remote branch');
    const remotesResult = await this.runner.run(['remote'], { cwd, timeoutMs: 30_000 });
    const remotes = remotesResult.stdout.toString('utf8').split(/\r?\n/u).filter(Boolean);
    if (!remotes.includes(validatedRemote)) {
      throw new Error(`Remote “${validatedRemote}” is not a configured remote.`);
    }
    await this.runner.run(['check-ref-format', '--branch', validatedBranch], {
      cwd,
      timeoutMs: 30_000,
      maxStdoutBytes: 4096,
    });
    try {
      await this.runner.run(
        ['show-ref', '--verify', '--quiet', `refs/remotes/${validatedRemote}/${validatedBranch}`],
        { cwd, timeoutMs: 30_000, maxStdoutBytes: 4096 },
      );
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1 && !error.cancelled) {
        throw new Error(
          `Remote branch “${validatedRemote}/${validatedBranch}” is not tracked locally.`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  private parseConfiguredPushRefspec(
    remote: string,
    configuredRefspec: string,
  ): { remote: string; targetRef: string; sourceRef: string } {
    const refspec = configuredRefspec.startsWith('+')
      ? configuredRefspec.slice(1)
      : configuredRefspec;
    if (!refspec || refspec.startsWith('^') || refspec.includes('*')) {
      throw new Error(`Force push does not support push refspec “${configuredRefspec}”.`);
    }
    const separator = refspec.indexOf(':');
    if (separator <= 0 || separator !== refspec.lastIndexOf(':')) {
      throw new Error(
        `Force push requires a fully qualified destination in push refspec “${configuredRefspec}”.`,
      );
    }
    const source = separator >= 0 ? refspec.slice(0, separator) : refspec;
    const destination = separator >= 0 ? refspec.slice(separator + 1) : refspec;
    if (!source || !destination || destination.includes(':')) {
      throw new Error(`Force push does not support push refspec “${configuredRefspec}”.`);
    }
    if (!destination.startsWith('refs/')) {
      throw new Error(
        `Force push requires a fully qualified destination in push refspec “${configuredRefspec}”.`,
      );
    }
    const targetRef = destination;
    if (!targetRef.startsWith('refs/heads/')) {
      throw new Error(`Force push only supports branch destinations, not “${targetRef}”.`);
    }
    return {
      remote: validateToken(remote, 'push remote'),
      targetRef: validateToken(targetRef, 'push target'),
      sourceRef: validateToken(source, 'push source'),
    };
  }
}
