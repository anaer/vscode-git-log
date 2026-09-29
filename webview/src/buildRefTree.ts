import type { RefLabel } from '../../src/shared/models';

export interface RefTreeDirectory {
  type: 'directory';
  id: string;
  name: string;
  path: string;
  children: RefTreeNode[];
}

export interface RefTreeLeaf {
  type: 'ref';
  name: string;
  path: string;
  ref: RefLabel;
}

export type RefTreeNode = RefTreeDirectory | RefTreeLeaf;

/**
 * Collects the folder keys of every directory node, using the same
 * `<prefix><directory id>` format the refs pane uses for its collapsed-folder set.
 */
export function collectRefFolderKeys(nodes: readonly RefTreeNode[], prefix: string): string[] {
  const keys: string[] = [];
  for (const node of nodes) {
    if (node.type !== 'directory') continue;
    keys.push(`${prefix}${node.id}`);
    keys.push(...collectRefFolderKeys(node.children, prefix));
  }
  return keys;
}

export function buildRefTree(refs: readonly RefLabel[]): RefTreeNode[] {
  const root: RefTreeNode[] = [];
  const directories = new Map<string, RefTreeDirectory>();

  const insertLeaf = (directoryNames: readonly string[], leafName: string, ref: RefLabel): void => {
    let children = root;
    const directorySegments: string[] = [];
    for (const directoryName of directoryNames) {
      directorySegments.push(directoryName);
      const directoryId = JSON.stringify(directorySegments);
      const directoryPath = directorySegments.join('/');
      let directory = directories.get(directoryId);
      if (!directory) {
        directory = {
          type: 'directory',
          id: directoryId,
          name: directoryName,
          path: directoryPath,
          children: [],
        };
        directories.set(directoryId, directory);
        children.push(directory);
      }
      children = directory.children;
    }

    children.push({ type: 'ref', name: leafName, path: ref.shortName, ref });
  };

  const tagPaths = refs
    .filter((ref) => ref.kind === 'tag')
    .map((ref) => {
      const segments = ref.shortName.split('/').filter(Boolean);
      const name = segments.pop();
      return name ? { ref, segments, name } : undefined;
    })
    .filter((entry): entry is { ref: RefLabel; segments: string[]; name: string } => Boolean(entry));

  if (tagPaths.length === refs.length) {
    // Tags are always listed flat at the root, and a tag advertised by a remote is also
    // repeated under that remote's directory (mirroring the Remote group's `origin/…`
    // layout). The remote directories are inserted first so they sit above the flat list.
    for (const { ref, segments, name } of tagPaths) {
      for (const remote of ref.pushedTo ?? []) {
        insertLeaf([remote, ...segments], name, ref);
      }
    }
    for (const { ref, segments, name } of tagPaths) {
      insertLeaf(segments, name, ref);
    }
    return root;
  }

  for (const ref of refs) {
    const remoteName = ref.kind === 'remote' ? ref.remote : undefined;
    const remoteBranchPrefix = remoteName ? `${remoteName}/` : undefined;
    const branchName =
      remoteBranchPrefix && ref.shortName.startsWith(remoteBranchPrefix)
        ? ref.shortName.slice(remoteBranchPrefix.length)
        : ref.shortName;
    const parts = remoteName
      ? [remoteName, ...branchName.split('/').filter(Boolean)]
      : branchName.split('/').filter(Boolean);
    const refName = parts.pop();
    if (!refName) continue;

    insertLeaf(parts, refName, ref);
  }

  return root;
}
