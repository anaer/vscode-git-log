import { describe, expect, it } from 'vitest';
import { buildGitDiagnosticsReport } from '../../src/git/gitDiagnostics';

describe('buildGitDiagnosticsReport', () => {
  it('reports versions, capabilities, repositories, and redacts credentials', () => {
    const report = buildGitDiagnosticsReport({
      extensionVersion: '26.1105.1127',
      vscodeVersion: '1.85.2',
      platform: 'win32',
      arch: 'x64',
      gitPath: 'git',
      gitVersion: '2.20.0',
      capabilities: { version: '2.20.0', createOrphanBranch: false },
      gitVersionError: 'fatal: unable to access https://alice:secret@example.com/repo.git',
      workspaceRoots: ['C:/work/repo'],
      scanDepth: 2,
      initialPageSize: 200,
      pageSize: 500,
      repositories: [
        {
          id: 'repo-1',
          rootUri: 'file:///C:/work/repo',
          gitDirUri: 'file:///C:/work/repo/.git',
          displayName: 'repo',
          isBare: false,
          currentBranch: 'main',
          head: 'a'.repeat(40),
          operationState: 'merge',
          hasUnresolvedConflicts: true,
        },
      ],
    });

    expect(report).toContain('Detected git: 2.20.0');
    expect(report).toContain('createOrphanBranch=false');
    expect(report).toContain('branch: main');
    expect(report).toContain('operation: merge conflicts: true');
    expect(report).toContain('C:/work/repo');
    expect(report).not.toContain('secret');
    expect(report).toContain('https://***@example.com/repo.git');
  });

  it('handles missing git and empty workspaces', () => {
    const report = buildGitDiagnosticsReport({
      extensionVersion: '1.0.0',
      vscodeVersion: '1.85.2',
      platform: 'linux',
      arch: 'x64',
      gitPath: '/missing/git',
      gitVersionError: 'Git executable is unavailable.',
      workspaceRoots: [],
      scanDepth: 0,
      initialPageSize: 200,
      pageSize: 500,
      repositories: [],
    });
    expect(report).toContain('Detected git: unavailable');
    expect(report).toContain('Workspace roots (0): (none)');
    expect(report).toContain('(none discovered)');
  });
});
