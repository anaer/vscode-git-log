export type RepositoryId = string;
export type CommitHash = string;

export type RefKind = 'head' | 'local' | 'remote' | 'tag';
export type SignatureStatus = 'good' | 'bad' | 'unknown' | 'expired' | 'revoked' | 'error' | 'none';
export type GitOperationState = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

export interface StashEntry {
  ref: string;
  hash: CommitHash;
  timestamp: number;
  subject: string;
}

/** A contributor aggregated by `git shortlog`, with mailmap aliases already merged. */
export interface Contributor {
  name: string;
  email: string;
  commitCount: number;
}

export interface RefLabel {
  fullName: string;
  shortName: string;
  kind: RefKind;
  target: CommitHash;
  ahead: number;
  behind: number;
  isCurrent: boolean;
  remote?: string;
  upstream?: string;
  /** True when the configured upstream no longer exists (`%(upstream:track)` reported `[gone]`). */
  gone?: boolean;
}

/** A local branch offered for deletion by the batch branch-cleanup dialog. */
export interface BranchCleanupCandidate {
  name: string;
  /** The configured upstream no longer exists on the remote. */
  gone: boolean;
  /** Reachable from the current branch, so deleting it cannot drop commits. */
  merged: boolean;
  /** Commits reachable from this branch but not from the current branch. */
  aheadCount: number;
  /** Committer date of the branch tip, in seconds since the epoch. */
  lastCommitTime: number;
}

export interface CommitSummary {
  hash: CommitHash;
  parents: CommitHash[];
  /** Parents in the visible, filtered graph after hidden commits have been collapsed. */
  graphParents?: CommitHash[];
  /** False for a structural context row retained to explain a filtered graph. */
  filterMatch?: boolean;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorTime: number;
  commitTime: number;
  refs: RefLabel[];
}

export interface CommitDetails extends CommitSummary {
  body: string;
  committerName: string;
  committerEmail: string;
  signature: SignatureStatus;
}

export interface RepositorySummary {
  id: RepositoryId;
  rootUri: string;
  gitDirUri: string;
  commonGitDirUri?: string;
  displayName: string;
  isBare: boolean;
  currentBranch?: string;
  head?: CommitHash;
  userName?: string;
  userEmail?: string;
  operationState?: GitOperationState;
  hasUnresolvedConflicts?: boolean;
  /** True when the clone is shallow (`git rev-parse --is-shallow-repository` reported `true`). */
  isShallow?: boolean;
}

export type ChangedFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface ChangedFile {
  status: ChangedFileStatus;
  path: string;
  oldPath?: string;
  additions?: number;
  deletions?: number;
  binary: boolean;
  commitHash?: CommitHash;
  parentHash?: CommitHash;
}

export interface HistoryEntry extends CommitSummary {
  path: string;
  oldPath?: string;
  additions?: number;
  deletions?: number;
  binary: boolean;
  oldStartLine?: number;
  oldLineCount?: number;
  newStartLine?: number;
  newLineCount?: number;
}

export type EditorHistoryKind = 'line' | 'file';

export interface EditorHistoryRequest {
  kind: EditorHistoryKind;
  lineScope?: 'current' | 'selection';
  repository: RepositorySummary;
  path: string;
  startLine?: number;
  endLine?: number;
  workingContent?: string;
}

export interface FolderHistoryRequest {
  repository: RepositorySummary;
  path: string;
}
