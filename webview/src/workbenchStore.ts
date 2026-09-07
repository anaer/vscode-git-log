import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { GraphContinuationState, GraphLayoutResult } from '../../src/shared/layoutCommitGraph';
import type {
  ErrorRecoveryAction,
  ExtensionToWebviewMessage,
  LogFilters,
  WorkbenchLayout,
} from '../../src/protocol/messages';
import type {
  ChangedFile,
  CommitDetails,
  CommitSummary,
  HistoryEntry,
  RefLabel,
  RepositorySummary,
} from '../../src/shared/models';

export const defaultLayout: WorkbenchLayout = {
  refsWidth: 220,
  filesWidth: 320,
  detailsHeight: 156,
  detailsPlacement: 'bottom',
  filesViewMode: 'tree',
  refsColumnWidth: 150,
  authorColumnWidth: 130,
  dateColumnWidth: 125,
};

export const defaultFilters: LogFilters = {
  text: '',
  branches: [],
  authors: [],
  paths: [],
};

export const EMPTY_GRAPH_LAYOUT: GraphLayoutResult = {
  rows: [],
  continuation: { lanes: [], nextLaneId: 0, nextColorIndex: 0 },
  maxLaneCount: 0,
};

/**
 * Incrementally-computed commit-graph layout plus the inputs it was derived from.
 * `mode` discriminates whether the cache was built from the commit list
 * (`'commits'`) or from history entries (`'history'`); only a `'commits'` cache
 * can be extended with appended commits, so the mode guards against reusing a
 * history-mode continuation when we fall back to the commit list. The cache is
 * ephemeral UI state and is never persisted to the extension host.
 */
export interface GraphLayoutCache {
  mode: 'commits' | 'history';
  commits: readonly CommitSummary[];
  result: GraphLayoutResult;
}

export const EMPTY_GRAPH_LAYOUT_CACHE: GraphLayoutCache = {
  mode: 'commits',
  commits: [],
  result: EMPTY_GRAPH_LAYOUT,
};

export interface WorkbenchState {
  repositories: RepositorySummary[];
  selectedRepositoryId: string | undefined;
  refs: RefLabel[];
  commits: CommitSummary[];
  commitListRevision: number;
  selectedHash: string | undefined;
  details: CommitDetails | undefined;
  detailsRepositoryId: string | undefined;
  selectedParent: string | undefined;
  files: ChangedFile[];
  selectedFile: ChangedFile | undefined;
  hasMore: boolean;
  pageSize: number;
  maxCachedCommits: number;
  nextLogOffset: number;
  startLogOffset: number;
  graphContinuation: GraphContinuationState | undefined;
  graphLayout: GraphLayoutCache;
  windowAnchorReady: boolean;
  operationRepositoryIds: ReadonlySet<string>;
  layout: WorkbenchLayout;
  filters: LogFilters;
  loading: Extract<ExtensionToWebviewMessage, { type: 'loading' }>['scope'] | undefined;
  error: string | undefined;
  errorRecovery: { repositoryId: string; action: ErrorRecoveryAction } | undefined;
  history:
    | {
        repositoryId: string;
        kind: 'line' | 'file';
        path: string;
        startLine?: number;
        endLine?: number;
        entries: HistoryEntry[];
        hasMore: boolean;
        notice?: string;
      }
    | undefined;
  folderHistory:
    | {
        repositoryId: string;
        path: string;
      }
    | undefined;
}

export const initialWorkbenchState: WorkbenchState = {
  repositories: [],
  selectedRepositoryId: undefined,
  refs: [],
  commits: [],
  commitListRevision: 0,
  selectedHash: undefined,
  details: undefined,
  detailsRepositoryId: undefined,
  selectedParent: undefined,
  files: [],
  selectedFile: undefined,
  hasMore: false,
  pageSize: 500,
  maxCachedCommits: 5000,
  nextLogOffset: 0,
  startLogOffset: 0,
  graphContinuation: undefined,
  graphLayout: EMPTY_GRAPH_LAYOUT_CACHE,
  windowAnchorReady: false,
  operationRepositoryIds: new Set(),
  layout: defaultLayout,
  filters: defaultFilters,
  loading: undefined,
  error: undefined,
  errorRecovery: undefined,
  history: undefined,
  folderHistory: undefined,
};

export interface WorkbenchStore {
  state: WorkbenchState;
  setState(next: WorkbenchState | ((current: WorkbenchState) => WorkbenchState)): void;
}

export function createWorkbenchStore(): StoreApi<WorkbenchStore> {
  return createStore<WorkbenchStore>()((set) => ({
    state: initialWorkbenchState,
    setState: (next) =>
      set((current) => ({
        state: typeof next === 'function' ? next(current.state) : next,
      })),
  }));
}

export const WorkbenchStoreContext = createContext<StoreApi<WorkbenchStore> | undefined>(
  undefined,
);

export function useWorkbenchStoreApi(): StoreApi<WorkbenchStore> {
  const store = useContext(WorkbenchStoreContext);
  if (!store) {
    throw new Error('useWorkbenchStoreApi must be used inside a WorkbenchStoreContext provider');
  }
  return store;
}

const selectState = (store: WorkbenchStore): WorkbenchState => store.state;
const selectSetState = (store: WorkbenchStore): WorkbenchStore['setState'] => store.setState;

export function useWorkbenchState(): WorkbenchState {
  return useStore(useWorkbenchStoreApi(), selectState);
}

export function useSetWorkbenchState(): WorkbenchStore['setState'] {
  return useStore(useWorkbenchStoreApi(), selectSetState);
}
