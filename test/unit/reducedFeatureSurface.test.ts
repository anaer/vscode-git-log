import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readWebviewSources(): Promise<string> {
  const files = [
    'webview/src/App.tsx',
    'webview/src/Toolbars.tsx',
    'webview/src/ContextMenu.tsx',
    'webview/src/Dialogs.tsx',
    'webview/src/RefsPane.tsx',
    'webview/src/FilesPane.tsx',
    'webview/src/DetailsPane.tsx',
    'webview/src/commitSelection.ts',
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return sources.join('\n');
}

describe('reduced feature surface', () => {
  it('keeps only stash management and Amend HEAD from the current feature work', async () => {
    const [app, protocol, packageJson] = await Promise.all([
      readWebviewSources(),
      readFile('src/protocol/messages.ts', 'utf8'),
      readFile('package.json', 'utf8'),
    ]);

    expect(app).toContain('Manage stashes');
    expect(app).toContain('Amend HEAD…');
    expect(protocol).toContain("kind: 'createStash'");
    expect(protocol).toContain("kind: 'amendCommit'");

    for (const removedUi of [
      'Compare revisions',
      'Incoming / Outgoing',
      'Interactive Rebase',
      'Create Fixup Commit',
      'Open Merge Editor',
    ]) {
      expect(app).not.toContain(removedUi);
    }

    for (const removedProtocol of [
      "kind: 'continueOperation'",
      "kind: 'fixupCommit'",
      "kind: 'interactiveRebase'",
      "type: 'openConflictFile'",
      "type: 'openRevisionComparison'",
      "type: 'requestBranchDivergence'",
    ]) {
      expect(protocol).not.toContain(removedProtocol);
    }

    expect(packageJson).not.toContain('gitLogWorkbench.editor.showBlame');
    for (const removedFile of [
      'src/editor/BlameEditor.ts',
      'src/editor/EditorBlameCommand.ts',
      'src/git/BlameService.ts',
    ]) {
      await expect(access(removedFile)).rejects.toBeDefined();
    }
  });
});
