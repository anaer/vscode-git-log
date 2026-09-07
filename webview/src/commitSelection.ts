export interface CommitSelection {
  hashes: string[];
  anchor: string | undefined;
}

export interface CommitSelectionResult {
  selection: CommitSelection;
  focusedHash: string;
}

export const emptyCommitSelection: CommitSelection = { hashes: [], anchor: undefined };

export function isContiguousSelection(
  hashes: readonly string[],
  commits: readonly { hash: string }[],
): boolean {
  if (hashes.length < 2) return false;
  const firstIndex = commits.findIndex((commit) => commit.hash === hashes[0]);
  if (firstIndex < 0) return false;
  return hashes.every(
    (hash, index) => commits[firstIndex + index]?.hash === hash,
  );
}

export function nextCommitSelection(
  current: CommitSelection,
  commits: readonly { hash: string }[],
  targetHash: string,
  options: { extend?: boolean; toggle?: boolean; selectedHash?: string } = {},
): CommitSelectionResult | undefined {
  if (options.toggle) {
    const next = new Set(current.hashes);
    if (next.has(targetHash)) {
      if (next.size === 1) return undefined;
      next.delete(targetHash);
      const hashes = commits.filter((commit) => next.has(commit.hash)).map((commit) => commit.hash);
      const focusedHash =
        options.selectedHash !== undefined && next.has(options.selectedHash)
          ? options.selectedHash
          : (hashes[0] ?? targetHash);
      return { selection: { hashes, anchor: focusedHash }, focusedHash };
    }
    next.add(targetHash);
    const hashes = commits.filter((commit) => next.has(commit.hash)).map((commit) => commit.hash);
    return { selection: { hashes, anchor: targetHash }, focusedHash: targetHash };
  }

  if (options.extend && current.anchor !== undefined) {
    const anchorIndex = commits.findIndex((commit) => commit.hash === current.anchor);
    const targetIndex = commits.findIndex((commit) => commit.hash === targetHash);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      return {
        selection: {
          hashes: commits.slice(start, end + 1).map((commit) => commit.hash),
          anchor: current.anchor,
        },
        focusedHash: targetHash,
      };
    }
  }

  return { selection: { hashes: [targetHash], anchor: targetHash }, focusedHash: targetHash };
}
