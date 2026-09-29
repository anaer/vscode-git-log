import { describe, expect, it } from 'vitest';
import type { RefLabel } from '../../src/shared/models';
import {
  buildRefTree,
  collectRefFolderKeys,
  type RefTreeDirectory,
  type RefTreeNode,
} from '../../webview/src/buildRefTree';

const HASH = '0'.repeat(40);

function tagRef(shortName: string, pushedTo?: readonly string[]): RefLabel {
  return {
    fullName: `refs/tags/${shortName}`,
    shortName,
    kind: 'tag',
    target: HASH,
    ahead: 0,
    behind: 0,
    isCurrent: false,
    ...(pushedTo ? { pushedTo: [...pushedTo] } : {}),
  };
}

function findDirectory(
  nodes: readonly RefTreeNode[],
  name: string,
): RefTreeDirectory | undefined {
  return nodes.find(
    (node): node is RefTreeDirectory => node.type === 'directory' && node.name === name,
  );
}

function requireDirectory(nodes: readonly RefTreeNode[], name: string): RefTreeDirectory {
  const directory = findDirectory(nodes, name);
  if (!directory) throw new Error(`expected a "${name}" directory`);
  return directory;
}

function leafNames(nodes: readonly RefTreeNode[]): string[] {
  return nodes.filter((node) => node.type === 'ref').map((node) => node.name);
}

describe('buildRefTree', () => {
  it('lists every tag at the root and repeats pushed tags under their remote', () => {
    const tree = buildRefTree([tagRef('v1.0.0', ['origin']), tagRef('v0.9.0')]);

    expect(leafNames(tree)).toEqual(['v1.0.0', 'v0.9.0']);
    // Remote directories are listed before the flat tag list.
    expect(tree[0]?.type).toBe('directory');
    expect(tree.filter((node) => node.type === 'directory')).toHaveLength(1);
    expect(leafNames(requireDirectory(tree, 'origin').children)).toEqual(['v1.0.0']);
  });

  it('repeats a tag under every remote that advertises it', () => {
    const tree = buildRefTree([tagRef('v1.0.0', ['origin', 'upstream'])]);

    expect(leafNames(tree)).toEqual(['v1.0.0']);
    expect(leafNames(requireDirectory(tree, 'origin').children)).toEqual(['v1.0.0']);
    expect(leafNames(requireDirectory(tree, 'upstream').children)).toEqual(['v1.0.0']);
  });

  it('keeps a local-only tag at the root without a remote directory', () => {
    const tree = buildRefTree([tagRef('v0.9.0')]);

    expect(leafNames(tree)).toEqual(['v0.9.0']);
    expect(tree.some((node) => node.type === 'directory')).toBe(false);
  });

  it('nests slashed tag names at the root and under the remote directory', () => {
    const tree = buildRefTree([tagRef('release/1.0', ['origin'])]);

    expect(leafNames(requireDirectory(tree, 'release').children)).toEqual(['1.0']);
    const originRelease = requireDirectory(requireDirectory(tree, 'origin').children, 'release');
    expect(leafNames(originRelease.children)).toEqual(['1.0']);
  });

  it('still nests local branches by slash without adding a remote prefix', () => {
    const tree = buildRefTree([
      {
        fullName: 'refs/heads/feature/login',
        shortName: 'feature/login',
        kind: 'local',
        target: HASH,
        ahead: 0,
        behind: 0,
        isCurrent: false,
      },
    ]);

    expect(leafNames(requireDirectory(tree, 'feature').children)).toEqual(['login']);
  });

  it('collects folder keys matching the ones the pane records as collapsed', () => {
    const tree = buildRefTree([tagRef('release/1.0', ['origin'])]);

    expect(collectRefFolderKeys(tree, 'r:tag:').sort()).toEqual(
      [
        'r:tag:["origin"]',
        'r:tag:["release"]',
        'r:tag:["origin","release"]',
      ].sort(),
    );
  });
});
