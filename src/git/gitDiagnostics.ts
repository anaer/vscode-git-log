import type { GitCapabilities, RepositorySummary } from '../shared/models';
import { redactGitDiagnostic } from './classifyGitError';

export interface GitDiagnosticsInput {
  extensionVersion: string;
  vscodeVersion: string;
  platform: string;
  arch: string;
  gitPath: string;
  gitVersion?: string;
  capabilities?: GitCapabilities;
  gitVersionError?: string;
  workspaceRoots: readonly string[];
  scanDepth: number;
  initialPageSize: number;
  pageSize: number;
  repositories: readonly RepositorySummary[];
}

export function buildGitDiagnosticsReport(input: GitDiagnosticsInput): string {
  const lines = [
    'Git Log diagnostics',
    `Extension: ${input.extensionVersion}`,
    `VS Code: ${input.vscodeVersion}`,
    `Platform: ${input.platform}-${input.arch}`,
    `Configured git path: ${input.gitPath}`,
    input.gitVersion ? `Detected git: ${input.gitVersion}` : 'Detected git: unavailable',
  ];
  if (input.gitVersionError) {
    lines.push(`Git version error: ${redactGitDiagnostic(input.gitVersionError)}`);
  }
  if (input.capabilities) {
    lines.push(
      `Capabilities: createOrphanBranch=${String(input.capabilities.createOrphanBranch)}`,
    );
  }
  lines.push(
    `Workspace roots (${String(input.workspaceRoots.length)}): ${
      input.workspaceRoots.length ? input.workspaceRoots.join(', ') : '(none)'
    }`,
    `Discovery: scanDepth=${String(input.scanDepth)} initialPageSize=${String(input.initialPageSize)} pageSize=${String(input.pageSize)}`,
    `Repositories (${String(input.repositories.length)}):`,
  );
  if (!input.repositories.length) {
    lines.push('  (none discovered)');
  }
  for (const repository of input.repositories) {
    lines.push(
      `  - ${repository.displayName}`,
      `    root: ${repository.rootUri}`,
      `    gitDir: ${repository.gitDirUri}`,
      ...(repository.commonGitDirUri ? [`    commonGitDir: ${repository.commonGitDirUri}`] : []),
      `    bare: ${String(repository.isBare)} shallow: ${String(repository.isShallow === true)}`,
      `    branch: ${repository.currentBranch ?? '(detached)'} HEAD: ${repository.head ?? '(none)'}`,
      `    operation: ${repository.operationState ?? 'none'} conflicts: ${String(
        repository.hasUnresolvedConflicts === true,
      )}`,
    );
  }
  lines.push('No credentials, user email, environment variables, or file contents are included.');
  return lines.join('\n');
}
