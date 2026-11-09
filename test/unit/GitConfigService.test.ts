import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitConfigService } from '../../src/git/GitConfigService';
import { GitRunner } from '../../src/git/GitRunner';
import { initRepositoryAt } from './support/gitFixture';

interface Fixture {
  root: string;
  homeDir: string;
  repoDir: string;
  otherRepoDir: string;
  service: GitConfigService;
  runner: GitRunner;
  env: NodeJS.ProcessEnv;
}

const temporaryDirectories: string[] = [];

/** The prefix the service writes on this platform: `gitdir/i` is used for case-insensitive paths. */
const conditionPrefix = process.platform === 'win32' ? 'gitdir/i' : 'gitdir';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'git-log-config-'));
  temporaryDirectories.push(root);
  const homeDir = join(root, 'home');
  const repoDir = join(homeDir, 'repos', 'work');
  const otherRepoDir = join(homeDir, 'repos', 'personal');
  await mkdir(homeDir, { recursive: true });
  await mkdir(repoDir, { recursive: true });
  await mkdir(otherRepoDir, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: join(homeDir, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
  };
  delete env.GIT_CONFIG_GLOBAL;
  const runner = new GitRunner({ executable: 'git' });
  const service = new GitConfigService({
    runner,
    homeDir,
    platform: process.platform,
    env,
    now: () => new Date('2026-11-07T10:20:30.456Z'),
  });
  return { root, homeDir, repoDir, otherRepoDir, service, runner, env };
}

describe('GitConfigService', () => {
  it('writes an includeIf entry that applies the identity to repositories under the directory', async () => {
    const { homeDir, repoDir, service, runner, env } = await createFixture();
    await initRepositoryAt(repoDir);

    const plan = await service.planCreate({
      label: 'work',
      directory: repoDir,
      fields: { name: 'Work User', email: 'work@example.com', pullRebase: 'true' },
    });
    const { backupDirectory } = await service.apply(plan);

    expect(
      await readFile(join(homeDir, '.git-log', 'identities', 'work.inc'), 'utf8'),
    ).toBe(
      '[user]\n\tname = "Work User"\n\temail = "work@example.com"\n[pull]\n\trebase = true\n',
    );
    const globalConfig = await readFile(join(homeDir, '.gitconfig'), 'utf8');
    expect(globalConfig).toContain(`[includeIf "${conditionPrefix}:~/repos/work/"]`);
    // Git escapes backslashes inside quoted values, so compare against the unescaped text.
    expect(globalConfig.replaceAll('\\\\', '\\')).toContain(
      join(homeDir, '.git-log', 'identities', 'work.inc'),
    );

    const listed = await service.list();
    expect(listed.profiles).toHaveLength(1);
    expect(listed.profiles[0]).toMatchObject({
      label: 'work',
      condition: `${conditionPrefix}:~/repos/work/`,
      gitDir: '~/repos/work/',
      fields: { name: 'Work User', email: 'work@example.com', pullRebase: 'true' },
    });
    expect(listed.external).toEqual([]);

    const effective = await runner.run(['config', '--get', 'user.name'], { cwd: repoDir, env });
    expect(effective.stdout.toString('utf8').trim()).toBe('Work User');

    const verification = await service.verify(plan.profile);
    expect(verification?.values).toEqual({
      'user.name': 'Work User',
      'user.email': 'work@example.com',
    });
    expect(backupDirectory.startsWith(join(homeDir, '.git-log', 'backups'))).toBe(true);
  });

  it('resolves GIT_CONFIG_GLOBAL, the legacy file, and the XDG file in order', async () => {
    const { root, homeDir, service, runner, env } = await createFixture();

    expect(await service.resolveGlobalConfigPath()).toBe(join(homeDir, '.gitconfig'));

    const xdgPath = join(homeDir, '.config', 'git', 'config');
    await mkdir(join(homeDir, '.config', 'git'), { recursive: true });
    await writeFile(xdgPath, '[user]\n\tname = XDG User\n', 'utf8');
    expect(await service.resolveGlobalConfigPath()).toBe(xdgPath);

    await writeFile(join(homeDir, '.gitconfig'), '[user]\n\tname = Legacy User\n', 'utf8');
    expect(await service.resolveGlobalConfigPath()).toBe(join(homeDir, '.gitconfig'));

    const custom = join(root, 'custom-global');
    const customService = new GitConfigService({
      runner,
      homeDir,
      platform: process.platform,
      env: { ...env, GIT_CONFIG_GLOBAL: custom },
    });
    expect(await customService.resolveGlobalConfigPath()).toBe(custom);
  });

  it('keeps external includes read-only and only removes its own entry from a shared section', async () => {
    const { homeDir, repoDir, service, runner, env } = await createFixture();
    const externalPath = join(homeDir, 'shared.inc');
    await writeFile(externalPath, '[user]\n\tname = External User\n', 'utf8');
    await runner.run(
      ['config', '--global', '--add', 'includeIf.gitdir:~/repos/work/.path', externalPath],
      { cwd: homeDir, env },
    );

    const before = await service.list();
    expect(before.profiles).toEqual([]);
    expect(before.external).toEqual([
      { condition: 'gitdir:~/repos/work/', includePath: externalPath },
    ]);

    const plan = await service.planCreate({
      label: 'work',
      directory: repoDir,
      fields: { name: 'Work User' },
    });
    expect(plan.warnings.some((warning) => warning.includes('external'))).toBe(true);
    await service.apply(plan);

    const afterCreate = await service.list();
    expect(afterCreate.profiles).toHaveLength(1);
    expect(afterCreate.external).toHaveLength(1);

    await service.apply(await service.planDelete(afterCreate.profiles[0]!));

    const afterDelete = await service.list();
    expect(afterDelete.profiles).toEqual([]);
    expect(afterDelete.external).toEqual([
      { condition: 'gitdir:~/repos/work/', includePath: externalPath },
    ]);
  });

  it('renames and retargets a profile while removing stale entries and files', async () => {
    const { homeDir, repoDir, otherRepoDir, service, runner, env } = await createFixture();
    await initRepositoryAt(repoDir);
    await initRepositoryAt(otherRepoDir);

    await service.apply(
      await service.planCreate({
        label: 'work',
        directory: repoDir,
        fields: { name: 'Work User' },
      }),
    );
    const created = (await service.list()).profiles[0]!;

    const update = await service.planUpdate(created, {
      label: 'office',
      directory: otherRepoDir,
      fields: { name: 'Office User', email: 'office@example.com' },
    });
    expect(update.removeEntries).toHaveLength(1);
    expect(update.addEntries).toHaveLength(1);
    await service.apply(update);

    const after = await service.list();
    expect(after.profiles.map((profile) => profile.label)).toEqual(['office']);
    expect(after.profiles[0]?.gitDir).toBe('~/repos/personal/');
    expect(await exists(join(homeDir, '.git-log', 'identities', 'work.inc'))).toBe(false);
    const globalConfig = await readFile(join(homeDir, '.gitconfig'), 'utf8');
    expect(globalConfig).not.toContain('~/repos/work/');
    expect(globalConfig).toContain('~/repos/personal/');

    const officeName = await runner.run(['config', '--get', 'user.name'], {
      cwd: otherRepoDir,
      env,
    });
    expect(officeName.stdout.toString('utf8').trim()).toBe('Office User');
    const oldRepository = await runner.run(['config', '--get', 'user.name'], {
      cwd: repoDir,
      env,
    }).catch(() => undefined);
    expect(oldRepository?.stdout.toString('utf8').trim()).toBeUndefined();
  });

  it('updates fields in place without rewriting the include entry', async () => {
    const { repoDir, service } = await createFixture();
    await service.apply(
      await service.planCreate({
        label: 'work',
        directory: repoDir,
        fields: { name: 'Work User' },
      }),
    );
    const created = (await service.list()).profiles[0]!;

    const update = await service.planUpdate(created, {
      label: created.label,
      directory: created.directoryPath,
      fields: { name: 'Renamed User', email: 'renamed@example.com' },
    });

    expect(update.addEntries).toEqual([]);
    expect(update.removeEntries).toEqual([]);
    expect(update.removeFiles).toEqual([]);
  });

  it('backs up the global configuration and preserves unrelated settings on delete', async () => {
    const { homeDir, repoDir, service, runner, env } = await createFixture();
    await runner.run(['config', '--global', 'alias.co', 'checkout'], { cwd: homeDir, env });

    await service.apply(
      await service.planCreate({
        label: 'work',
        directory: repoDir,
        fields: { name: 'Work User' },
      }),
    );
    const created = (await service.list()).profiles[0]!;
    const result = await service.apply(await service.planDelete(created));

    const backups = await readdir(result.backupDirectory);
    const globalBackup = backups.find((file) => file.endsWith('.gitconfig'));
    const includeBackup = backups.find((file) => file.endsWith('work.inc'));
    expect(globalBackup).toBeDefined();
    expect(includeBackup).toBeDefined();
    expect(await readFile(join(result.backupDirectory, globalBackup!), 'utf8')).toContain(
      '[alias]',
    );
    expect(await readFile(join(result.backupDirectory, includeBackup!), 'utf8')).toContain(
      '[user]',
    );
    expect(await readFile(join(homeDir, '.gitconfig'), 'utf8')).toContain('alias');
    expect(await exists(join(homeDir, '.git-log', 'identities', 'work.inc'))).toBe(false);
  });

  it('removes managed entries that were written with a home-relative path', async () => {
    const { homeDir, service, runner, env } = await createFixture();
    const includePath = join(homeDir, '.git-log', 'identities', 'manual.inc');
    await mkdir(dirname(includePath), { recursive: true });
    await writeFile(includePath, '[user]\n\tname = Manual User\n', 'utf8');
    await runner.run(
      [
        'config',
        '--global',
        '--add',
        'includeIf.gitdir:~/manual/.path',
        '~/.git-log/identities/manual.inc',
      ],
      { cwd: homeDir, env },
    );

    const before = await service.list();
    expect(before.profiles).toHaveLength(1);
    expect(before.profiles[0]?.includePath).toBe(includePath);

    await service.apply(await service.planDelete(before.profiles[0]!));

    expect((await service.list()).profiles).toEqual([]);
    expect(await exists(includePath)).toBe(false);
  });

  it('warns about overlapping directories without blocking', async () => {
    const { homeDir, repoDir, service } = await createFixture();
    await service.apply(
      await service.planCreate({
        label: 'parent',
        directory: join(homeDir, 'repos'),
        fields: { name: 'Parent User' },
      }),
    );

    const plan = await service.planCreate({
      label: 'child',
      directory: repoDir,
      fields: { name: 'Child User' },
    });

    expect(plan.warnings.some((warning) => warning.includes('overlapping'))).toBe(true);
  });

  it('rejects unsafe names, relative directories, empty fields, and duplicate matches', async () => {
    const { repoDir, service } = await createFixture();

    await expect(
      service.planCreate({ label: '../escape', directory: repoDir, fields: { name: 'User' } }),
    ).rejects.toThrow('unsupported characters');
    await expect(
      service.planCreate({ label: 'work', directory: 'relative/path', fields: { name: 'User' } }),
    ).rejects.toThrow('absolute');
    await expect(
      service.planCreate({ label: 'work', directory: repoDir, fields: {} }),
    ).rejects.toThrow('at least one');

    await service.apply(
      await service.planCreate({
        label: 'work',
        directory: repoDir,
        fields: { name: 'Work User' },
      }),
    );
    await expect(
      service.planCreate({ label: 'other', directory: repoDir, fields: { name: 'Other User' } }),
    ).rejects.toThrow('already matches');
    await expect(
      service.planCreate({ label: 'work', directory: repoDir, fields: { name: 'Other User' } }),
    ).rejects.toThrow('already exists');
  });

  it('treats gitdir and gitdir/i conditions for the same directory as one match', async () => {
    const { homeDir, otherRepoDir, service, runner, env } = await createFixture();
    await initRepositoryAt(otherRepoDir);
    await service.apply(
      await service.planCreate({
        label: 'team',
        directory: otherRepoDir,
        fields: { name: 'Team User' },
      }),
    );
    const includePath = join(homeDir, '.git-log', 'identities', 'team.inc');
    // Rewrite the only entry for that directory into the other matching mode, so the
    // duplicate is detectable solely by the directory the condition addresses.
    const otherPrefix = conditionPrefix === 'gitdir' ? 'gitdir/i' : 'gitdir';
    await runner.run(
      ['config', '--global', '--unset-all', `includeIf.${conditionPrefix}:~/repos/personal/.path`],
      { cwd: homeDir, env },
    );
    await runner.run(
      ['config', '--global', '--add', `includeIf.${otherPrefix}:~/repos/personal/.path`, includePath],
      { cwd: homeDir, env },
    );

    const listed = await service.list();
    expect(listed.profiles.map((profile) => profile.condition)).toEqual([
      `${otherPrefix}:~/repos/personal/`,
    ]);
    await expect(
      service.planCreate({ label: 'work', directory: otherRepoDir, fields: { name: 'Work User' } }),
    ).rejects.toThrow('already matches');
    await expect(
      service.planCreate({ label: 'work', directory: join(homeDir, 'repos'), fields: { name: 'Work User' } }),
    ).resolves.toMatchObject({ warnings: [expect.stringContaining('overlapping')] });
  });

  it('keeps an included file while another condition still uses it', async () => {
    const { homeDir, repoDir, otherRepoDir, service, runner, env } = await createFixture();
    await initRepositoryAt(repoDir);
    await initRepositoryAt(otherRepoDir);
    await service.apply(
      await service.planCreate({
        label: 'work',
        directory: repoDir,
        fields: { name: 'Work User' },
      }),
    );
    const includePath = join(homeDir, '.git-log', 'identities', 'work.inc');
    await runner.run(
      ['config', '--global', '--add', `includeIf.${conditionPrefix}:~/repos/personal/.path`, includePath],
      { cwd: homeDir, env },
    );

    const profiles = (await service.list()).profiles;
    expect(profiles).toHaveLength(2);
    const target = profiles.find((profile) => profile.gitDir.includes('work'))!;

    const plan = await service.planDelete(target);
    expect(plan.removeFiles).toEqual([]);
    expect(plan.warnings.join(' ')).toContain('the same file');
    await service.apply(plan);

    expect(await exists(includePath)).toBe(true);
    const surviving = await service.list();
    expect(surviving.profiles).toHaveLength(1);
    const inOtherRepo = await runner.run(['config', '--get', 'user.name'], {
      cwd: otherRepoDir,
      env,
    });
    expect(inOtherRepo.stdout.toString('utf8').trim()).toBe('Work User');

    await service.apply(await service.planDelete(surviving.profiles[0]!));
    expect(await exists(includePath)).toBe(false);
  });

  it('keeps a renamed profile file when another condition includes it', async () => {
    const { homeDir, repoDir, otherRepoDir, service, runner, env } = await createFixture();
    await initRepositoryAt(repoDir);
    await initRepositoryAt(otherRepoDir);
    await service.apply(
      await service.planCreate({
        label: 'work',
        directory: repoDir,
        fields: { name: 'Work User' },
      }),
    );
    const includePath = join(homeDir, '.git-log', 'identities', 'work.inc');
    await runner.run(
      ['config', '--global', '--add', `includeIf.${conditionPrefix}:~/repos/personal/.path`, includePath],
      { cwd: homeDir, env },
    );

    const profiles = (await service.list()).profiles;
    const target = profiles.find((profile) => profile.gitDir.includes('work'))!;
    const plan = await service.planUpdate(target, {
      label: 'office',
      directory: otherRepoDir,
      fields: { name: 'Office User' },
    });

    expect(plan.removeFiles).toEqual([]);
    await service.apply(plan);
    expect(await exists(join(homeDir, '.git-log', 'identities', 'work.inc'))).toBe(true);
  });

  it('uses gitdir/i and forward slashes for Windows profiles', async () => {
    const { root, homeDir, runner } = await createFixture();
    const service = new GitConfigService({
      runner,
      homeDir,
      platform: 'win32',
      env: { ...process.env, GIT_CONFIG_GLOBAL: join(root, 'missing-global') },
    });

    const plan = await service.planCreate({
      label: 'work',
      directory: 'C:\\Users\\me\\work',
      fields: { name: 'Work User' },
    });

    expect(plan.profile.condition).toBe('gitdir/i:C:/Users/me/work/');
    expect(plan.profile.conditionType).toBe('gitdir/i');
    expect(plan.addEntries[0]?.includePath).toBe(
      join(homeDir, '.git-log', 'identities', 'work.inc'),
    );
  });
});
