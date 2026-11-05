import { basename, dirname } from 'node:path';
import * as vscode from 'vscode';
import type { GitRunner } from '../git/GitRunner';

export async function resolveRepositoryRoot(
  runner: GitRunner,
  placeHolder: string,
): Promise<string | undefined> {
  let candidate: string | undefined;
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === 'file') {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    candidate = folder?.uri.fsPath ?? dirname(editor.document.uri.fsPath);
  }
  if (!candidate) {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 1) {
      candidate = folders[0]?.uri.fsPath;
    } else if (folders.length > 1) {
      const picked = await vscode.window.showQuickPick(
        folders.map((folder) => ({
          label: folder.name,
          description: folder.uri.fsPath,
          fsPath: folder.uri.fsPath,
        })),
        { placeHolder, matchOnDescription: true },
      );
      candidate = picked?.fsPath;
    }
  }
  if (!candidate) {
    void vscode.window.showErrorMessage('Open a workspace folder before running this command.');
    return undefined;
  }
  try {
    const result = await runner.run(['rev-parse', '--show-toplevel'], {
      cwd: candidate,
      timeoutMs: 10_000,
      maxStdoutBytes: 8192,
    });
    const root = result.stdout.toString('utf8').trim();
    if (!root) throw new Error('Git did not report a repository root.');
    return root;
  } catch {
    void vscode.window.showErrorMessage(`Not a Git repository: ${basename(candidate)}`);
    return undefined;
  }
}
