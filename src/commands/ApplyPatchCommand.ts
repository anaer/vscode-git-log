import * as vscode from 'vscode';
import { toUserMessage } from '../git/classifyGitError';
import type { GitRunner } from '../git/GitRunner';
import type { PatchPreview, PatchService } from '../git/PatchService';
import { inspectRepository } from '../repositories/discoverRepositories';
import { resolveRepositoryRoot } from './resolveRepositoryRoot';

function describePreview(preview: PatchPreview): string {
  const listed = preview.files
    .slice(0, 8)
    .map((file) => file.path)
    .join('\n');
  const remaining = preview.files.length - 8;
  const binary = preview.binaryFiles > 0 ? `\n${String(preview.binaryFiles)} binary file(s)` : '';
  return [
    `${String(preview.filesChanged)} file(s): +${String(preview.additions)} / -${String(preview.deletions)}${binary}`,
    listed,
    remaining > 0 ? `… and ${String(remaining)} more` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export class ApplyPatchCommand {
  constructor(
    private readonly runner: GitRunner,
    private readonly patches: PatchService,
    private readonly output: vscode.OutputChannel,
  ) {}

  async run(repositoryRoot?: string): Promise<void> {
    const root =
      repositoryRoot ?? (await resolveRepositoryRoot(this.runner, 'Select a repository for the patch'));
    if (!root) return;
    const repository = await inspectRepository(root, this.runner);
    if (!repository) {
      void vscode.window.showErrorMessage('Git could not inspect the selected repository.');
      return;
    }
    if (repository.operationState) {
      void vscode.window.showErrorMessage(
        `A Git ${repository.operationState} is in progress; finish or abort it first.`,
      );
      return;
    }

    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Apply Patch',
      filters: { 'Patch files': ['patch', 'diff'], 'All files': ['*'] },
    });
    const file = picked?.[0];
    if (!file) return;

    let patch: Buffer;
    try {
      patch = await this.patches.readPatch(file.fsPath);
    } catch (error) {
      void vscode.window.showErrorMessage(toUserMessage(error));
      return;
    }

    try {
      if (await this.patches.isBare(root)) {
        void vscode.window.showErrorMessage('Patches cannot be applied to a bare repository.');
        return;
      }
      const preview = await this.patches.preview(root, patch);
      if (preview.filesChanged === 0) {
        void vscode.window.showErrorMessage('The selected patch contains no file changes.');
        return;
      }
      const detail = describePreview(preview);

      let checkError: unknown;
      try {
        await this.patches.check(root, patch);
      } catch (error) {
        checkError = error;
      }

      if (checkError) {
        const choice = await vscode.window.showWarningMessage(
          'Patch does not apply cleanly',
          {
            modal: true,
            detail: `${detail}\n\n${toUserMessage(checkError)}\n\nApply with 3-way merge? This writes to the index and can leave conflicts.`,
          },
          'Apply with 3-way Merge',
        );
        if (choice !== 'Apply with 3-way Merge') return;
        const conflicted = await this.patches.apply3Way(root, patch);
        this.output.appendLine(`[patch] ${conflicted ? '3-way applied with conflicts' : '3-way applied'}: ${file.fsPath}`);
        if (conflicted) {
          void vscode.window.showWarningMessage(
            'Patch applied with conflicts. Resolve them in Source Control.',
          );
        } else {
          void vscode.window.showInformationMessage('Patch applied.');
        }
        return;
      }

      const choice = await vscode.window.showWarningMessage(
        'Apply patch?',
        {
          modal: true,
          detail: `${detail}\n\nThis writes the selected changes to the working tree.`,
        },
        'Apply',
      );
      if (choice !== 'Apply') return;
      await this.patches.apply(root, patch);
      this.output.appendLine(`[patch] applied: ${file.fsPath}`);
      void vscode.window.showInformationMessage(
        `Applied ${String(preview.filesChanged)} file(s) from the patch.`,
      );
    } catch (error) {
      const message = toUserMessage(error);
      this.output.appendLine(`[patch] failed: ${message}`);
      void vscode.window.showErrorMessage(message);
    }
  }
}
