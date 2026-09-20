import type { RefLabel } from './models';

/**
 * Pre-indexes refs by target so per-commit lookup is O(1) instead of O(refs).
 */
export function indexRefsByTarget(refs: readonly RefLabel[]): Map<string, RefLabel[]> {
  const indexed = new Map<string, RefLabel[]>();
  for (const ref of refs) {
    // Read `target` once per ref: it may be a lazily resolved getter, and reading it
    // twice both doubles the cost and risks an inconsistent key.
    const target = ref.target;
    const matching = indexed.get(target) ?? [];
    matching.push(ref);
    indexed.set(target, matching);
  }
  return indexed;
}

/**
 * Returns a copy of `subject` with its hash's refs attached.
 */
export function attachRefs<T extends { hash: string }>(
  subject: T,
  refsByTarget: ReadonlyMap<string, readonly RefLabel[]>,
): T {
  return { ...subject, refs: refsByTarget.get(subject.hash) ?? [] };
}