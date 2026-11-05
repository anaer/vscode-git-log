import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Initializes a repository and points the unborn HEAD at `branch` without `git init -b` (Git 2.28+). */
export async function initRepository(cwd: string, branch = 'main'): Promise<void> {
  await execFileAsync('git', ['init'], { cwd });
  await execFileAsync('git', ['symbolic-ref', 'HEAD', `refs/heads/${branch}`], { cwd });
}

/** Initializes a repository at `path` (which may not exist yet) and points HEAD at `branch`. */
export async function initRepositoryAt(path: string, branch = 'main'): Promise<void> {
  await execFileAsync('git', ['init', path]);
  await execFileAsync('git', ['symbolic-ref', 'HEAD', `refs/heads/${branch}`], { cwd: path });
}

/** Reads the checked-out branch without `git branch --show-current` (Git 2.22+). */
export async function currentBranch(cwd: string): Promise<string> {
  return (await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd })).stdout.trim();
}
