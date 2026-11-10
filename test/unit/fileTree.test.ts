import { describe, expect, it } from 'vitest';
import type { ChangedFile } from '../../src/shared/models';
import { buildFileTree, type FileTreeNode } from '../../webview/src/buildFileTree';

describe('buildFileTree', () => {
  it('groups changed files by directory while retaining the full file records', async () => {
    const modulePath = '../../webview/src/buildFileTree';
    const treeModule = await import(/* @vite-ignore */ modulePath).catch(() => undefined);
    expect(treeModule, 'the changed-file tree builder must exist').toBeDefined();
    if (!treeModule) return;

    const files: ChangedFile[] = [
      { status: 'M', path: 'src/app.ts', binary: false },
      { status: 'A', path: 'src/utils/format.ts', binary: false },
      { status: 'M', path: 'README.md', binary: false },
    ];

    expect(treeModule.buildFileTree(files)).toEqual([
      {
        type: 'directory',
        name: 'src',
        path: 'src',
        children: [
          { type: 'file', name: 'app.ts', path: 'src/app.ts', file: files[0] },
          {
            type: 'directory',
            name: 'utils',
            path: 'src/utils',
            children: [
              {
                type: 'file',
                name: 'format.ts',
                path: 'src/utils/format.ts',
                file: files[1],
              },
            ],
          },
        ],
      },
      { type: 'file', name: 'README.md', path: 'README.md', file: files[2] },
    ]);
  });
});

describe('buildFileTree single-child directory chains', () => {
  const changedFile = (path: string): ChangedFile => ({ status: 'M', path, binary: false });
  const leaf = (path: string): FileTreeNode => ({
    type: 'file',
    name: path.split('/').at(-1) ?? path,
    path,
    file: changedFile(path),
  });

  it('keeps root-level files outside any directory', () => {
    const files = [changedFile('README.md')];
    expect(buildFileTree(files)).toEqual([leaf('README.md')]);
  });

  it('merges a single-child chain and uses the chain tail as the fold key', () => {
    const files = [changedFile('src/main/java/com/Foo.java')];
    expect(buildFileTree(files)).toEqual([
      {
        type: 'directory',
        name: 'src / main / java / com',
        path: 'src/main/java/com',
        children: [leaf('src/main/java/com/Foo.java')],
      },
    ]);
  });

  it('stops at a file child without folding the file name into the directory row', () => {
    const files = [changedFile('src/main/Foo.java')];
    expect(buildFileTree(files)).toEqual([
      {
        type: 'directory',
        name: 'src / main',
        path: 'src/main',
        children: [leaf('src/main/Foo.java')],
      },
    ]);
  });

  it('stops the chain where a directory branches', () => {
    const files = [
      changedFile('src/main/java/com/A.java'),
      changedFile('src/main/java/Bar.java'),
    ];
    expect(buildFileTree(files)).toEqual([
      {
        type: 'directory',
        name: 'src / main / java',
        path: 'src/main/java',
        children: [
          {
            type: 'directory',
            name: 'com',
            path: 'src/main/java/com',
            children: [leaf('src/main/java/com/A.java')],
          },
          leaf('src/main/java/Bar.java'),
        ],
      },
    ]);
  });

  it('compresses sibling top-level chains independently', () => {
    const files = [changedFile('src/a/Foo.java'), changedFile('docs/b/Bar.md')];
    expect(buildFileTree(files)).toEqual([
      {
        type: 'directory',
        name: 'src / a',
        path: 'src/a',
        children: [leaf('src/a/Foo.java')],
      },
      {
        type: 'directory',
        name: 'docs / b',
        path: 'docs/b',
        children: [leaf('docs/b/Bar.md')],
      },
    ]);
  });
});
