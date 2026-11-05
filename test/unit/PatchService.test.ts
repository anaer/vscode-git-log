import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { GitRunner } from '../../src/git/GitRunner';
import { MAX_PATCH_BYTES, PatchService, parsePatchNumstat } from '../../src/git/PatchService';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
}

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'git-log-patch-'));
  temporaryDirectories.push(root);
  await git(root, 'init', '-b', 'main');
  await git(root, 'config', 'user.name', 'Patch Test');
  await git(root, 'config', 'user.email', 'patch@example.com');
  await writeFile(join(root, 'app.txt'), 'one\n');
  await git(root, 'add', 'app.txt');
  await git(root, 'commit', '-m', 'first');
  return root;
}

describe('PatchService', () => {
  it('previews, checks, and applies a working-tree patch', async () => {
    const root = await createRepository();
    await writeFile(join(root, 'app.txt'), 'two\n');
    const patch = (
      await execFileAsync('git', ['diff', '--no-color'], {
        cwd: root,
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout;
    await git(root, 'checkout', '--', 'app.txt');

    const service = new PatchService(new GitRunner());
    const preview = await service.preview(root, Buffer.from(patch));
    expect(preview).toMatchObject({ filesChanged: 1, additions: 1, deletions: 1 });
    expect(preview.files[0]?.path).toBe('app.txt');

    await service.check(root, Buffer.from(patch));
    await service.apply(root, Buffer.from(patch));
    expect((await readFile(join(root, 'app.txt'), 'utf8')).replace(/\r\n/gu, '\n')).toBe('two\n');
  });

  it('exports a diff that can be checked as a patch', async () => {
    const root = await createRepository();
    const first = await git(root, 'rev-parse', 'HEAD');
    await writeFile(join(root, 'app.txt'), 'two\n');
    await git(root, 'add', 'app.txt');
    await git(root, 'commit', '-m', 'second');
    const second = await git(root, 'rev-parse', 'HEAD');

    const service = new PatchService(new GitRunner());
    const patch = await service.exportDiff(root, first, second, ['app.txt']);
    expect(patch).toContain('diff --git a/app.txt b/app.txt');
    expect(patch).toContain('+two');

    await git(root, 'checkout', first, '--', 'app.txt');
    await service.check(root, Buffer.from(patch));
  });

  it('rejects oversized patches before reading them into memory', async () => {
    const root = await createRepository();
    const path = join(root, 'huge.patch');
    await writeFile(path, Buffer.alloc(MAX_PATCH_BYTES + 1, 0x61));
    const service = new PatchService(new GitRunner());
    await expect(service.readPatch(path)).rejects.toThrow('larger than 10 MiB');
  });

  it('detects bare repositories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-log-patch-bare-'));
    temporaryDirectories.push(root);
    await git(root, 'init', '--bare');
    const service = new PatchService(new GitRunner());
    await expect(service.isBare(root)).resolves.toBe(true);
  });

  it('rejects patches that escape the repository through the path header', async () => {
    const root = await createRepository();
    const patch = Buffer.from(
      [
        'diff --git a/../outside.txt b/../outside.txt',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/../outside.txt',
        '@@ -0,0 +1 @@',
        '+escaped',
        '',
      ].join('\n'),
    );
    const service = new PatchService(new GitRunner());
    await expect(service.check(root, patch)).rejects.toThrow();
  });
});

describe('parsePatchNumstat', () => {
  it('separates text and binary entries', () => {
    expect(
      parsePatchNumstat(Buffer.from('3\t2\tsrc/app.ts\n-\t-\timage.png\n')),
    ).toMatchObject({
      filesChanged: 2,
      additions: 3,
      deletions: 2,
      binaryFiles: 1,
    });
  });
});
