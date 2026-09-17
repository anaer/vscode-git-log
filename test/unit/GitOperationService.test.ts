import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner as RealGitRunner } from '../../src/git/GitRunner';
import type { GitRunOptions, GitRunResult, GitRunner } from '../../src/git/GitRunner';
import type { GitOperationRequest } from '../../src/protocol/messages';
import type { RepositorySummary } from '../../src/shared/models';
import { getOperationConfirmation } from '../../src/git/GitOperationService';

const repository: RepositorySummary = {
  id: 'repo-1',
  rootUri: 'file:///C:/workspace/project',
  gitDirUri: 'file:///C:/workspace/project/.git',
  displayName: 'project',
  isBare: false,
};

const passthroughInspection = {
  inspectRepository: (candidate: RepositorySummary) => Promise.resolve(candidate),
};

const successfulResult: GitRunResult = {
  stdout: Buffer.alloc(0),
  stderr: Buffer.alloc(0),
  exitCode: 0,
  durationMs: 1,
};

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
// Mirror how GitOperationService derives the working directory from a repository's rootUri
// so assertions stay correct on both Windows (backslashes) and POSIX (forward slashes).
const projectPath = fileURLToPath('file:///C:/workspace/project');
const otherPath = fileURLToPath('file:///C:/workspace/other');
const featurePath = fileURLToPath('file:///C:/workspace/project-feature');

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Operation Test',
      GIT_AUTHOR_EMAIL: 'operation@example.com',
      GIT_COMMITTER_NAME: 'Operation Test',
      GIT_COMMITTER_EMAIL: 'operation@example.com',
    },
  });
  return result.stdout.trim();
}

async function createFixtureRepository(prefix = 'git-operation-'): Promise<{ path: string; summary: RepositorySummary }> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(path);
  await git(path, 'init', '-b', 'main');
  await git(path, 'config', 'user.name', 'Operation Test');
  await git(path, 'config', 'user.email', 'operation@example.com');
  await writeFile(join(path, 'base.txt'), 'base\n');
  await git(path, 'add', 'base.txt');
  await git(path, 'commit', '-m', 'base');
  return {
    path,
    summary: {
      id: path,
      rootUri: pathToFileURL(path).toString(),
      gitDirUri: pathToFileURL(join(path, '.git')).toString(),
      displayName: 'fixture',
      isBare: false,
    },
  };
}

async function createBareRemote(prefix = 'git-operation-remote-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(path);
  await git(path, 'init', '--bare');
  return path;
}

async function commitFile(cwd: string, name: string, content: string, message: string): Promise<string> {
  await writeFile(join(cwd, name), content);
  await git(cwd, 'add', name);
  await git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

async function commitFileAs(
  cwd: string,
  name: string,
  content: string,
  message: string,
  authorName: string,
  authorEmail: string,
  authorDate?: string,
): Promise<string> {
  await writeFile(join(cwd, name), content);
  await execFileAsync('git', ['add', name], { cwd });
  await execFileAsync('git', ['commit', '-m', message], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: authorName,
      GIT_AUTHOR_EMAIL: authorEmail,
      ...(authorDate ? { GIT_AUTHOR_DATE: authorDate } : {}),
      GIT_COMMITTER_NAME: authorName,
      GIT_COMMITTER_EMAIL: authorEmail,
    },
  });
  return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd })).stdout.trim();
}

describe('GitOperationService', () => {
  it('maps stash and Amend HEAD requests to safe Git arguments', async () => {
    const { buildOperationArguments } = await import('../../src/git/GitOperationService');

    expect(
      buildOperationArguments({
        kind: 'createStash',
        message: 'work in progress',
        includeUntracked: true,
      }),
    ).toEqual(['stash', 'push', '--include-untracked', '-m', 'work in progress']);
    expect(buildOperationArguments({ kind: 'applyStash', stash: 'stash@{2}' })).toEqual([
      'stash',
      'apply',
      'stash@{2}',
    ]);
    expect(buildOperationArguments({ kind: 'popStash', stash: 'stash@{0}' })).toEqual([
      'stash',
      'pop',
      'stash@{0}',
    ]);
    expect(buildOperationArguments({ kind: 'dropStash', stash: 'stash@{1}' })).toEqual([
      'stash',
      'drop',
      'stash@{1}',
    ]);
    expect(buildOperationArguments({ kind: 'amendCommit', message: 'amended' })).toEqual([
      'commit',
      '--amend',
      '-m',
      'amended',
    ]);
  });

  it('creates and restores a named stash in a real repository', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-stash-');
    await writeFile(join(fixture.path, 'base.txt'), 'changed\n');
    await writeFile(join(fixture.path, 'untracked.txt'), 'untracked\n');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(fixture.summary, {
      kind: 'createStash',
      message: 'IDE work',
      includeUntracked: true,
    });
    expect(await git(fixture.path, 'status', '--porcelain')).toBe('');

    await service.run(fixture.summary, { kind: 'popStash', stash: 'stash@{0}' });
    expect(await git(fixture.path, 'status', '--porcelain')).toContain('base.txt');
    expect(await git(fixture.path, 'status', '--porcelain')).toContain('untracked.txt');
  });

  it('amends HEAD with the supplied commit message', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-amend-');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      { kind: 'amendCommit', message: 'base amended' },
      { confirm: () => Promise.resolve(true) },
    );

    expect(await git(fixture.path, 'log', '-1', '--format=%s')).toBe('base amended');
  });

  it('drops a contiguous commit range and rebases newer descendants', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-drop-range-');
    const base = await git(fixture.path, 'rev-parse', 'HEAD');
    const oldest = await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest selected');
    const newest = await commitFile(fixture.path, 'newest.txt', 'newest\n', 'newest selected');
    await commitFile(fixture.path, 'descendant.txt', 'descendant\n', 'keep descendant');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      { kind: 'dropCommits', hashes: [newest, oldest] },
      { confirm: () => Promise.resolve(true) },
    );

    expect((await git(fixture.path, 'log', '--format=%s')).split('\n')).toEqual([
      'keep descendant',
      'base',
    ]);
    expect(await git(fixture.path, 'rev-parse', 'HEAD^')).toBe(base);
    await expect(stat(join(fixture.path, 'oldest.txt'))).rejects.toThrow();
    await expect(stat(join(fixture.path, 'newest.txt'))).rejects.toThrow();
    await expect(stat(join(fixture.path, 'descendant.txt'))).resolves.toBeDefined();
  });

  it('rewrites a selected range that includes the current HEAD', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-head-range-');
    const base = await git(fixture.path, 'rev-parse', 'HEAD');
    const oldest = await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest selected');
    const newest = await commitFile(fixture.path, 'newest.txt', 'newest\n', 'newest selected');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      { kind: 'dropCommits', hashes: [newest, oldest] },
      { confirm: () => Promise.resolve(true) },
    );

    expect(await git(fixture.path, 'rev-parse', 'HEAD')).toBe(base);
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('main');
  });

  it('does not update other branches when rebase.updateRefs is enabled', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-no-update-refs-');
    const oldest = await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest selected');
    const newest = await commitFile(fixture.path, 'newest.txt', 'newest\n', 'newest selected');
    const descendant = await commitFile(
      fixture.path,
      'descendant.txt',
      'descendant\n',
      'keep descendant',
    );
    await git(fixture.path, 'branch', 'unrelated', descendant);
    await git(fixture.path, 'config', 'rebase.updateRefs', 'true');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      { kind: 'dropCommits', hashes: [newest, oldest] },
      { confirm: () => Promise.resolve(true) },
    );

    expect(await git(fixture.path, 'rev-parse', 'unrelated')).toBe(descendant);
    expect(await git(fixture.path, 'rev-parse', 'main')).not.toBe(descendant);
  });

  it('rejects a rewrite when the current branch changes during confirmation', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-stale-plan-');
    await git(fixture.path, 'branch', 'other');
    const oldest = await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest selected');
    const newest = await commitFile(fixture.path, 'newest.txt', 'newest\n', 'newest selected');
    const service = new GitOperationService(new RealGitRunner());

    await expect(
      service.run(
        fixture.summary,
        { kind: 'dropCommits', hashes: [newest, oldest] },
        {
          confirm: async () => {
            await git(fixture.path, 'checkout', 'other');
            return true;
          },
        },
      ),
    ).rejects.toThrow('changed during confirmation');
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('other');
    expect(await git(fixture.path, 'rev-parse', 'main')).toBe(newest);
  });

  it('rejects a branch switch that occurs during post-confirmation revalidation', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-revalidation-race-');
    const oldest = await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest selected');
    const newest = await commitFile(fixture.path, 'newest.txt', 'newest\n', 'newest selected');
    await git(fixture.path, 'branch', 'other', newest);
    const realRunner = new RealGitRunner();
    let historyReads = 0;
    const runner = {
      async run(args: readonly string[], options: GitRunOptions) {
        const result = await realRunner.run(args, options);
        if (args[0] === 'rev-list' && args.includes('--first-parent')) {
          historyReads += 1;
          if (historyReads === 2) await git(fixture.path, 'checkout', 'other');
        }
        return result;
      },
    } as GitRunner;
    const service = new GitOperationService(runner);

    await expect(
      service.run(
        fixture.summary,
        { kind: 'dropCommits', hashes: [newest, oldest] },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow('changed during confirmation');
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('other');
    expect(await git(fixture.path, 'rev-parse', 'main')).toBe(newest);
  });

  it('squashes a contiguous commit range with the edited message and keeps newer descendants', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-squash-range-');
    const oldest = await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest selected');
    const newest = await commitFile(fixture.path, 'newest.txt', 'newest\n', 'newest selected');
    await commitFile(fixture.path, 'descendant.txt', 'descendant\n', 'keep descendant');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      {
        kind: 'squashCommits',
        hashes: [newest, oldest],
        message: 'combined subject\n\ncombined body',
      },
      { confirm: () => Promise.resolve(true) },
    );

    expect((await git(fixture.path, 'log', '--format=%s')).split('\n')).toEqual([
      'keep descendant',
      'combined subject',
      'base',
    ]);
    expect(await git(fixture.path, 'log', '-1', '--format=%B', 'HEAD^')).toBe(
      'combined subject\n\ncombined body',
    );
    await expect(stat(join(fixture.path, 'oldest.txt'))).resolves.toBeDefined();
    await expect(stat(join(fixture.path, 'newest.txt'))).resolves.toBeDefined();
    await expect(stat(join(fixture.path, 'descendant.txt'))).resolves.toBeDefined();
  });

  it('rewrites selected commit messages and affected descendants on the current branch', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-edit-messages-');
    const oldest = await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest subject');
    await commitFile(fixture.path, 'middle.txt', 'middle\n', 'unselected middle');
    const newest = await commitFile(fixture.path, 'newest.txt', 'newest\n', 'newest subject');
    await commitFile(fixture.path, 'descendant.txt', 'descendant\n', 'keep descendant');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      {
        kind: 'editCommitMessages',
        edits: [
          { hash: newest, message: 'newest rewritten' },
          { hash: oldest, message: 'oldest rewritten' },
        ],
      },
      { confirm: () => Promise.resolve(true) },
    );

    expect((await git(fixture.path, 'log', '--format=%s')).split('\n')).toEqual([
      'keep descendant',
      'newest rewritten',
      'unselected middle',
      'oldest rewritten',
      'base',
    ]);
    // Files are preserved during the commit-object rewrite.
    await expect(stat(join(fixture.path, 'oldest.txt'))).resolves.toBeDefined();
    await expect(stat(join(fixture.path, 'newest.txt'))).resolves.toBeDefined();
    await expect(stat(join(fixture.path, 'descendant.txt'))).resolves.toBeDefined();
    // The rewritten history diverges from the previous tip but stays on branch main.
    expect(await git(fixture.path, 'rev-parse', 'HEAD')).not.toBe(newest);
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('main');
    // An explicit backup branch is created for the pre-rewrite tip.
    expect(await git(fixture.path, 'branch', '--list', 'commit-rewrite-backup/*')).not.toBe('');
  });

  it('rewrites a single commit that is the current HEAD', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-edit-single-head-');
    const head = await git(fixture.path, 'rev-parse', 'HEAD');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      {
        kind: 'editCommitMessages',
        edits: [{ hash: head, message: 'base edited' }],
      },
      { confirm: () => Promise.resolve(true) },
    );

    expect(await git(fixture.path, 'log', '-1', '--format=%s')).toBe('base edited');
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('main');
  });

  it('rejects edits that target commits unreachable from the current branch', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-edit-unreachable-');
    await git(fixture.path, 'branch', 'other');
    const head = await git(fixture.path, 'rev-parse', 'HEAD');
    await git(fixture.path, 'checkout', 'other');
    await commitFile(fixture.path, 'other.txt', 'other\n', 'other commit');
    await git(fixture.path, 'checkout', 'main');
    const service = new GitOperationService(new RealGitRunner());

    const reachableOther = await git(fixture.path, 'rev-parse', 'other');
    await expect(
      service.run(
        fixture.summary,
        {
          kind: 'editCommitMessages',
          edits: [{ hash: reachableOther, message: 'rewritten' }],
        },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow('reachable');
    expect(await git(fixture.path, 'rev-parse', 'main')).toBe(head);
  });

  it('requires destructive confirmation before rewriting commit messages', async () => {
    const { getOperationConfirmation } = await import('../../src/git/GitOperationService');
    expect(
      getOperationConfirmation(repository, {
        kind: 'editCommitMessages',
        edits: [{ hash: 'a'.repeat(40), message: 'rewritten' }],
      }),
    ).toMatchObject({ destructive: true, confirmLabel: 'Rewrite Commit Messages' });
  });

  it('refuses to rewrite when the current branch changes during confirmation', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-edit-stale-head-');
    await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest');
    await commitFile(fixture.path, 'second.txt', 'second\n', 'second');
    const second = await git(fixture.path, 'rev-parse', 'HEAD');
    const service = new GitOperationService(new RealGitRunner());

    await expect(
      service.run(
        fixture.summary,
        {
          kind: 'editCommitMessages',
          edits: [{ hash: second, message: 'rewritten' }],
        },
        {
          confirm: async () => {
            await git(fixture.path, 'commit', '--amend', '-m', 'amended during confirmation');
            return true;
          },
        },
      ),
    ).rejects.toThrow('changed during confirmation');
    // The amended commit is preserved; nothing was rewritten.
    expect(await git(fixture.path, 'log', '-1', '--format=%s')).toBe('amended during confirmation');
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('main');
    expect(await git(fixture.path, 'branch', '--list', 'commit-rewrite-backup/*')).toBe('');
  });

  it('rewrites author and committer of selected commits and their affected descendants', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-identity-rewrite-');
    const base = await git(fixture.path, 'rev-parse', 'HEAD');
    const wrong = await commitFileAs(
      fixture.path,
      'wrong.txt',
      'wrong\n',
      'wrong author',
      'Wrong One',
      'wrong@example.com',
      '2001-02-03T04:05:06+08:00',
    );
    await commitFile(fixture.path, 'middle.txt', 'middle\n', 'unselected middle');
    const top = await commitFile(fixture.path, 'top.txt', 'top\n', 'top');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      {
        kind: 'rewriteAuthorIdentity',
        hashes: [wrong],
        name: 'Right Person',
        email: 'right@example.com',
      },
      { confirm: () => Promise.resolve(true) },
    );

    const rows = (
      await git(fixture.path, 'log', '--format=%s%x00%H%x00%an%x00%ae%x00%cn%x00%ce')
    ).split('\n');
    const rowFor = (subject: string): string[] | undefined =>
      rows.find((line) => line.startsWith(`${subject}\0`))?.split('\0');
    const wrongRow = rowFor('wrong author');
    const topRow = rowFor('top');
    expect(wrongRow?.[1]).not.toBe(wrong);
    expect(wrongRow?.[2]).toBe('Right Person');
    expect(wrongRow?.[3]).toBe('right@example.com');
    expect(wrongRow?.[4]).toBe('Right Person');
    expect(wrongRow?.[5]).toBe('right@example.com');
    // Descendants keep their own identity but are rehashed because a parent changed.
    expect(topRow?.[1]).not.toBe(top);
    expect(topRow?.[2]).toBe('Operation Test');
    expect(topRow?.[3]).toBe('operation@example.com');
    // The rewritten history diverges from the old tip but stays on branch main.
    expect(await git(fixture.path, 'rev-parse', 'HEAD')).not.toBe(top);
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('main');
    // Non-affected ancestors are untouched.
    expect(await git(fixture.path, 'rev-parse', 'HEAD~3')).toBe(base);
    // The author timestamp survives the identity rewrite.
    const rewrittenWrongHash = wrongRow?.[1];
    expect(rewrittenWrongHash).toBeDefined();
    expect(await git(fixture.path, 'show', '-s', '--format=%aI', rewrittenWrongHash!)).toBe(
      '2001-02-03T04:05:06+08:00',
    );
    // An explicit backup branch is created for the pre-rewrite tip.
    const backupRefs = (
      await git(
        fixture.path,
        'for-each-ref',
        '--format=%(refname:short)%00%(objectname)',
        'refs/heads/identity-rewrite-backup',
      )
    ).split('\n').filter(Boolean);
    expect(backupRefs.length).toBe(1);
    expect(backupRefs[0]?.split('\0')[1]).toBe(top);
    // Files are preserved during the commit-object rewrite.
    await expect(stat(join(fixture.path, 'wrong.txt'))).resolves.toBeDefined();
    await expect(stat(join(fixture.path, 'middle.txt'))).resolves.toBeDefined();
    await expect(stat(join(fixture.path, 'top.txt'))).resolves.toBeDefined();
  });

  it('requires destructive confirmation before rewriting author identity', async () => {
    const { getOperationConfirmation } = await import('../../src/git/GitOperationService');
    expect(
      getOperationConfirmation(repository, {
        kind: 'rewriteAuthorIdentity',
        hashes: ['a'.repeat(40)],
        name: 'Right Person',
        email: 'right@example.com',
      }),
    ).toMatchObject({ destructive: true, confirmLabel: 'Rewrite Author Identity' });
  });

  it('rejects identity rewrites that target commits unreachable from the current branch', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-identity-unreachable-');
    await git(fixture.path, 'branch', 'other');
    const head = await git(fixture.path, 'rev-parse', 'HEAD');
    await git(fixture.path, 'checkout', 'other');
    await commitFile(fixture.path, 'other.txt', 'other\n', 'other commit');
    await git(fixture.path, 'checkout', 'main');
    const service = new GitOperationService(new RealGitRunner());

    const reachableOther = await git(fixture.path, 'rev-parse', 'other');
    await expect(
      service.run(
        fixture.summary,
        {
          kind: 'rewriteAuthorIdentity',
          hashes: [reachableOther],
          name: 'Right Person',
          email: 'right@example.com',
        },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow('reachable');
    expect(await git(fixture.path, 'rev-parse', 'main')).toBe(head);
  });

  it('refuses to rewrite author identity when the current branch changes during confirmation', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-identity-stale-head-');
    await commitFileAs(
      fixture.path,
      'wrong.txt',
      'wrong\n',
      'wrong author',
      'Wrong One',
      'wrong@example.com',
    );
    await commitFile(fixture.path, 'second.txt', 'second\n', 'second');
    const second = await git(fixture.path, 'rev-parse', 'HEAD');
    const service = new GitOperationService(new RealGitRunner());

    await expect(
      service.run(
        fixture.summary,
        {
          kind: 'rewriteAuthorIdentity',
          hashes: [second],
          name: 'Right Person',
          email: 'right@example.com',
        },
        {
          confirm: async () => {
            await git(fixture.path, 'commit', '--amend', '-m', 'amended during confirmation');
            return true;
          },
        },
      ),
    ).rejects.toThrow('changed during confirmation');
    // The amended commit is preserved; nothing was rewritten.
    expect(await git(fixture.path, 'log', '-1', '--format=%s')).toBe('amended during confirmation');
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('main');
    expect(await git(fixture.path, 'branch', '--list', 'identity-rewrite-backup/*')).toBe('');
  });

  it('rejects non-contiguous commit ranges and dirty worktrees before rewriting history', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-invalid-range-');
    const oldest = await commitFile(fixture.path, 'oldest.txt', 'oldest\n', 'oldest selected');
    await commitFile(fixture.path, 'middle.txt', 'middle\n', 'unselected middle');
    const newest = await commitFile(fixture.path, 'newest.txt', 'newest\n', 'newest selected');
    const service = new GitOperationService(new RealGitRunner());

    await expect(
      service.run(
        fixture.summary,
        { kind: 'dropCommits', hashes: [newest, oldest] },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow('contiguous');

    const middle = await git(fixture.path, 'rev-parse', 'HEAD^');
    await writeFile(join(fixture.path, 'dirty.txt'), 'dirty\n');
    await expect(
      service.run(
        fixture.summary,
        { kind: 'dropCommits', hashes: [newest, middle] },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow('clean worktree');
  });

  it('rejects ranges containing the root commit or crossing a merge commit', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const rootFixture = await createFixtureRepository('git-operation-root-range-');
    const root = await git(rootFixture.path, 'rev-parse', 'HEAD');
    const second = await commitFile(rootFixture.path, 'second.txt', 'second\n', 'second');
    const service = new GitOperationService(new RealGitRunner());
    await expect(
      service.run(
        rootFixture.summary,
        { kind: 'dropCommits', hashes: [second, root] },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow('root commit');

    const mergeFixture = await createFixtureRepository('git-operation-merge-range-');
    await git(mergeFixture.path, 'branch', 'side');
    const mainCommit = await commitFile(mergeFixture.path, 'main.txt', 'main\n', 'main change');
    await git(mergeFixture.path, 'checkout', 'side');
    await commitFile(mergeFixture.path, 'side.txt', 'side\n', 'side change');
    await git(mergeFixture.path, 'checkout', 'main');
    await git(mergeFixture.path, 'merge', '--no-ff', '--no-edit', 'side');
    const mergeCommit = await git(mergeFixture.path, 'rev-parse', 'HEAD');
    await expect(
      service.run(
        mergeFixture.summary,
        { kind: 'dropCommits', hashes: [mergeCommit, mainCommit] },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow('merge commits');
  });

  it('requires destructive confirmation for dropping or squashing commits', () => {
    const hashes = ['b'.repeat(40), 'a'.repeat(40)];
    expect(getOperationConfirmation(repository, { kind: 'dropCommits', hashes })).toMatchObject({
      destructive: true,
      confirmLabel: 'Drop Commits',
    });
    expect(
      getOperationConfirmation(repository, {
        kind: 'squashCommits',
        hashes,
        message: 'combined',
      }),
    ).toMatchObject({ destructive: true, confirmLabel: 'Squash Commits' });
  });

  it('maps supported operations to shell-free Git argument arrays', async () => {
    const modulePath = '../../src/git/GitOperationService';
    const operationModule = await import(/* @vite-ignore */ modulePath).catch(() => undefined);
    expect(operationModule, 'GitOperationService must exist').toBeDefined();
    if (!operationModule) return;

    const calls: string[][] = [];
    const runner = {
      run(args: readonly string[]) {
        calls.push([...args]);
        if (args[0] === 'remote') {
          return Promise.resolve({ ...successfulResult, stdout: Buffer.from('origin\n') });
        }
        return Promise.resolve(successfulResult);
      },
    } as unknown as GitRunner;
    const service = new operationModule.GitOperationService(runner, passthroughInspection);
    const cases: Array<[GitOperationRequest, string[]]> = [
      [{ kind: 'checkout', ref: 'main' }, ['checkout', 'main', '--']],
      [
        { kind: 'createBranch', name: 'feature/login', startPoint: 'abc1234' },
        ['branch', '--', 'feature/login', 'abc1234'],
      ],
      [{ kind: 'createTag', name: 'v1.0.0', target: 'abc1234' }, ['tag', '--', 'v1.0.0', 'abc1234']],
      [{ kind: 'deleteTag', name: 'v1.0.0' }, ['tag', '-d', '--', 'v1.0.0']],
      [
        { kind: 'checkoutRemote', name: 'feature', startPoint: 'origin/feature' },
        ['checkout', '-b', 'feature', '--track', 'origin/feature'],
      ],
      [
        { kind: 'deleteRemoteBranch', remote: 'origin', branch: 'feature' },
        ['push', 'origin', '--delete', 'refs/heads/feature'],
      ],
      [{ kind: 'fetch', remote: 'origin' }, ['fetch', 'origin']],
      [{ kind: 'pull' }, ['pull']],
      [{ kind: 'cherryPick', hash: 'abc1234' }, ['cherry-pick', 'abc1234']],
      [{ kind: 'revert', hash: 'abc1234' }, ['revert', '--no-edit', 'abc1234']],
      [{ kind: 'merge', ref: 'feature/login' }, ['merge', '--no-edit', 'feature/login']],
      [{ kind: 'rebase', ref: 'main' }, ['rebase', 'main']],
      [{ kind: 'reset', hash: 'abc1234', mode: 'hard' }, ['reset', '--hard', 'abc1234', '--']],
      [
        { kind: 'renameBranch', oldName: 'feature/login', newName: 'feature/auth' },
        ['branch', '-m', '--', 'feature/login', 'feature/auth'],
      ],
      [{ kind: 'deleteBranch', name: 'feature/auth', force: true }, ['branch', '-D', '--', 'feature/auth']],
    ];

    for (const [operation] of cases) {
      await service.run(repository, operation, { confirm: () => Promise.resolve(true) });
    }

    for (const [, args] of cases) expect(calls).toContainEqual(args);
  });

  it('maps rebase control operations to their git rebase flags', async () => {
    const operationModule = await import('../../src/git/GitOperationService');
    expect(operationModule.buildOperationArguments({ kind: 'rebaseContinue' })).toEqual([
      'rebase',
      '--continue',
    ]);
    expect(operationModule.buildOperationArguments({ kind: 'rebaseSkip' })).toEqual([
      'rebase',
      '--skip',
    ]);
    expect(operationModule.buildOperationArguments({ kind: 'rebaseAbort' })).toEqual([
      'rebase',
      '--abort',
    ]);
  });

  it('requires explicit confirmation before deleting tags or remote branches', () => {
    const remote = getOperationConfirmation(repository, {
      kind: 'deleteRemoteBranch',
      remote: 'origin',
      branch: 'feature',
    });
    const tag = getOperationConfirmation(repository, { kind: 'deleteTag', name: 'v1.0.0' });

    expect(remote).toMatchObject({ destructive: true, confirmLabel: 'Delete Remote Branch' });
    expect(remote?.detail).toContain('origin/feature');
    expect(tag).toMatchObject({ destructive: true, confirmLabel: 'Delete Tag' });
  });

  it('refuses destructive operations when no confirmation handler is available', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn().mockResolvedValue(successfulResult);
    const service = new GitOperationService({ run } as unknown as GitRunner, passthroughInspection);

    await expect(
      service.run(repository, { kind: 'deleteTag', name: 'v1.0.0' }),
    ).rejects.toThrow('requires confirmation');
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects remote-branch deletion unless the remote is configured and tracked locally', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn().mockImplementation((args: readonly string[]) => {
      if (args[0] === 'remote') return Promise.resolve({ ...successfulResult, stdout: Buffer.from('upstream\n') });
      return Promise.resolve(successfulResult);
    });
    const service = new GitOperationService({ run } as unknown as GitRunner, passthroughInspection);

    await expect(
      service.run(
        repository,
        { kind: 'deleteRemoteBranch', remote: 'origin', branch: 'feature' },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow('configured remote');
    expect(run.mock.calls.some(([args]) => args[0] === 'push')).toBe(false);
  });

  it('serializes operations for one repository while allowing another repository to proceed', async () => {
    const operationModule = await import('../../src/git/GitOperationService');
    const started: string[] = [];
    let finishFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const runner = {
      async run(args: readonly string[], options: GitRunOptions) {
        started.push(`${options.cwd}:${args.join(' ')}`);
        if (args.includes('one')) await first;
        return successfulResult;
      },
    } as unknown as GitRunner;
    const service = new operationModule.GitOperationService(runner, passthroughInspection);
    const otherRepository = {
      ...repository,
      id: 'repo-2',
      rootUri: 'file:///C:/workspace/other',
      gitDirUri: 'file:///C:/workspace/other/.git',
      displayName: 'other',
    };

    const firstRun = service.run(repository, { kind: 'checkout', ref: 'one' });
    const secondRun = service.run(repository, { kind: 'checkout', ref: 'two' });
    const otherRun = service.run(otherRepository, { kind: 'checkout', ref: 'other' });
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(started).toEqual(
      expect.arrayContaining([
        `${projectPath}:checkout one --`,
        `${otherPath}:checkout other --`,
      ]),
    );
    expect(started.some((entry) => entry.includes('checkout two'))).toBe(false);

    finishFirst?.();
    await Promise.all([firstRun, secondRun, otherRun]);
    expect(started.at(-1)).toBe(`${projectPath}:checkout two --`);
  });

  it('serializes linked worktrees that share a common Git directory', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const started: string[] = [];
    let finishFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const runner = {
      async run(args: readonly string[], options: GitRunOptions) {
        started.push(`${options.cwd}:${args.join(' ')}`);
        if (args.includes('main')) await first;
        return successfulResult;
      },
    } as unknown as GitRunner;
    const service = new GitOperationService(runner, passthroughInspection);
    const mainWorktree = {
      ...repository,
      commonGitDirUri: 'file:///C:/workspace/project/.git',
    };
    const linkedWorktree: RepositorySummary = {
      ...repository,
      id: 'repo-linked',
      rootUri: 'file:///C:/workspace/project-feature',
      gitDirUri: 'file:///C:/workspace/project/.git/worktrees/project-feature',
      commonGitDirUri: 'file:///C:/workspace/project/.git',
      displayName: 'project-feature',
    };

    const mainRun = service.run(mainWorktree, { kind: 'checkout', ref: 'main' });
    const linkedRun = service.run(linkedWorktree, { kind: 'checkout', ref: 'feature' });
    await vi.waitFor(() => expect(started).toHaveLength(1));
    expect(started).toEqual([`${projectPath}:checkout main --`]);

    finishFirst?.();
    await Promise.all([mainRun, linkedRun]);
    expect(started).toEqual([
      `${projectPath}:checkout main --`,
      `${featurePath}:checkout feature --`,
    ]);
  });

  it('prepares and confirms a queued force push against fresh state under the repository lock', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const mainHash = 'a'.repeat(40);
    const featureHash = 'b'.repeat(40);
    let currentBranch = 'main';
    let head = mainHash;
    let releaseCheckout: (() => void) | undefined;
    let checkoutStarted: (() => void) | undefined;
    const checkoutGate = new Promise<void>((resolve) => {
      releaseCheckout = resolve;
    });
    const started = new Promise<void>((resolve) => {
      checkoutStarted = resolve;
    });
    const calls: string[][] = [];
    const runner = {
      async run(args: readonly string[]) {
        calls.push([...args]);
        if (args[0] === 'checkout') {
          checkoutStarted?.();
          await checkoutGate;
          currentBranch = 'feature';
          head = featureHash;
          return successfulResult;
        }
        if (args[0] === 'config' && args[1] === '--get') {
          const values = new Map<string, string>([
            ['branch.feature.remote', 'origin'],
            ['branch.feature.merge', 'refs/heads/feature'],
            ['push.default', 'simple'],
          ]);
          const value = values.get(args[2] ?? '');
          if (value) return { ...successfulResult, stdout: Buffer.from(`${value}\n`) };
          throw new (await import('../../src/git/GitRunner')).GitCommandError(
            'missing config',
            args,
            '/workspace/project',
            1,
            Buffer.alloc(0),
            Buffer.alloc(0),
            false,
            false,
          );
        }
        if (args[0] === 'config' && args[1] === '--get-all') {
          throw new (await import('../../src/git/GitRunner')).GitCommandError(
            'missing config',
            args,
            '/workspace/project',
            1,
            Buffer.alloc(0),
            Buffer.alloc(0),
            false,
            false,
          );
        }
        if (args[0] === 'rev-parse') {
          return { ...successfulResult, stdout: Buffer.from(`${head}\n`) };
        }
        return successfulResult;
      },
    } as unknown as GitRunner;
    const service = new GitOperationService(runner, {
      inspectRepository: () =>
        Promise.resolve({ ...repository, currentBranch, head }),
    } as never);
    const confirm = vi.fn().mockResolvedValue(true);

    const checkout = service.run(repository, { kind: 'checkout', ref: 'feature' });
    await started;
    const forcePush = service.run(
      repository,
      { kind: 'push', forceWithLease: true },
      { confirm },
    );
    releaseCheckout?.();
    await Promise.all([checkout, forcePush]);

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.stringContaining('origin/refs/heads/feature') }),
    );
    expect(calls.at(-1)).toEqual([
      'push',
      '--force-with-lease=refs/heads/feature',
      'origin',
      `${featureHash}:refs/heads/feature`,
    ]);
  });

  it('describes destructive confirmations with the repository and actual target', async () => {
    const operationModule = await import('../../src/git/GitOperationService');
    const forceDeleteConfirmation = operationModule.getOperationConfirmation(repository, {
      kind: 'deleteBranch',
      name: 'feature/login',
      force: true,
    });

    expect(
      operationModule.getOperationConfirmation(repository, {
        kind: 'reset',
        mode: 'hard',
        hash: 'abc1234',
      }),
    ).toMatchObject({ destructive: true, confirmLabel: 'Hard Reset' });
    expect(forceDeleteConfirmation).toMatchObject({
      destructive: true,
      confirmLabel: 'Force Delete Branch',
    });
    expect(forceDeleteConfirmation?.detail).toContain('project');
    expect(forceDeleteConfirmation?.detail).toContain('feature/login');
    expect(forceDeleteConfirmation?.detail).toContain('even if it is not merged');
    expect(
      operationModule.getOperationConfirmation(repository, {
        kind: 'push',
        forceWithLease: true,
        remote: 'origin',
        targetRef: 'refs/heads/main',
      }),
    ).toMatchObject({ destructive: true, confirmLabel: 'Force Push with Lease' });
    expect(
      operationModule.getOperationConfirmation(repository, {
        kind: 'push',
        forceWithLease: true,
        remote: 'origin',
        targetRef: 'refs/heads/main',
      })?.detail,
    ).toContain('origin/refs/heads/main');
    expect(
      operationModule.getOperationConfirmation(repository, { kind: 'rebaseSkip' }),
    ).toMatchObject({ destructive: true, confirmLabel: 'Skip Commit' });
    expect(
      operationModule.getOperationConfirmation(repository, { kind: 'rebaseAbort' }),
    ).toMatchObject({ destructive: true, confirmLabel: 'Abort Rebase' });
    expect(operationModule.getOperationConfirmation(repository, { kind: 'fetch' })).toBeUndefined();
  });

  it('allows only rebase controls while a rebase is in progress', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn().mockResolvedValue(successfulResult);
    const service = new GitOperationService(
      { run } as unknown as GitRunner,
      {
        inspectRepository: (candidate) =>
          Promise.resolve({
            ...candidate,
            operationState: 'rebase',
            hasUnresolvedConflicts: false,
          }),
      },
    );

    for (const operation of [
      { kind: 'rebaseContinue' },
      { kind: 'rebaseSkip' },
      { kind: 'rebaseAbort' },
    ] as const) {
      await service.run(repository, operation, { confirm: () => Promise.resolve(true) });
    }

    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ['rebase', '--continue'],
      ['rebase', '--skip'],
      ['rebase', '--abort'],
    ]);
    await expect(
      service.run(repository, { kind: 'checkout', ref: 'feature' }),
    ).rejects.toThrow('rebase is in progress');
  });

  it('rejects rebase controls after the rebase has ended', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn().mockResolvedValue(successfulResult);
    const service = new GitOperationService(
      { run } as unknown as GitRunner,
      passthroughInspection,
    );

    await expect(service.run(repository, { kind: 'rebaseContinue' })).rejects.toThrow(
      'No Git rebase is in progress',
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects rebase continue while conflicts remain unresolved', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn().mockResolvedValue(successfulResult);
    const service = new GitOperationService(
      { run } as unknown as GitRunner,
      {
        inspectRepository: (candidate) =>
          Promise.resolve({
            ...candidate,
            operationState: 'rebase',
            hasUnresolvedConflicts: true,
          }),
      },
    );

    await expect(service.run(repository, { kind: 'rebaseContinue' })).rejects.toThrow(
      'Resolve all conflicts before continuing the rebase',
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects every write operation for a bare repository before invoking Git', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn().mockResolvedValue(successfulResult);
    const service = new GitOperationService(
      { run } as unknown as GitRunner,
      passthroughInspection,
    );

    await expect(
      service.run({ ...repository, isBare: true }, { kind: 'fetch' }),
    ).rejects.toThrow('read-only');
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects conflicting operations while a sequenced Git operation is in progress', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const run = vi.fn().mockResolvedValue(successfulResult);
    const service = new GitOperationService(
      { run } as unknown as GitRunner,
      passthroughInspection,
    );

    await expect(
      service.run(
        { ...repository, operationState: 'rebase' },
        { kind: 'checkout', ref: 'feature' },
      ),
    ).rejects.toThrow('rebase is in progress');
    expect(run).not.toHaveBeenCalled();
  });

  it('resolves and pins the exact upstream target for force push with lease', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const calls: string[][] = [];
    const values = new Map<string, string>([
      ['branch.main.pushRemote', 'origin'],
      ['branch.main.remote', 'origin'],
      ['branch.main.merge', 'refs/heads/main'],
    ]);
    const runner = {
      run(args: readonly string[]) {
        calls.push([...args]);
        if (args[0] === 'config') {
          const value = values.get(args[2] ?? '');
          if (value !== undefined) {
            return Promise.resolve({ ...successfulResult, stdout: Buffer.from(`${value}\n`) });
          }
          return Promise.resolve({ ...successfulResult, stdout: Buffer.alloc(0) });
        }
        if (args[0] === 'rev-parse') {
          return Promise.resolve({ ...successfulResult, stdout: Buffer.from(`${'a'.repeat(40)}\n`) });
        }
        return Promise.resolve(successfulResult);
      },
    } as unknown as GitRunner;
    const service = new GitOperationService(runner, {
      inspectRepository: (candidate) =>
        Promise.resolve({ ...candidate, currentBranch: 'main', head: 'a'.repeat(40) }),
    });
    const target = await service.resolvePushTarget({ ...repository, currentBranch: 'main' });
    await service.run(
      { ...repository, currentBranch: 'main' },
      { kind: 'push', forceWithLease: true },
      { confirm: () => Promise.resolve(true) },
    );

    expect(target).toEqual({ remote: 'origin', targetRef: 'refs/heads/main' });
    expect(calls).toContainEqual(['rev-parse', '--verify', 'HEAD^{commit}']);
    expect(calls.at(-1)).toEqual([
      'push',
      '--force-with-lease=refs/heads/main',
      'origin',
      `${'a'.repeat(40)}:refs/heads/main`,
    ]);
  });

  it('falls back through unset optional push config in a real repository', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-push-target-');
    const remote = await mkdtemp(join(tmpdir(), 'git-operation-push-target-remote-'));
    temporaryDirectories.push(remote);
    await git(remote, 'init', '--bare');
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'push', '-u', 'origin', 'main');

    const service = new GitOperationService(new RealGitRunner());
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).resolves.toEqual({ remote: 'origin', targetRef: 'refs/heads/main' });
  });

  it('rejects push.default=simple when the current branch has no upstream', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-simple-no-upstream-');
    const remote = await mkdtemp(join(tmpdir(), 'git-operation-simple-no-upstream-remote-'));
    temporaryDirectories.push(remote);
    await git(remote, 'init', '--bare');
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'config', 'push.default', 'simple');
    // Pin autoSetupRemote off locally so a global push.autoSetupRemote=true cannot change the outcome.
    await git(fixture.path, 'config', 'push.autoSetupRemote', 'false');

    const service = new GitOperationService(new RealGitRunner());
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).rejects.toThrow('no upstream push target');
  });

  it('treats push.default=tracking as upstream for force-push target resolution', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-tracking-target-');
    const remote = await mkdtemp(join(tmpdir(), 'git-operation-tracking-target-remote-'));
    temporaryDirectories.push(remote);
    await git(remote, 'init', '--bare');
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'config', 'branch.main.remote', 'origin');
    await git(fixture.path, 'config', 'branch.main.merge', 'refs/heads/develop');
    await git(fixture.path, 'config', 'push.default', 'tracking');

    const service = new GitOperationService(new RealGitRunner());
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).resolves.toEqual({ remote: 'origin', targetRef: 'refs/heads/develop' });
  });

  it('uses current-branch semantics for simple pushes to a triangular push remote', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-triangular-target-');
    const origin = await mkdtemp(join(tmpdir(), 'git-operation-triangular-origin-'));
    const fork = await mkdtemp(join(tmpdir(), 'git-operation-triangular-fork-'));
    temporaryDirectories.push(origin, fork);
    await git(origin, 'init', '--bare');
    await git(fork, 'init', '--bare');
    await git(fixture.path, 'remote', 'add', 'origin', origin);
    await git(fixture.path, 'remote', 'add', 'fork', fork);
    await git(fixture.path, 'config', 'branch.main.remote', 'origin');
    await git(fixture.path, 'config', 'branch.main.merge', 'refs/heads/develop');
    await git(fixture.path, 'config', 'branch.main.pushRemote', 'fork');
    await git(fixture.path, 'config', 'push.default', 'simple');

    const service = new GitOperationService(new RealGitRunner());
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).resolves.toEqual({ remote: 'fork', targetRef: 'refs/heads/main' });
  });

  it('honors a single remote push refspec when resolving the force-push destination', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-push-refspec-');
    const remote = await mkdtemp(join(tmpdir(), 'git-operation-push-refspec-remote-'));
    temporaryDirectories.push(remote);
    await git(remote, 'init', '--bare');
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'config', 'branch.main.remote', 'origin');
    await git(fixture.path, 'config', 'branch.main.merge', 'refs/heads/main');
    await git(
      fixture.path,
      'config',
      'remote.origin.push',
      'refs/heads/main:refs/heads/review/main',
    );

    const service = new GitOperationService(new RealGitRunner());
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).resolves.toEqual({ remote: 'origin', targetRef: 'refs/heads/review/main' });
  });

  it('rejects configured push refspecs whose destination namespace is implicit', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-shorthand-refspec-');
    const remote = await mkdtemp(join(tmpdir(), 'git-operation-shorthand-refspec-remote-'));
    temporaryDirectories.push(remote);
    await git(remote, 'init', '--bare');
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'config', 'branch.main.remote', 'origin');
    await git(fixture.path, 'config', 'branch.main.merge', 'refs/heads/main');
    const service = new GitOperationService(new RealGitRunner());

    await git(fixture.path, 'config', 'remote.origin.push', 'HEAD');
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).rejects.toThrow('fully qualified');

    await git(fixture.path, 'config', 'remote.origin.push', 'refs/tags/v1:release');
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).rejects.toThrow('fully qualified');
  });

  it('rejects mirror and multi-ref remote push configurations for force push', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-ambiguous-push-refspec-');
    const remote = await mkdtemp(join(tmpdir(), 'git-operation-ambiguous-push-refspec-remote-'));
    temporaryDirectories.push(remote);
    await git(remote, 'init', '--bare');
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'config', 'branch.main.remote', 'origin');
    await git(fixture.path, 'config', 'branch.main.merge', 'refs/heads/main');
    const service = new GitOperationService(new RealGitRunner());

    await git(fixture.path, 'config', 'remote.origin.mirror', 'true');
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).rejects.toThrow('mirror');

    await git(fixture.path, 'config', '--unset', 'remote.origin.mirror');
    await git(fixture.path, 'config', '--add', 'remote.origin.push', 'main:main');
    await git(fixture.path, 'config', '--add', 'remote.origin.push', 'feature:feature');
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).rejects.toThrow('multiple');
  });

  it('rejects an unknown push.default mode instead of guessing a force-push target', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-unknown-push-default-');
    await git(fixture.path, 'config', 'push.default', 'surprise');

    const service = new GitOperationService(new RealGitRunner());
    await expect(
      service.resolvePushTarget({ ...fixture.summary, currentBranch: 'main' }),
    ).rejects.toThrow();
  });

  it('executes local history and branch operations in a disposable repository', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository();
    const service = new GitOperationService(new RealGitRunner());
    const baseHash = await git(fixture.path, 'rev-parse', 'HEAD');

    await service.run(fixture.summary, { kind: 'createBranch', name: 'feature', startPoint: baseHash });
    await service.run(fixture.summary, { kind: 'checkout', ref: 'feature' });
    await writeFile(join(fixture.path, 'feature.txt'), 'feature\n');
    await git(fixture.path, 'add', 'feature.txt');
    await git(fixture.path, 'commit', '-m', 'feature change');
    const featureHash = await git(fixture.path, 'rev-parse', 'HEAD');
    await service.run(fixture.summary, { kind: 'checkout', ref: 'main' });
    await service.run(fixture.summary, { kind: 'cherryPick', hash: featureHash });
    const cherryPickHash = await git(fixture.path, 'rev-parse', 'HEAD');
    await expect(stat(join(fixture.path, 'feature.txt'))).resolves.toBeDefined();
    await service.run(fixture.summary, { kind: 'revert', hash: cherryPickHash });
    await expect(stat(join(fixture.path, 'feature.txt'))).rejects.toThrow();

    await service.run(fixture.summary, { kind: 'createTag', name: 'v1.0.0', target: baseHash });
    await service.run(fixture.summary, { kind: 'createBranch', name: 'old-name', startPoint: baseHash });
    await service.run(fixture.summary, {
      kind: 'renameBranch',
      oldName: 'old-name',
      newName: 'new-name',
    });
    await service.run(
      fixture.summary,
      { kind: 'deleteBranch', name: 'new-name', force: true },
      { confirm: () => Promise.resolve(true) },
    );
    expect(await git(fixture.path, 'tag', '--list', 'v1.0.0')).toBe('v1.0.0');
    expect(await git(fixture.path, 'branch', '--list', 'new-name')).toBe('');
    await service.run(
      fixture.summary,
      { kind: 'deleteTag', name: 'v1.0.0' },
      { confirm: () => Promise.resolve(true) },
    );
    expect(await git(fixture.path, 'tag', '--list', 'v1.0.0')).toBe('');

    await service.run(
      fixture.summary,
      { kind: 'reset', mode: 'hard', hash: baseHash },
      { confirm: () => Promise.resolve(true) },
    );
    await service.run(fixture.summary, { kind: 'createBranch', name: 'merge-source', startPoint: baseHash });
    await service.run(fixture.summary, { kind: 'checkout', ref: 'merge-source' });
    await writeFile(join(fixture.path, 'merge.txt'), 'merge\n');
    await git(fixture.path, 'add', 'merge.txt');
    await git(fixture.path, 'commit', '-m', 'merge source');
    await service.run(fixture.summary, { kind: 'checkout', ref: 'main' });
    await service.run(fixture.summary, { kind: 'merge', ref: 'merge-source' });
    expect(await git(fixture.path, 'rev-parse', 'HEAD')).not.toBe(baseHash);

    await service.run(fixture.summary, { kind: 'createBranch', name: 'rebase-source', startPoint: baseHash });
    await service.run(fixture.summary, { kind: 'checkout', ref: 'rebase-source' });
    await writeFile(join(fixture.path, 'rebase.txt'), 'rebase\n');
    await git(fixture.path, 'add', 'rebase.txt');
    await git(fixture.path, 'commit', '-m', 'rebase source');
    await service.run(fixture.summary, { kind: 'rebase', ref: 'main' });
    expect(await git(fixture.path, 'merge-base', '--is-ancestor', 'main', 'HEAD')).toBe('');
  });

  it('fetches, pulls, and pushes through a local bare remote', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-local-');
    const remote = await mkdtemp(join(tmpdir(), 'git-operation-remote-'));
    const peer = await mkdtemp(join(tmpdir(), 'git-operation-peer-'));
    temporaryDirectories.push(remote, peer);
    await git(remote, 'init', '--bare');
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'push', '-u', 'origin', 'main');
    await execFileAsync('git', ['clone', '-b', 'main', remote, peer]);
    await git(peer, 'checkout', '-b', 'topic');
    await writeFile(join(peer, 'topic.txt'), 'topic\n');
    await git(peer, 'add', 'topic.txt');
    await git(peer, 'commit', '-m', 'topic change');
    await git(peer, 'push', '-u', 'origin', 'topic');
    await git(peer, 'checkout', 'main');
    await writeFile(join(peer, 'peer.txt'), 'peer\n');
    await git(peer, 'add', 'peer.txt');
    await git(peer, 'commit', '-m', 'peer change');
    await git(peer, 'push', 'origin', 'main');

    const service = new GitOperationService(new RealGitRunner());
    await service.run(fixture.summary, { kind: 'fetch', remote: 'origin' });
    await service.run(fixture.summary, {
      kind: 'checkoutRemote',
      name: 'topic-local',
      startPoint: 'origin/topic',
    });
    expect(await git(fixture.path, 'branch', '--show-current')).toBe('topic-local');
    await service.run(fixture.summary, { kind: 'checkout', ref: 'main' });
    await service.run(
      fixture.summary,
      { kind: 'deleteRemoteBranch', remote: 'origin', branch: 'topic' },
      { confirm: () => Promise.resolve(true) },
    );
    await expect(
      execFileAsync('git', ['show-ref', '--verify', 'refs/heads/topic'], { cwd: remote }),
    ).rejects.toBeDefined();
    await service.run(fixture.summary, { kind: 'pull' });
    await expect(stat(join(fixture.path, 'peer.txt'))).resolves.toBeDefined();
    await writeFile(join(fixture.path, 'local.txt'), 'local\n');
    await git(fixture.path, 'add', 'local.txt');
    await git(fixture.path, 'commit', '-m', 'local change');
    await service.run(fixture.summary, { kind: 'push' });
    expect(await git(remote, 'rev-parse', 'main')).toBe(await git(fixture.path, 'rev-parse', 'main'));
  });

  it('maps publish requests to an explicit set-upstream push', async () => {
    const { buildOperationArguments } = await import('../../src/git/GitOperationService');

    expect(
      buildOperationArguments({ kind: 'publishBranch', remote: 'origin', branch: 'feature' }),
    ).toEqual(['push', '--set-upstream', 'origin', 'feature']);
    expect(() => buildOperationArguments({ kind: 'publishBranch' })).toThrow(
      'Publish target must be resolved before execution.',
    );
  });

  it('treats publishing a branch as a non-destructive operation', () => {
    expect(getOperationConfirmation(repository, { kind: 'publishBranch' })).toBeUndefined();
  });

  it('publishes a branch without an upstream and records the tracking configuration', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'checkout', '-b', 'feature');
    const head = await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());
    const readAutoSetupRemote = () =>
      git(fixture.path, 'config', '--get', 'push.autoSetupRemote').catch(() => '(unset)');
    const autoSetupRemoteBefore = await readAutoSetupRemote();

    await service.run(fixture.summary, { kind: 'publishBranch' });

    expect(await git(remote, 'rev-parse', 'feature')).toBe(head);
    expect(await git(fixture.path, 'config', '--get', 'branch.feature.remote')).toBe('origin');
    expect(await git(fixture.path, 'config', '--get', 'branch.feature.merge')).toBe(
      'refs/heads/feature',
    );
    // The default fetch refspec already covers the branch, so the push creates the tracking ref
    // and the publish must not need an extra fetch.
    expect(await git(fixture.path, 'rev-parse', 'refs/remotes/origin/feature')).toBe(head);
    expect(await readAutoSetupRemote()).toBe(autoSetupRemoteBefore);
    expect(await git(fixture.path, 'config', '--local', '--list')).not.toMatch(
      /push\.autosetupremote/iu,
    );
  });

  it('refuses to publish a branch that already tracks an upstream', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-tracked-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'checkout', '-b', 'feature');
    await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());
    await service.run(fixture.summary, { kind: 'publishBranch' });

    await expect(service.run(fixture.summary, { kind: 'publishBranch' })).rejects.toThrow(
      /already tracks/u,
    );
  });

  it('refuses to publish a branch with an incomplete upstream configuration', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-partial-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'checkout', '-b', 'feature');
    await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    await git(fixture.path, 'config', 'branch.feature.remote', 'origin');
    const service = new GitOperationService(new RealGitRunner());

    await expect(service.run(fixture.summary, { kind: 'publishBranch' })).rejects.toThrow(
      /incomplete upstream configuration/u,
    );
  });

  it('refuses to publish a branch that has no commits yet', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-unborn-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'checkout', '--orphan', 'orphan');
    await git(fixture.path, 'rm', '-r', '--cached', '.');
    const service = new GitOperationService(new RealGitRunner());

    await expect(service.run(fixture.summary, { kind: 'publishBranch' })).rejects.toThrow(
      /no commits yet/u,
    );
  });

  it('refuses to publish while HEAD is detached', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-detached-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'checkout', '--detach');
    const service = new GitOperationService(new RealGitRunner());

    await expect(service.run(fixture.summary, { kind: 'publishBranch' })).rejects.toThrow(
      /HEAD is detached/u,
    );
  });

  it('refuses to publish when several remotes exist without a push default', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-multi-');
    const origin = await createBareRemote();
    const second = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', origin);
    await git(fixture.path, 'remote', 'add', 'second', second);
    await git(fixture.path, 'checkout', '-b', 'feature');
    await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());

    await expect(service.run(fixture.summary, { kind: 'publishBranch' })).rejects.toThrow(
      /unique push remote/u,
    );
    await expect(git(origin, 'show-ref', '--verify', 'refs/heads/feature')).rejects.toBeDefined();
    await expect(git(second, 'show-ref', '--verify', 'refs/heads/feature')).rejects.toBeDefined();
  });

  it('publishes to the only configured remote even when it is not origin', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-single-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'upstream', remote);
    await git(fixture.path, 'checkout', '-b', 'feature');
    const head = await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(fixture.summary, { kind: 'publishBranch' });

    expect(await git(remote, 'rev-parse', 'feature')).toBe(head);
    expect(await git(fixture.path, 'config', '--get', 'branch.feature.remote')).toBe('upstream');
  });

  it('honours remote.pushDefault when several remotes exist', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-pushdefault-');
    const origin = await createBareRemote();
    const second = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', origin);
    await git(fixture.path, 'remote', 'add', 'second', second);
    await git(fixture.path, 'config', 'remote.pushDefault', 'second');
    await git(fixture.path, 'checkout', '-b', 'feature');
    const head = await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(fixture.summary, { kind: 'publishBranch' });

    expect(await git(second, 'rev-parse', 'feature')).toBe(head);
    await expect(git(origin, 'show-ref', '--verify', 'refs/heads/feature')).rejects.toBeDefined();
  });

  it('prefers branch pushRemote over remote.pushDefault when publishing', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-pushremote-');
    const origin = await createBareRemote();
    const second = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', origin);
    await git(fixture.path, 'remote', 'add', 'second', second);
    await git(fixture.path, 'config', 'remote.pushDefault', 'second');
    await git(fixture.path, 'checkout', '-b', 'feature');
    await git(fixture.path, 'config', 'branch.feature.pushRemote', 'origin');
    const head = await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(fixture.summary, { kind: 'publishBranch' });

    expect(await git(origin, 'rev-parse', 'feature')).toBe(head);
    await expect(git(second, 'show-ref', '--verify', 'refs/heads/feature')).rejects.toBeDefined();
    expect(await git(fixture.path, 'config', '--get', 'branch.feature.remote')).toBe('origin');
  });

  it('refuses to publish to a mirror remote', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-mirror-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'config', 'remote.origin.mirror', 'true');
    await git(fixture.path, 'checkout', '-b', 'feature');
    await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());

    await expect(service.run(fixture.summary, { kind: 'publishBranch' })).rejects.toThrow(/mirror/u);
  });

  it('publishes regardless of push.default because the refspec is explicit', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const service = new GitOperationService(new RealGitRunner());
    for (const pushDefault of ['matching', 'nothing']) {
      const fixture = await createFixtureRepository(`git-publish-default-${pushDefault}-`);
      const remote = await createBareRemote();
      await git(fixture.path, 'remote', 'add', 'origin', remote);
      await git(fixture.path, 'config', 'push.default', pushDefault);
      await git(fixture.path, 'checkout', '-b', 'feature');
      const head = await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');

      await service.run(fixture.summary, { kind: 'publishBranch' });

      expect(await git(remote, 'rev-parse', 'feature')).toBe(head);
    }
  });

  it('ignores a configured remote push refspec when publishing', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-refspec-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(fixture.path, 'config', 'remote.origin.push', 'refs/heads/other:refs/heads/other');
    await git(fixture.path, 'checkout', '-b', 'feature');
    const head = await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(fixture.summary, { kind: 'publishBranch' });

    expect(await git(remote, 'rev-parse', 'feature')).toBe(head);
    await expect(git(remote, 'show-ref', '--verify', 'refs/heads/other')).rejects.toBeDefined();
  });

  it('materializes the remote tracking ref when the fetch refspec does not cover the branch', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-narrow-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    // A `git clone --single-branch` remote keeps one entry in remote.origin.fetch, so pushing any
    // other branch records the upstream configuration without creating a tracking ref.
    await git(
      fixture.path,
      'config',
      'remote.origin.fetch',
      '+refs/heads/main:refs/remotes/origin/main',
    );
    await git(fixture.path, 'checkout', '-b', 'feature');
    const head = await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(fixture.summary, { kind: 'publishBranch' });

    expect(await git(remote, 'rev-parse', 'feature')).toBe(head);
    expect(await git(fixture.path, 'rev-parse', 'refs/remotes/origin/feature')).toBe(head);
  });

  it('keeps the publish successful when the tracking ref cannot be materialized', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-publish-fetchfailure-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    await git(
      fixture.path,
      'config',
      'remote.origin.fetch',
      '+refs/heads/main:refs/remotes/origin/main',
    );
    await git(fixture.path, 'checkout', '-b', 'feature');
    const head = await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    const realRunner = new RealGitRunner();
    const runner = {
      async run(args: readonly string[], options: GitRunOptions) {
        if (args[0] === 'fetch') throw new Error('fetch is unavailable');
        return realRunner.run(args, options);
      },
    } as unknown as GitRunner;
    const service = new GitOperationService(runner);

    await expect(service.run(fixture.summary, { kind: 'publishBranch' })).resolves.toMatchObject({
      message: 'publishBranch completed.',
    });
    expect(await git(remote, 'rev-parse', 'feature')).toBe(head);
  });

  it('refuses to build arguments for a batch deletion that was not expanded', async () => {
    const { buildOperationArguments } = await import('../../src/git/GitOperationService');

    expect(() =>
      buildOperationArguments({
        kind: 'deleteBranches',
        branches: [{ name: 'feature/login', force: false }],
      }),
    ).toThrow(/expanded/u);
  });

  it('describes a batch branch deletion confirmation with the count and unmerged branches', async () => {
    const { getOperationConfirmation } = await import('../../src/git/GitOperationService');

    const confirmation = getOperationConfirmation(repository, {
      kind: 'deleteBranches',
      branches: [
        { name: 'feature/gone', force: true },
        { name: 'feature/merged', force: false },
      ],
    });

    expect(confirmation).toMatchObject({ destructive: true, confirmLabel: 'Delete 2 Branches' });
    expect(confirmation?.title).toContain('2');
    expect(confirmation?.detail).toContain('project');
    expect(confirmation?.detail).toContain('feature/gone (not merged)');
    expect(confirmation?.detail).toContain('feature/merged');
    expect(confirmation?.detail).toContain('1 of them are not merged');
  });

  it('deletes the merged branches of a batch and reports the unmerged ones that failed', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-batch-');
    // Merged into main: `-d` succeeds.
    await git(fixture.path, 'branch', 'merged-branch', 'main');
    // Not merged into main: `-d` must fail, `-D` must succeed.
    await git(fixture.path, 'checkout', '-b', 'unmerged-branch');
    await commitFile(fixture.path, 'feature.txt', 'feature\n', 'feature work');
    await git(fixture.path, 'checkout', 'main');

    const service = new GitOperationService(new RealGitRunner());
    const confirm = vi.fn(() => Promise.resolve(true));

    const failed = await service.run(
      fixture.summary,
      {
        kind: 'deleteBranches',
        branches: [
          { name: 'merged-branch', force: false },
          { name: 'unmerged-branch', force: false },
        ],
      },
      { confirm },
    );

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(failed.message).toContain('Deleted 1 of 2 branches');
    expect(failed.message).toContain('unmerged-branch');
    expect(failed.deletedRefs).toEqual(['refs/heads/merged-branch']);
    expect(await git(fixture.path, 'branch', '--list', 'merged-branch')).toBe('');
    expect(await git(fixture.path, 'branch', '--list', 'unmerged-branch')).toContain(
      'unmerged-branch',
    );

    const forced = await service.run(
      fixture.summary,
      {
        kind: 'deleteBranches',
        branches: [{ name: 'unmerged-branch', force: true }],
      },
      { confirm: () => Promise.resolve(true) },
    );

    expect(forced.message).toBe('Deleted 1 branch.');
    expect(forced.deletedRefs).toEqual(['refs/heads/unmerged-branch']);
    expect(await git(fixture.path, 'branch', '--list', 'unmerged-branch')).toBe('');
  });

  it('aborts the whole batch when the confirmation is declined', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-operation-batch-cancel-');
    await git(fixture.path, 'branch', 'merged-branch', 'main');
    const service = new GitOperationService(new RealGitRunner());

    const result = await service.run(
      fixture.summary,
      { kind: 'deleteBranches', branches: [{ name: 'merged-branch', force: false }] },
      { confirm: () => Promise.resolve(false) },
    );

    expect(result).toEqual({ message: '', cancelled: true });
    expect(await git(fixture.path, 'branch', '--list', 'merged-branch')).toContain(
      'merged-branch',
    );
  });

  it('unshallows a single-branch shallow clone and extends its fetch refspec so other branches appear', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const source = await createFixtureRepository('git-shallow-src-');
    await commitFile(source.path, 'a.txt', 'a\n', 'second commit');
    await commitFile(source.path, 'b.txt', 'b\n', 'third commit');
    await git(source.path, 'branch', 'other');

    const cloneDir = await mkdtemp(join(tmpdir(), 'git-shallow-clone-'));
    temporaryDirectories.push(cloneDir);
    const clonePath = join(cloneDir, 'clone');
    // Build a shallow, single-branch clone deterministically (a local-path `git clone --depth 1`
    // can bypass shallow via git's local optimization). A `fetch --depth 1` always marks shallow.
    await git(cloneDir, 'init', '-b', 'main', clonePath);
    await git(clonePath, 'config', 'user.name', 'Clone Test');
    await git(clonePath, 'config', 'user.email', 'clone@example.com');
    await git(clonePath, 'remote', 'add', 'origin', source.path);
    await git(
      clonePath,
      'config',
      'remote.origin.fetch',
      '+refs/heads/main:refs/remotes/origin/main',
    );
    await git(clonePath, 'fetch', '--depth', '1', 'origin', 'main');
    await git(clonePath, 'reset', '--hard', 'origin/main');
    const cloneSummary: RepositorySummary = {
      id: clonePath,
      rootUri: pathToFileURL(clonePath).toString(),
      gitDirUri: pathToFileURL(join(clonePath, '.git')).toString(),
      displayName: 'clone',
      isBare: false,
      currentBranch: 'main',
    };
    expect(await git(clonePath, 'rev-parse', '--is-shallow-repository')).toBe('true');
    expect(await git(clonePath, 'rev-list', '--count', 'HEAD')).toBe('1');
    expect(await git(clonePath, 'config', '--get', 'remote.origin.fetch')).toContain(
      'refs/heads/main',
    );

    const service = new GitOperationService(new RealGitRunner());
    await service.run(cloneSummary, { kind: 'fetchFullHistory' }, { confirm: () => Promise.resolve(true) });

    expect(await git(clonePath, 'rev-parse', '--is-shallow-repository')).toBe('false');
    expect(Number(await git(clonePath, 'rev-list', '--count', 'HEAD'))).toBeGreaterThan(1);
    expect(await git(clonePath, 'config', '--get', 'remote.origin.fetch')).toBe(
      '+refs/heads/*:refs/remotes/origin/*',
    );
    await expect(
      git(clonePath, 'show-ref', '--verify', 'refs/remotes/origin/other'),
    ).resolves.toBeDefined();
  });

  it('requires confirmation before fetching the full history', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-unshallow-confirm-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    const service = new GitOperationService(new RealGitRunner());

    await expect(
      service.run(fixture.summary, { kind: 'fetchFullHistory' }),
    ).rejects.toThrow(/requires confirmation/u);
  });

  it('refuses to fetch the full history when no remote is configured', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-unshallow-noremote-');
    const service = new GitOperationService(new RealGitRunner());

    await expect(
      service.run(
        fixture.summary,
        { kind: 'fetchFullHistory' },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow(/single remote/u);
  });

  it('builds an unshallow fetch command only after the remote is resolved', async () => {
    const { buildOperationArguments } = await import('../../src/git/GitOperationService');
    expect(buildOperationArguments({ kind: 'fetchFullHistory', remote: 'origin' })).toEqual([
      'fetch',
      '--unshallow',
      'origin',
    ]);
    expect(() => buildOperationArguments({ kind: 'fetchFullHistory' })).toThrow(
      /resolved before execution/u,
    );
  });

  it('lists the planned fetch-refspec change verbatim in the confirmation', () => {
    const confirmation = getOperationConfirmation(repository, {
      kind: 'fetchFullHistory',
      remote: 'origin',
      refspecFrom: '+refs/heads/main:refs/remotes/origin/main',
      refspecTo: '+refs/heads/*:refs/remotes/origin/*',
    });
    expect(confirmation?.destructive).toBe(true);
    expect(confirmation?.detail).toContain('+refs/heads/*:refs/remotes/origin/*');
    expect(confirmation?.detail).toContain('+refs/heads/main:refs/remotes/origin/main');
  });

  it('creates an orphan branch, removing tracked files while keeping untracked ones', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-orphan-');
    await writeFile(join(fixture.path, 'untracked.txt'), 'keep\n');
    const service = new GitOperationService(new RealGitRunner());

    await service.run(
      fixture.summary,
      { kind: 'createOrphanBranch', name: 'website' },
      { confirm: () => Promise.resolve(true) },
    );

    expect(await git(fixture.path, 'symbolic-ref', '--short', 'HEAD')).toBe('website');
    // Tracked base.txt is gone from the working tree; the untracked file survives.
    await expect(stat(join(fixture.path, 'base.txt'))).rejects.toThrow();
    expect((await stat(join(fixture.path, 'untracked.txt'))).isFile()).toBe(true);
    // The branch has no ref until its first commit.
    expect(await git(fixture.path, 'for-each-ref', 'refs/heads/website')).toBe('');
    await commitFile(fixture.path, 'page.html', '<html></html>\n', 'first orphan commit');
    const parents = (await git(fixture.path, 'rev-list', '--parents', '-1', 'HEAD')).trim();
    expect(parents.split(/\s+/u)).toHaveLength(1);
  });

  it('refuses to create an orphan branch whose name already exists', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-orphan-dup-');
    const service = new GitOperationService(new RealGitRunner());

    await expect(
      service.run(
        fixture.summary,
        { kind: 'createOrphanBranch', name: 'main' },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow();
    expect(await git(fixture.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
  });

  it('refuses to create an orphan branch while another operation is in progress', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-orphan-busy-');
    const busy: RepositorySummary = {
      ...fixture.summary,
      currentBranch: 'main',
      operationState: 'rebase',
    };
    const service = new GitOperationService(new RealGitRunner(), passthroughInspection);

    await expect(
      service.run(
        busy,
        { kind: 'createOrphanBranch', name: 'website' },
        { confirm: () => Promise.resolve(true) },
      ),
    ).rejects.toThrow(/in progress/u);
  });

  it('names the current and target branch in the orphan confirmation', () => {
    const confirmation = getOperationConfirmation(
      { ...repository, currentBranch: 'main' },
      { kind: 'createOrphanBranch', name: 'website' },
    );
    expect(confirmation?.destructive).toBe(true);
    expect(confirmation?.title).toContain('website');
    expect(confirmation?.detail).toContain('main');
    expect(confirmation?.detail).toMatch(/untracked/iu);
  });

  it('deletes local branches, tags, and remote branches together, reporting per-item failures', async () => {
    const { GitOperationService } = await import('../../src/git/GitOperationService');
    const fixture = await createFixtureRepository('git-deleteref-');
    const remote = await createBareRemote();
    await git(fixture.path, 'remote', 'add', 'origin', remote);
    // Merged local branch sits at the main tip; an unmerged one diverges ahead.
    await git(fixture.path, 'branch', 'done');
    await git(fixture.path, 'checkout', '-b', 'dirty');
    await commitFile(fixture.path, 'x.txt', 'x\n', 'unmerged work');
    await git(fixture.path, 'checkout', 'main');
    await git(fixture.path, 'tag', 'tag-x');
    await git(fixture.path, 'push', 'origin', 'done:to-deploy');

    const service = new GitOperationService(new RealGitRunner());
    const result = await service.run(
      fixture.summary,
      {
        kind: 'deleteRefs',
        local: [
          { name: 'done', force: false },
          { name: 'dirty', force: false },
        ],
        remote: [{ remote: 'origin', branch: 'to-deploy' }],
        tags: ['tag-x'],
      },
      { confirm: () => Promise.resolve(true) },
    );

    expect(result.deletedRefs).toEqual(
      expect.arrayContaining([
        'refs/heads/done',
        'refs/tags/tag-x',
        'refs/remotes/origin/to-deploy',
      ]),
    );
    expect(result.deletedRefs).not.toContain('refs/heads/dirty');
    expect(result.message).toContain('Deleted 3 of 4');
    expect(result.message).toContain('dirty');
    // Verified against git: merged branch and tag gone, unmerged branch kept, remote branch deleted.
    expect(await git(fixture.path, 'branch', '--list', 'done')).toBe('');
    expect(await git(fixture.path, 'tag', '--list', 'tag-x')).toBe('');
    expect(await git(fixture.path, 'branch', '--list', 'dirty')).toContain('dirty');
    await expect(git(remote, 'show-ref', '--verify', 'refs/heads/to-deploy')).rejects.toBeDefined();
  });
});
