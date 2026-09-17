interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export type WorktreeLineMappingResult =
  | {
      status: 'mapped';
      startLine: number;
      endLine: number;
      partiallyUncommitted: boolean;
    }
  | { status: 'uncommitted-only' }
  | { status: 'discontinuous' };

const HUNK_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;

function parseCount(value: string | undefined): number {
  return value === undefined ? 1 : Number.parseInt(value, 10);
}

function parseHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  for (const line of diff.split(/\r?\n/u)) {
    const match = HUNK_PATTERN.exec(line);
    if (!match) continue;
    hunks.push({
      oldStart: Number.parseInt(match[1] ?? '0', 10),
      oldCount: parseCount(match[2]),
      newStart: Number.parseInt(match[3] ?? '0', 10),
      newCount: parseCount(match[4]),
    });
  }
  return hunks;
}

export function mapWorktreeLineRange(
  diff: string | Buffer,
  startLine: number,
  endLine: number,
): WorktreeLineMappingResult {
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine) {
    throw new Error('Invalid worktree line range.');
  }
  const hunks = parseHunks(typeof diff === 'string' ? diff : diff.toString('utf8'));
  const mapped: number[] = [];
  let partiallyUncommitted = false;
  let delta = 0;
  let hunkIndex = 0;
  for (let line = startLine; line <= endLine; line += 1) {
    while (hunkIndex < hunks.length) {
      const hunk = hunks[hunkIndex]!;
      if (hunk.newCount === 0) {
        if (line > hunk.newStart) {
          delta += hunk.oldCount;
          hunkIndex += 1;
          continue;
        }
        break;
      }
      if (line > hunk.newStart + hunk.newCount - 1) {
        delta += hunk.oldCount - hunk.newCount;
        hunkIndex += 1;
        continue;
      }
      break;
    }
    const hunk = hunks[hunkIndex];
    if (hunk && hunk.newCount === 0 && line <= hunk.newStart) {
      mapped.push(line + delta);
      continue;
    }
    if (
      hunk &&
      hunk.newCount > 0 &&
      line >= hunk.newStart &&
      line < hunk.newStart + hunk.newCount
    ) {
      const relativeLine = line - hunk.newStart;
      if (relativeLine < hunk.oldCount) {
        mapped.push(hunk.oldStart + relativeLine);
      } else {
        partiallyUncommitted = true;
      }
      continue;
    }
    mapped.push(line + delta);
  }
  if (!mapped.length) return { status: 'uncommitted-only' };
  for (let index = 1; index < mapped.length; index += 1) {
    if (mapped[index] !== (mapped[index - 1] ?? 0) + 1) return { status: 'discontinuous' };
  }
  return {
    status: 'mapped',
    startLine: mapped[0] ?? startLine,
    endLine: mapped.at(-1) ?? endLine,
    partiallyUncommitted,
  };
}
