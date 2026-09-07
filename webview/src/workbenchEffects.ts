import type { LogFilters, WebviewToExtensionMessage } from '../../src/protocol/messages';
import type { CommitSummary, StashEntry } from '../../src/shared/models';
import type { CommitSelection } from './commitSelection';

/**
 * Kinds of webview requests. Used to track the most recent request issued for
 * each kind of data so stale extension responses can be discarded.
 */
export type WorkbenchRequestScope = 'repositories' | 'log' | 'selection' | 'operation';

/**
 * Mutable race-tracking state that the Workbench uses to correlate extension
 * responses with the requests that produced them and to drop stale ones.
 *
 * This intentionally keeps the data the Workbench component used to hold in
 * several `useRef`s. It is deliberately NOT part of `WorkbenchState`: `race` is
 * mutated in place, so `store.getState().race` always returns the same object
 * reference and components subscribing only to `state` never re-render when
 * these fields change — exactly like the refs they replace.
 */
export interface WorkbenchRaceState {
  requestById: Map<string, WorkbenchRequestScope>;
  latestByScope: Partial<Record<WorkbenchRequestScope, string>>;
  activeSelectionRequest:
    | { requestId: string; repositoryId: string; hash: string }
    | undefined;
  activeCommitMessagesRequest: string | undefined;
  activeOperationByRepository: Map<string, string>;
  acceptedRepositoryId: string | undefined;
  pendingFilters:
    | { repositoryId: string; requestId?: string; filters: LogFilters }
    | undefined;
  pendingScrollPosition: { repositoryId: string; scrollTop: number } | undefined;
}

export interface SquashOperationState {
  repositoryId: string;
  hashes: string[];
  requestId: string;
  message: string;
  loading: boolean;
}

export interface StashDialogState {
  repositoryId: string;
  stashes: StashEntry[];
  loading: boolean;
  stashMessage: string;
  includeUntracked: boolean;
}

export interface AmendDialogState {
  repositoryId: string;
  message: string;
}

export interface HistoryParentPickerState {
  repositoryId: string;
  commit: CommitSummary;
}

/**
 * Component/副作用 bridges consumed by the store's `processMessage` action. The
 * `processMessage` handler (migrated from App.tsx's message listener switch) uses
 * these to reach the React state setters, DOM side effects and refs that belong to
 * the component, while doing all `WorkbenchState` updates and `race` bookkeeping
 * itself. Pure helpers (e.g. `computeGraphLayout`, `filtersEqual`, `emptyCommitSelection`)
 * are intentionally NOT part of this interface — the store imports them directly.
 */
export interface WorkbenchEffects {
  setCommitSelection: (
    next: CommitSelection | ((current: CommitSelection) => CommitSelection),
  ) => void;
  setSquashOperation: (
    next:
      | SquashOperationState
      | undefined
      | ((current: SquashOperationState | undefined) => SquashOperationState | undefined),
  ) => void;
  setStashDialog: (
    next:
      | StashDialogState
      | undefined
      | ((current: StashDialogState | undefined) => StashDialogState | undefined),
  ) => void;
  setAmendDialog: (
    next:
      | AmendDialogState
      | undefined
      | ((current: AmendDialogState | undefined) => AmendDialogState | undefined),
  ) => void;
  setResponsiveExpanded: (
    next:
      | { files: boolean; refs: boolean }
      | ((current: { files: boolean; refs: boolean }) => { files: boolean; refs: boolean }),
  ) => void;
  setScrollTopByRepository: (
    next:
      | Record<string, number>
      | ((current: Record<string, number>) => Record<string, number>),
  ) => void;
  setHistoryParentPicker: (
    next:
      | HistoryParentPickerState
      | undefined
      | ((current: HistoryParentPickerState | undefined) => HistoryParentPickerState | undefined),
  ) => void;
  setDetailsHashCopyState: (
    next:
      | 'idle'
      | 'copying'
      | 'copied'
      | ((current: 'idle' | 'copying' | 'copied') => 'idle' | 'copying' | 'copied'),
  ) => void;
  vscodePostMessage: (message: WebviewToExtensionMessage) => void;
  persistScrollTopByRepository: (value: Record<string, number>) => void;
  stashDialogRepositoryRef: { current: string | undefined };
  lastWindowAnchorSignatureRef: { current: string | undefined };
  historyParentChoicesRef: { current: Map<string, string> };
  scrollTopByRepositoryRef: { current: Record<string, number> };
  latestRepositorySelectionRequestRef: { current: string | undefined };
  detailsHashCopyRequestRef: { current: string | undefined };
  /** Cancel any pending "copy feedback → idle" reset without touching the timer handle. */
  clearDetailsHashCopyReset(): void;
  /** Schedule a callback that resets the copy feedback after a short delay. */
  scheduleDetailsHashCopyReset(reset: () => void): void;
}

export function createNoopEffects(): WorkbenchEffects {
  const noop = (): void => {};
  return {
    setCommitSelection: noop,
    setSquashOperation: noop,
    setStashDialog: noop,
    setAmendDialog: noop,
    setResponsiveExpanded: noop,
    setScrollTopByRepository: noop,
    setHistoryParentPicker: noop,
    setDetailsHashCopyState: noop,
    vscodePostMessage: noop,
    persistScrollTopByRepository: noop,
    stashDialogRepositoryRef: { current: undefined },
    lastWindowAnchorSignatureRef: { current: undefined },
    historyParentChoicesRef: { current: new Map() },
    scrollTopByRepositoryRef: { current: {} },
    latestRepositorySelectionRequestRef: { current: undefined },
    detailsHashCopyRequestRef: { current: undefined },
    clearDetailsHashCopyReset: noop,
    scheduleDetailsHashCopyReset: noop,
  };
}