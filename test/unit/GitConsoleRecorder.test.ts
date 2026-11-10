import { describe, expect, it } from 'vitest';
import {
  CONSOLE_STDERR_DISPLAY_CHARACTERS,
  CONSOLE_STDERR_HEAD_BYTES,
  formatGitConsoleEntry,
  formatGitConsoleSnapshot,
  GitConsoleRecorder,
} from '../../src/git/GitConsoleRecorder';
import type { GitCommandRecord } from '../../src/git/GitRunner';

const cwd = '/home/user/repository';

function commandRecord(overrides: Partial<GitCommandRecord> = {}): GitCommandRecord {
  return {
    args: ['log', '-Sprivate-search-term'],
    cwd,
    durationMs: 12.34,
    exitCode: 0,
    stderr: Buffer.alloc(0),
    cancelled: false,
    timedOut: false,
    startFailed: false,
    ...overrides,
  };
}

describe('GitConsoleRecorder', () => {
  it('retains only the newest commands within the configured capacity', () => {
    const recorder = new GitConsoleRecorder({ capacity: 2 });

    for (const subcommand of ['log', 'show', 'blame']) {
      recorder.record(commandRecord({ args: [subcommand] }));
    }

    expect(recorder.enabled).toBe(true);
    expect(recorder.size).toBe(2);
    expect(recorder.snapshot().map((entry) => entry.subcommand)).toEqual(['show', 'blame']);
    expect(recorder.snapshot().map((entry) => entry.sequence)).toEqual([2, 3]);
  });

  it('disables recording for zero, negative and non-integer capacities', () => {
    for (const capacity of [0, -1, Number.NaN, 1.5]) {
      const recorder = new GitConsoleRecorder({ capacity });
      recorder.record(commandRecord());

      expect(recorder.enabled).toBe(false);
      expect(recorder.snapshot()).toEqual([]);
    }
  });

  it('omits argument values by default while keeping counts and a sanitized stderr head', () => {
    const recorder = new GitConsoleRecorder({ capacity: 4 });
    recorder.record(
      commandRecord({ stderr: Buffer.from(`fatal: unable to read ${cwd}/objects`) }),
    );

    const entry = recorder.snapshot()[0]!;
    expect(entry.args).toBeUndefined();
    expect(entry.argumentCount).toBe(2);
    expect(entry.subcommand).toBe('log');
    expect(entry.stderrHead).toContain('<repository>');
    expect(entry.stderrHead).not.toContain(cwd);
    expect(JSON.stringify(recorder.snapshot())).not.toContain('private-search-term');
    expect(formatGitConsoleEntry(entry)).toContain('git log · 2 args');
    expect(formatGitConsoleEntry(entry)).not.toContain('private-search-term');
  });

  it('records full argv and stderr only in verbose mode, always redacted', () => {
    const recorder = new GitConsoleRecorder({ capacity: 4, verbose: true });
    recorder.record(
      commandRecord({
        args: [
          'ls-remote',
          'https://alice:secret@example.com/repository.git',
          '--config',
          `${cwd}/?access_token=topsecret`,
        ],
        stderr: Buffer.from(`fatal in ${cwd}: https://bob:password@example.com/x?token=abc`),
      }),
    );

    const snapshot = JSON.stringify(recorder.snapshot());
    const entry = recorder.snapshot()[0]!;
    expect(entry.args).toEqual([
      'ls-remote',
      'https://***@example.com/repository.git',
      '--config',
      '<repository>/?access_token=***',
    ]);
    expect(entry.stderrHead).toContain('<repository>');
    expect(entry.stderrHead).toContain('https://***@example.com/x?token=***');
    expect(snapshot).not.toContain('secret');
    expect(snapshot).not.toContain('password');
    expect(snapshot).not.toContain('topsecret');
    expect(snapshot).not.toContain(cwd);
    expect(formatGitConsoleEntry(entry)).toContain('git ls-remote');
  });

  it('bounds the retained stderr head and the rendered stderr excerpt', () => {
    const recorder = new GitConsoleRecorder({ capacity: 4 });
    recorder.record(
      commandRecord({ stderr: Buffer.alloc(CONSOLE_STDERR_HEAD_BYTES + 4096, 0x78) }),
    );

    const entry = recorder.snapshot()[0]!;
    expect(entry.stderrHead).toHaveLength(CONSOLE_STDERR_HEAD_BYTES);
    const rendered = formatGitConsoleEntry(entry);
    expect(rendered.endsWith('…')).toBe(true);
    expect(rendered.split('stderr=')[1]).toHaveLength(CONSOLE_STDERR_DISPLAY_CHARACTERS + 1);
  });

  it('formats success, cancellation, timeout and launch-failure outcomes', () => {
    const recorder = new GitConsoleRecorder({ capacity: 8, now: () => 0 });
    recorder.record(commandRecord());
    recorder.record(commandRecord({ exitCode: null, cancelled: true }));
    recorder.record(commandRecord({ exitCode: null, timedOut: true }));
    recorder.record(commandRecord({ exitCode: null, startFailed: true }));

    const lines = recorder.snapshot().map(formatGitConsoleEntry);
    expect(lines[0]).toContain('exit=0');
    expect(lines[1]).toContain('exit=none cancelled');
    expect(lines[2]).toContain('exit=none timed-out');
    expect(lines[3]).toContain('start-failed');
    expect(formatGitConsoleSnapshot([])).toBe('No Git commands have been recorded yet.');
    expect(formatGitConsoleSnapshot(recorder.snapshot())).toBe(lines.join('\n'));
  });

  it('applies setting changes without a reload and clears the buffer when disabled', () => {
    const recorder = new GitConsoleRecorder({ capacity: 2 });
    for (const subcommand of ['log', 'show', 'blame']) {
      recorder.record(commandRecord({ args: [subcommand] }));
    }

    recorder.configure({ capacity: 1, verbose: true });
    expect(recorder.size).toBe(1);
    recorder.record(commandRecord({ args: ['log', 'verbose-argument'] }));
    expect(recorder.snapshot()[0]!.args).toEqual(['log', 'verbose-argument']);

    recorder.configure({ capacity: 2, verbose: false });
    expect(recorder.snapshot()[0]!.args).toBeUndefined();
    expect(recorder.snapshot()[0]!.argumentCount).toBe(2);
    expect(JSON.stringify(recorder.snapshot())).not.toContain('verbose-argument');

    recorder.configure({ capacity: 0 });
    expect(recorder.enabled).toBe(false);
    expect(recorder.snapshot()).toEqual([]);
    recorder.record(commandRecord());
    expect(recorder.size).toBe(0);
  });

  it('clears retained entries on demand and swallows recorder-side failures', () => {
    const recorder = new GitConsoleRecorder({ capacity: 2 });
    recorder.record(commandRecord());
    recorder.clear();
    expect(recorder.snapshot()).toEqual([]);

    const broken = new GitConsoleRecorder({
      capacity: 2,
      now: () => {
        throw new Error('clock unavailable');
      },
    });
    expect(() => broken.record(commandRecord())).not.toThrow();
    expect(broken.size).toBe(0);
  });
});
