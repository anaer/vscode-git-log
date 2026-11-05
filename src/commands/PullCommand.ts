import * as vscode from 'vscode';
import { classifyGitError, toUserMessage } from '../git/classifyGitError';
import type { GitOperationService } from '../git/GitOperationService';
import { GitCommandError, type GitRunner } from '../git/GitRunner';
import type { PullStrategy } from '../protocol/messages';
import { inspectRepository } from '../repositories/discoverRepositories';
import { resolveRepositoryRoot } from './resolveRepositoryRoot';

export class PullCommand {
  constructor(
    private readonly runner: GitRunner,
    private readonly operations: Pick<GitOperationService, 'run'>,
    private readonly output: vscode.OutputChannel,
  ) {}

  async run(strategy: PullStrategy): Promise<void> {
    const root = await resolveRepositoryRoot(this.runner, 'Select a repository to pull');
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
    try {
      const result = await this.operations.run(repository, { kind: 'pull', strategy });
      this.output.appendLine(`[pull] ${strategy}: ${result.message}`);
      void vscode.window.showInformationMessage(result.message || 'Pull completed.');
    } catch (error) {
      const message =
        error instanceof GitCommandError
          ? (() => {
              const classified = classifyGitError(error);
              return classified.nextStep
                ? `${classified.message} → ${classified.nextStep}`
                : classified.message;
            })()
          : toUserMessage(error);
      this.output.appendLine(`[pull] failed: ${message}`);
      void vscode.window.showErrorMessage(message);
    }
  }
}
