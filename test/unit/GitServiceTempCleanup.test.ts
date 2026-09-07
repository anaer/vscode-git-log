import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rm: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  rm: mocks.rm,
  readdir: mocks.readdir,
}));
vi.mock('node:os', () => ({
  tmpdir: () => '/fake/tmp',
}));

describe('GitService.cleanupStaleTemporaryDirectories', () => {
  it('removes stale git-log-* directories, skips non-matches, and tolerates per-entry failures', async () => {
    mocks.readdir.mockResolvedValue([
      { name: 'git-log-file-compare-a', isDirectory: () => true },
      { name: 'git-log-line-history-b', isDirectory: () => true },
      { name: 'git-log-notes.txt', isDirectory: () => false },
      { name: 'unrelated', isDirectory: () => true },
    ]);
    mocks.rm.mockRejectedValue(new Error('boom'));
    const { GitService } = await import('../../src/git/GitService');
    const service = new GitService({} as never);

    await service.cleanupStaleTemporaryDirectories();

    expect(mocks.rm).toHaveBeenCalledTimes(2);
    expect(mocks.rm).toHaveBeenCalledWith(
      expect.stringContaining('git-log-file-compare-a'),
      expect.objectContaining({ recursive: true, force: true }),
    );
    expect(mocks.rm).toHaveBeenCalledWith(
      expect.stringContaining('git-log-line-history-b'),
      expect.objectContaining({ recursive: true, force: true }),
    );
  });
});