import { redactGitDiagnostic } from './classifyGitError';
import type { GitCommandRecord } from './GitRunner';

export const CONSOLE_STDERR_HEAD_BYTES = 4 * 1024;
export const CONSOLE_STDERR_DISPLAY_CHARACTERS = 500;

export interface GitConsoleEntry {
  readonly sequence: number;
  readonly recordedAt: number;
  readonly subcommand: string;
  readonly argumentCount: number;
  /** Present only when verbose recording is on; values are already redacted. */
  readonly args?: readonly string[];
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly cancelled: boolean;
  readonly timedOut: boolean;
  readonly startFailed: boolean;
  readonly stderrHead?: string;
}

export interface GitConsoleRecorderOptions {
  /** Maximum retained entries. Non-positive values disable recording. */
  capacity: number;
  /** Record full argv. Off by default so user-supplied arguments never stay in memory. */
  verbose?: boolean;
  now?: () => number;
}

function normalizeCapacity(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function sanitize(value: string, cwd: string): string {
  return redactGitDiagnostic(value).split(cwd).join('<repository>');
}

function toStderrHead(record: GitCommandRecord): string | undefined {
  if (record.stderr.length === 0) return undefined;
  const head = record.stderr.subarray(0, CONSOLE_STDERR_HEAD_BYTES).toString('utf8');
  const collapsed = sanitize(head, record.cwd).replace(/\s+/gu, ' ').trim();
  return collapsed || undefined;
}

function withoutArguments(entry: GitConsoleEntry): GitConsoleEntry {
  const base = {
    sequence: entry.sequence,
    recordedAt: entry.recordedAt,
    subcommand: entry.subcommand,
    argumentCount: entry.argumentCount,
    durationMs: entry.durationMs,
    exitCode: entry.exitCode,
    cancelled: entry.cancelled,
    timedOut: entry.timedOut,
    startFailed: entry.startFailed,
  };
  return entry.stderrHead ? { ...base, stderrHead: entry.stderrHead } : base;
}

export class GitConsoleRecorder {
  private readonly entries: GitConsoleEntry[] = [];
  private readonly now: () => number;
  private capacity: number;
  private verbose: boolean;
  private sequence = 0;

  constructor(options: GitConsoleRecorderOptions) {
    this.now = options.now ?? Date.now;
    this.capacity = normalizeCapacity(options.capacity);
    this.verbose = options.verbose ?? false;
  }

  /** Applies setting changes without a reload; drops retained argv and trims the buffer. */
  configure(settings: { capacity: number; verbose?: boolean }): void {
    this.capacity = normalizeCapacity(settings.capacity);
    this.verbose = settings.verbose ?? false;
    if (!this.verbose) {
      for (let index = 0; index < this.entries.length; index += 1) {
        const entry = this.entries[index];
        if (entry?.args) this.entries[index] = withoutArguments(entry);
      }
    }
    if (this.capacity === 0) {
      this.entries.length = 0;
    } else if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  get enabled(): boolean {
    return this.capacity > 0;
  }

  get size(): number {
    return this.entries.length;
  }

  record(record: GitCommandRecord): void {
    if (this.capacity === 0) return;
    try {
      const stderrHead = toStderrHead(record);
      this.entries.push({
        sequence: ++this.sequence,
        recordedAt: this.now(),
        subcommand: record.args[0] ?? 'unknown',
        argumentCount: record.args.length,
        ...(this.verbose
          ? { args: record.args.map((argument) => sanitize(argument, record.cwd)) }
          : {}),
        durationMs: record.durationMs,
        exitCode: record.exitCode,
        cancelled: record.cancelled,
        timedOut: record.timedOut,
        startFailed: record.startFailed,
        ...(stderrHead ? { stderrHead } : {}),
      });
      if (this.entries.length > this.capacity) {
        this.entries.splice(0, this.entries.length - this.capacity);
      }
    } catch {
      // A broken console must never interfere with Git command execution.
    }
  }

  snapshot(): readonly GitConsoleEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function formatTimestamp(epochMs: number): string {
  const date = new Date(epochMs);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatArgument(argument: string): string {
  return /[\s"']/u.test(argument) ? JSON.stringify(argument) : argument;
}

function formatOutcome(entry: GitConsoleEntry): string {
  if (entry.startFailed) return 'start-failed';
  const outcome = `exit=${entry.exitCode === null ? 'none' : String(entry.exitCode)}`;
  const flags = [entry.cancelled ? 'cancelled' : '', entry.timedOut ? 'timed-out' : '']
    .filter(Boolean)
    .join(' ');
  return flags ? `${outcome} ${flags}` : outcome;
}

export function formatGitConsoleEntry(entry: GitConsoleEntry): string {
  const command = entry.args
    ? `git ${entry.args.map(formatArgument).join(' ')}`
    : `git ${entry.subcommand} · ${String(entry.argumentCount)} args`;
  const stderr = entry.stderrHead
    ? ` · stderr=${entry.stderrHead.slice(0, CONSOLE_STDERR_DISPLAY_CHARACTERS)}${
        entry.stderrHead.length > CONSOLE_STDERR_DISPLAY_CHARACTERS ? '…' : ''
      }`
    : '';
  return `[${formatTimestamp(entry.recordedAt)}] ${command} · ${entry.durationMs.toFixed(1)}ms · ${formatOutcome(entry)}${stderr}`;
}

export function formatGitConsoleSnapshot(entries: readonly GitConsoleEntry[]): string {
  if (entries.length === 0) return 'No Git commands have been recorded yet.';
  return entries.map(formatGitConsoleEntry).join('\n');
}
