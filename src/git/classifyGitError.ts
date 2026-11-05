import { GitCommandError } from './GitRunner';

export interface ClassifiedGitError {
  category: 'conflict' | 'authentication' | 'hook' | 'repository' | 'unknown';
  message: string;
  detail: string;
  /** One actionable sentence derived from the failure. */
  nextStep?: string;
}

const NEXT_STEPS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bindex\.lock\b/u, 'Retry in a moment; another Git process is holding the index.'],
  [
    /not possible to fast-forward|diverging branches|--ff-only/u,
    'Pull again with the Merge or Rebase strategy.',
  ],
  [
    /non-fast-forward|\[rejected\]|fetch first/u,
    'Pull with merge or rebase before pushing, or use Force Push with lease.',
  ],
  [
    /would be overwritten by checkout|local changes to the following files would be overwritten/u,
    'Commit or discard the listed changes, then try again.',
  ],
  [
    /has no remote|no remote to push|no configured push destination/u,
    'Add a remote first, then retry.',
  ],
  [
    /did not match any file\(s\) known to git|unknown revision|bad revision/u,
    'Fetch to refresh remote refs, then retry.',
  ],
  [
    /\bconflict\b|could not apply|automatic merge failed/u,
    'Resolve the conflicts in Source Control, then continue or abort.',
  ],
  [
    /authentication failed|permission denied|could not read username|publickey/u,
    'Check your credential helper or SSH agent, then retry.',
  ],
];

function nextStepFor(lower: string): string | undefined {
  return NEXT_STEPS.find(([pattern]) => pattern.test(lower))?.[1];
}

export function classifyGitError(error: GitCommandError): ClassifiedGitError {
  const detail = redactGitDiagnostic(error.stderr.toString('utf8').trim() || error.message);
  const classified = classifyGitErrorBase(error, detail.toLowerCase(), detail);
  const nextStep = nextStepFor(detail.toLowerCase());
  return nextStep ? { ...classified, nextStep } : classified;
}

export function redactGitDiagnostic(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s]*@/giu, '$1***@')
    .replace(/([?&](?:access_token|token|password|pat)=)[^&\s]*/giu, '$1***');
}

/**
 * Maps a failed Git invocation to a user-facing error category.
 *
 * Cancelled commands are handled by callers (they return before classifying),
 * so there is intentionally no cancellation branch here.
 */
function classifyGitErrorBase(
  error: GitCommandError,
  lower: string,
  detail: string,
): ClassifiedGitError {
  if (error.timedOut) {
    return {
      category: 'unknown',
      message: 'Git query timed out. Try a smaller selection or a narrower history request.',
      detail,
    };
  }

  if (/stdout exceeded \d+ bytes/u.test(lower)) {
    return {
      category: 'unknown',
      message: 'Git output exceeded the safety limit. Try a smaller selection or history request.',
      detail,
    };
  }

  if (/\b(?:file .* is binary|binary file)\b/u.test(lower)) {
    return {
      category: 'unknown',
      message: 'Binary files do not support line history.',
      detail,
    };
  }

  if (error.exitCode === null || /unable to start|enoent|not found/u.test(lower)) {
    return {
      category: 'repository',
      message:
        'Git executable is unavailable. Install Git 2.20 or newer, or configure gitLogWorkbench.git.path.',
      detail,
    };
  }

  if (/\bconflict\b|could not apply|automatic merge failed/u.test(lower)) {
    return { category: 'conflict', message: 'Git stopped because of conflicts.', detail };
  }
  if (/authentication failed|permission denied|could not read username|publickey/u.test(lower)) {
    return {
      category: 'authentication',
      message: 'Git authentication failed. Check your credential helper or SSH agent.',
      detail,
    };
  }
  if (/\bhook\b.*(?:declined|failed)|(?:pre|post)-(?:commit|push|merge|rebase)/u.test(lower)) {
    return { category: 'hook', message: 'A Git hook rejected the operation.', detail };
  }
  if (/not a git repository|unknown revision|bad revision|invalid object name/u.test(lower)) {
    return { category: 'repository', message: 'Git could not resolve the repository or revision.', detail };
  }
  return { category: 'unknown', message: detail.split(/\r?\n/u)[0] || error.message, detail };
}

export function toUserMessage(error: unknown): string {
  if (error instanceof GitCommandError) return classifyGitError(error).message;
  return error instanceof Error ? error.message : String(error);
}
