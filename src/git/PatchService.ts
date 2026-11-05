import { readFile, stat } from 'node:fs/promises';
import { GitCommandError, type GitRunner } from './GitRunner';

export const MAX_PATCH_BYTES = 10 * 1024 * 1024;

export interface PatchFilePreview {
  path: string;
  additions: number | undefined;
  deletions: number | undefined;
  binary: boolean;
}

export interface PatchPreview {
  files: PatchFilePreview[];
  filesChanged: number;
  additions: number;
  deletions: number;
  binaryFiles: number;
}

function parseCount(value: string): number | undefined {
  return value === '-' ? undefined : Number.parseInt(value, 10);
}

export function parsePatchNumstat(stdout: Buffer): PatchPreview {
  const files: PatchFilePreview[] = [];
  for (const line of stdout.toString('utf8').split(/\r?\n/u)) {
    if (!line) continue;
    const firstTab = line.indexOf('\t');
    const secondTab = firstTab < 0 ? -1 : line.indexOf('\t', firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;
    const additions = parseCount(line.slice(0, firstTab));
    const deletions = parseCount(line.slice(firstTab + 1, secondTab));
    files.push({
      path: line.slice(secondTab + 1),
      additions,
      deletions,
      binary: additions === undefined && deletions === undefined,
    });
  }
  return {
    files,
    filesChanged: files.length,
    additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
    deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
    binaryFiles: files.filter((file) => file.binary).length,
  };
}

function validateRevision(value: string): string {
  if (!/^[0-9a-f]{4,64}$/iu.test(value)) throw new Error('Invalid commit revision for patch export.');
  return value;
}

export class PatchService {
  constructor(private readonly runner: GitRunner) {}

  async readPatch(path: string): Promise<Buffer> {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('The selected path is not a file.');
    if (info.size > MAX_PATCH_BYTES) {
      throw new Error('The patch is larger than 10 MiB.');
    }
    const contents = await readFile(path);
    if (contents.length > MAX_PATCH_BYTES) {
      throw new Error('The patch is larger than 10 MiB.');
    }
    return contents;
  }

  async isBare(cwd: string): Promise<boolean> {
    const result = await this.runner.run(['rev-parse', '--is-bare-repository'], {
      cwd,
      timeoutMs: 10_000,
      maxStdoutBytes: 32,
    });
    return result.stdout.toString('utf8').trim() === 'true';
  }

  async preview(cwd: string, patch: Buffer, signal?: AbortSignal): Promise<PatchPreview> {
    const result = await this.runner.run(['apply', '--numstat', '-'], {
      cwd,
      input: patch,
      timeoutMs: 60_000,
      maxStdoutBytes: 4 * 1024 * 1024,
      ...(signal ? { signal } : {}),
    });
    return parsePatchNumstat(result.stdout);
  }

  async check(cwd: string, patch: Buffer, signal?: AbortSignal): Promise<void> {
    await this.runner.run(['apply', '--check', '-'], {
      cwd,
      input: patch,
      timeoutMs: 60_000,
      maxStdoutBytes: 1024 * 1024,
      ...(signal ? { signal } : {}),
    });
  }

  async apply(cwd: string, patch: Buffer, signal?: AbortSignal): Promise<void> {
    await this.runner.run(['apply', '-'], {
      cwd,
      input: patch,
      timeoutMs: 60_000,
      maxStdoutBytes: 1024 * 1024,
      ...(signal ? { signal } : {}),
    });
  }

  /** Returns true when the 3-way fallback left conflicts behind. */
  async apply3Way(cwd: string, patch: Buffer, signal?: AbortSignal): Promise<boolean> {
    try {
      await this.runner.run(['apply', '--3way', '-'], {
        cwd,
        input: patch,
        timeoutMs: 60_000,
        maxStdoutBytes: 1024 * 1024,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (!(error instanceof GitCommandError) || error.cancelled) throw error;
      if (!(await this.hasUnmergedPaths(cwd))) throw error;
      return true;
    }
    return this.hasUnmergedPaths(cwd);
  }

  async hasUnmergedPaths(cwd: string): Promise<boolean> {
    const result = await this.runner.run(['ls-files', '--unmerged', '-z'], {
      cwd,
      timeoutMs: 30_000,
      maxStdoutBytes: 1024 * 1024,
    });
    return result.stdout.length > 0;
  }

  async exportDiff(
    cwd: string,
    base: string,
    target: string,
    paths: readonly string[],
  ): Promise<string> {
    const uniquePaths = [...new Set(paths)].filter(Boolean);
    if (!uniquePaths.length) return '';
    const result = await this.runner.run(
      [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--full-index',
        validateRevision(base),
        validateRevision(target),
        '--',
        ...uniquePaths,
      ],
      {
        cwd,
        timeoutMs: 60_000,
        maxStdoutBytes: 32 * 1024 * 1024,
      },
    );
    return result.stdout.toString('utf8');
  }
}
