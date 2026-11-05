import { execFileSync } from 'node:child_process';

const version = execFileSync('git', ['--version'], { encoding: 'utf8' }).trim();
const match = /git version (\d+)\.(\d+)/u.exec(version);
const major = Number(match?.[1] ?? 0);
const minor = Number(match?.[2] ?? 0);

export function gitAtLeast(requiredMajor: number, requiredMinor: number): boolean {
  return major > requiredMajor || (major === requiredMajor && minor >= requiredMinor);
}

export const supportsSwitchOrphan = gitAtLeast(2, 23);
