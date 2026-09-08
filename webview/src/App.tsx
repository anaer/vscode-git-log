/* eslint-disable react-hooks/immutability --
 * The `race` slice read from `storeApi.getState().race` is intentionally mutated
 * in place and deliberately excluded from React's reactivity: it replaces `useRef`s
 * that were mutated in place, so mutations must not be treated as render inputs and
 * must not be added to effect/callback dependency arrays. Only the mutable-store
 * rule is disabled file-wide; `react-hooks/exhaustive-deps` stays enabled and any
 * hook that must reference `race` (a deliberately non-reactive store field) opts
 * out per statement below. */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  parseWebviewMessage,
  type ExtensionToWebviewMessage,
  type GitOperationRequest,
  type LogFilters,
  type WebviewToExtensionMessage,
  type WorkbenchLayout,
} from '../../src/protocol/messages';
import type {
  ChangedFile,
  CommitSummary,
  RefLabel,
} from '../../src/shared/models';
import { getVsCodeApi } from './vscodeApi';
import { CommitList } from './CommitList';
import { requestId } from './webviewUtils';
import {
  emptyCommitSelection,
  isContiguousSelection,
  nextCommitSelection,
  type CommitSelection,
} from './commitSelection';
import { ContextMenu } from './ContextMenu';
import { Dialogs } from './Dialogs';
import { RefsPane } from './RefsPane';
import { FilesPane } from './FilesPane';
import { DetailsPane } from './DetailsPane';
import {
  CommitToolbar,
  GlobalToolbar,
  type FilterPopupKind,
} from './Toolbars';
import {
  createWorkbenchStore,
  defaultFilters,
  EMPTY_GRAPH_LAYOUT_CACHE,
  useSetWorkbenchState,
  useWorkbenchState,
  useWorkbenchStoreApi,
  WorkbenchStoreContext,
} from './workbenchStore';
import type {
  AmendDialogState,
  HistoryParentPickerState,
  SquashOperationState,
  StashDialogState,
} from './workbenchEffects';

export type ContextMenuState =
  | {
      kind: 'commit';
      repositoryId: string;
      commit: CommitSummary;
      commits: CommitSummary[];
      x: number;
      y: number;
    }
  | { kind: 'ref'; repositoryId: string; ref: RefLabel; x: number; y: number }
  | { kind: 'file'; repositoryId: string; file: ChangedFile; x: number; y: number }
  | { kind: 'toolbar'; repositoryId: string; x: number; y: number }
  | { kind: 'head'; repositoryId: string; hash: string; x: number; y: number };

export type NamedOperationState =
  | { kind: 'createBranch'; repositoryId: string; target: string; value: string }
  | { kind: 'createTag'; repositoryId: string; target: string; value: string }
  | { kind: 'renameBranch'; repositoryId: string; oldName: string; value: string }
  | { kind: 'checkoutRemote'; repositoryId: string; startPoint: string; value: string };

type WorkbenchRequestScope = 'repositories' | 'log' | 'selection' | 'operation';

function requestScopeForMessage(message: WebviewToExtensionMessage): WorkbenchRequestScope | undefined {
  switch (message.type) {
    case 'ready':
      return 'repositories';
    case 'selectRepository':
    case 'requestLogPage':
    case 'refresh':
    case 'updateFilters':
      return 'log';
    case 'selectCommit':
    case 'selectParent':
      return 'selection';
    case 'runOperation':
      return 'operation';
    default:
      return undefined;
  }
}

function readScrollTopByRepository(value: unknown): Record<string, number> {
  if (
    value &&
    typeof value === 'object' &&
    'scrollTopByRepository' in value &&
    typeof value.scrollTopByRepository === 'object' &&
    value.scrollTopByRepository !== null
  ) {
    return { ...(value.scrollTopByRepository as Record<string, number>) };
  }
  return {};
}

export function App() {
  const [store] = useState(createWorkbenchStore);
  return (
    <WorkbenchStoreContext.Provider value={store}>
      <Workbench />
    </WorkbenchStoreContext.Provider>
  );
}

function Workbench() {
  const vscode = useMemo(() => getVsCodeApi(), []);
  const state = useWorkbenchState();
  const setState = useSetWorkbenchState();
  const storeApi = useWorkbenchStoreApi();
  const race = storeApi.getState().race;
  const [commitSelection, setCommitSelection] = useState<CommitSelection>(emptyCommitSelection);
  const [refSearch, setRefSearch] = useState('');
  const [scrollTopByRepository, setScrollTopByRepository] = useState<Record<string, number>>(() =>
    readScrollTopByRepository(vscode.getState()),
  );
  const [filterPopup, setFilterPopup] = useState<FilterPopupKind | undefined>();
  const [filterPopupAnchor, setFilterPopupAnchor] = useState<{ left: number; top: number }>();
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<CSSProperties>();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [measuredContextMenuPosition, setMeasuredContextMenuPosition] = useState<
    CSSProperties | undefined
  >();
  const [squashOperation, setSquashOperation] = useState<SquashOperationState>();

  const [namedOperation, setNamedOperation] = useState<NamedOperationState>();

  const [historyParentPicker, setHistoryParentPicker] = useState<HistoryParentPickerState>();

  const [stashDialog, setStashDialog] = useState<StashDialogState>();
  const [amendDialog, setAmendDialog] = useState<AmendDialogState>();
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [detailsHashCopyState, setDetailsHashCopyState] = useState<
    'idle' | 'copying' | 'copied'
  >('idle');
  const [commitRevealTarget, setCommitRevealTarget] = useState<
    {
      repositoryId: string;
      hash: string;
      requestId: number;
      minimumListRevision: number;
    } | undefined
  >();
  const [collapsedRefGroups, setCollapsedRefGroups] = useState<Set<string>>(new Set());
  const [collapsedRefFolders, setCollapsedRefFolders] = useState<Set<string>>(new Set());
  const [responsiveCollapse, setResponsiveCollapse] = useState(() => ({
    files: window.matchMedia?.('(max-width: 900px)').matches ?? false,
    refs: window.matchMedia?.('(max-width: 680px)').matches ?? false,
  }));
  const [responsiveExpanded, setResponsiveExpanded] = useState({ files: false, refs: false });
  const filterTimer = useRef<number | undefined>(undefined);
  const detailsHashCopyRequest = useRef<string | undefined>(undefined);
  const detailsHashCopyTimer = useRef<number | undefined>(undefined);
  const scrollPersistTimer = useRef<number | undefined>(undefined);
  const scrollTopByRepositoryRef = useRef(scrollTopByRepository);
  const previousWindowOffsetByRepository = useRef<Map<string, number>>(new Map());
  const lastWindowAnchorSignature = useRef<string | undefined>(undefined);
  const historyParentChoices = useRef<Map<string, string>>(new Map());
  const logWindowRef = useRef({
    startLogOffset: state.startLogOffset,
    graphContinuation: state.graphContinuation,
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLElement>(null);
  const logHeaderRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const syncLogHeaderScroll = useCallback((scrollLeft: number): void => {
    if (logHeaderRef.current) {
      logHeaderRef.current.style.transform = `translateX(${-scrollLeft}px)`;
    }
  }, []);
  const latestRepositorySelectionRequest = useRef<string | undefined>(undefined);
  const stashDialogRepository = useRef<string | undefined>(undefined);
  const commitRevealSequence = useRef(0);
  const accumulatedAuthors = useRef(new Map<string, string>());
  const lastAuthorFilterRepository = useRef<string | undefined>(undefined);
  const selectedRepository = state.repositories.find(
    (repository) => repository.id === state.selectedRepositoryId,
  );
  const visibleCommitRevealTarget =
    !state.history && commitRevealTarget?.repositoryId === state.selectedRepositoryId
      ? commitRevealTarget
      : undefined;
  const refSearchActive = Boolean(refSearch.trim());
  const authorFilterOptions = useMemo(() => {
    const userName = selectedRepository?.userName?.trim();
    const userEmail = selectedRepository?.userEmail?.trim();
    const configuredName = userName?.toLocaleLowerCase();
    const configuredEmail = userEmail?.toLocaleLowerCase();

    if (lastAuthorFilterRepository.current !== state.selectedRepositoryId) {
      accumulatedAuthors.current = new Map();
      lastAuthorFilterRepository.current = state.selectedRepositoryId;
    }

    for (const commit of state.commits) {
      const nameKey = commit.authorName.trim().toLocaleLowerCase();
      const isCurrentUser =
        (Boolean(configuredName) && nameKey === configuredName) ||
        (Boolean(configuredEmail) &&
          commit.authorEmail.trim().toLocaleLowerCase() === configuredEmail);
      if (!isCurrentUser && !accumulatedAuthors.current.has(nameKey)) {
        accumulatedAuthors.current.set(nameKey, commit.authorName);
      }
    }

    return [
      ...(userEmail || userName
        ? [
            {
              key: 'current-user',
              label: userName ? `Me (${userName})` : 'Me',
              value: userEmail ?? (userName as string),
            },
          ]
        : []),
      ...[...accumulatedAuthors.current.entries()].map(([key, name]) => ({
        key: `author-${key}`,
        label: name,
        value: name,
      })),
    ];
  }, [selectedRepository?.userEmail, selectedRepository?.userName, state.commits, state.selectedRepositoryId]);
  // Incremental commit-graph layout. A full DAG layout is O(commits); on the
  // common append-only page-load path we only lay out the newly appended commits
  // and reuse the cached rows, falling back to a full recompute whenever the list
  // is replaced, evicted, or in history mode — so the result is identical to a
  // from-scratch layout, just cheaper. The `previous` cache is the layout already
  // stored in WorkbenchState (updated by the data handlers below), so this stays
  // pure and is never read/written during render.
  const selectedCommitHashSet = useMemo(
    () => new Set(commitSelection.hashes),
    [commitSelection.hashes],
  );
  const hasContiguousCommitRange =
    contextMenu?.kind === 'commit' &&
    isContiguousSelection(
      contextMenu.commits.map((commit) => commit.hash),
      state.commits,
    );
  const selectedOperationInFlight = state.selectedRepositoryId
    ? state.operationRepositoryIds.has(state.selectedRepositoryId)
    : false;
  const refsCollapsed = Boolean(
    state.layout.refsCollapsed || (responsiveCollapse.refs && !responsiveExpanded.refs),
  );
  const filesCollapsed = Boolean(
    state.layout.filesCollapsed || (responsiveCollapse.files && !responsiveExpanded.files),
  );
  const detailsPlacement = state.layout.detailsPlacement ?? 'bottom';
  const detailsInChanges = detailsPlacement === 'changes';
  useEffect(() => {
    if (!filterPopup || !filterPopupAnchor) return;
    const updatePosition = (): void => {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const maxWidth = Math.min(360, viewportWidth - 24);
      const left = Math.max(
        8,
        Math.min(filterPopupAnchor.left, Math.max(8, viewportWidth - maxWidth - 8)),
      );
      const top = Math.min(
        filterPopupAnchor.top + 4,
        Math.max(8, viewportHeight - 420 - 4),
      );
      setFilterPopoverPosition({ left, top, right: 'auto' });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [filterPopup, filterPopupAnchor]);
  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!contextMenu || !menu) return;
    const updatePosition = (): void => {
      const bounds = menu.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const margin = 4;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const preferredLeft =
        contextMenu.x > viewportWidth / 2 ? contextMenu.x - bounds.width : contextMenu.x;
      const preferredTop =
        contextMenu.y > viewportHeight / 2 ? contextMenu.y - bounds.height : contextMenu.y;
      const left = Math.min(
        Math.max(margin, preferredLeft),
        Math.max(margin, viewportWidth - bounds.width - margin),
      );
      const top = Math.min(
        Math.max(margin, preferredTop),
        Math.max(margin, viewportHeight - bounds.height - margin),
      );
      setMeasuredContextMenuPosition({ left, top });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', updatePosition);
    }
    const observer = new ResizeObserver(updatePosition);
    observer.observe(menu);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [contextMenu]);
  useEffect(() => {
    if (!window.matchMedia) return;
    const filesQuery = window.matchMedia('(max-width: 900px)');
    const refsQuery = window.matchMedia('(max-width: 680px)');
    const update = (): void => {
      setResponsiveCollapse({ files: filesQuery.matches, refs: refsQuery.matches });
      setResponsiveExpanded((current) => ({
        files: filesQuery.matches ? current.files : false,
        refs: refsQuery.matches ? current.refs : false,
      }));
    };
    filesQuery.addEventListener('change', update);
    refsQuery.addEventListener('change', update);
    update();
    return () => {
      filesQuery.removeEventListener('change', update);
      refsQuery.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    const dismissOpenMenus = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('.context-menu') ||
        target.closest('.filter-popover') ||
        target.closest('[data-popup-trigger="true"]')
      ) {
        return;
      }
      setContextMenu(undefined);
      setFilterPopup(undefined);
    };
    window.addEventListener('pointerdown', dismissOpenMenus);
    return () => window.removeEventListener('pointerdown', dismissOpenMenus);
  }, []);

  useEffect(() => {
    const pending = race.pendingScrollPosition;
    scrollTopByRepositoryRef.current = {
      ...scrollTopByRepository,
      ...(pending ? { [pending.repositoryId]: pending.scrollTop } : {}),
    };
    // `race.pendingScrollPosition` is a deliberately non-reactive store field.
  }, [scrollTopByRepository]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    logWindowRef.current = {
      startLogOffset: state.startLogOffset,
      graphContinuation: state.graphContinuation,
    };
  }, [state.graphContinuation, state.startLogOffset]);

  useEffect(() => {
    if (!state.error) return;
    const error = state.error;
    const recovery = state.errorRecovery;
    const timer = window.setTimeout(() => {
      setState((current) =>
        current.error === error && current.errorRecovery === recovery
          ? { ...current, error: undefined, errorRecovery: undefined }
          : current,
      );
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [setState, state.error, state.errorRecovery]);

  useEffect(() => {
    const repositoryId = state.selectedRepositoryId;
    if (!repositoryId || !state.windowAnchorReady) return;
    const signature = `${repositoryId}:${String(state.startLogOffset)}:${JSON.stringify(
      state.graphContinuation ?? null,
    )}`;
    if (lastWindowAnchorSignature.current === signature) return;
    lastWindowAnchorSignature.current = signature;
    if (scrollPersistTimer.current !== undefined) {
      window.clearTimeout(scrollPersistTimer.current);
      scrollPersistTimer.current = undefined;
    }
    const previousOffset = previousWindowOffsetByRepository.current.get(repositoryId);
    previousWindowOffsetByRepository.current.set(repositoryId, state.startLogOffset);
    let scrollTop = scrollTopByRepositoryRef.current[repositoryId] ?? 0;
    if (previousOffset !== undefined && state.startLogOffset > previousOffset) {
      scrollTop = Math.max(0, scrollTop - (state.startLogOffset - previousOffset) * 28);
      setScrollTopByRepository((current) => {
        const next = { ...current, [repositoryId]: scrollTop };
        scrollTopByRepositoryRef.current = next;
        race.pendingScrollPosition = undefined;
        vscode.setState({ scrollTopByRepository: next });
        return next;
      });
    }
    vscode.postMessage({
      type: 'updateScrollAnchor',
      requestId: requestId('window-anchor'),
      repositoryId,
      scrollTop,
      logOffset: state.startLogOffset,
      ...(state.graphContinuation ? { graphContinuation: state.graphContinuation } : {}),
    });
  }, [ // eslint-disable-line react-hooks/exhaustive-deps -- deliberate non-reactive race field
    state.graphContinuation,
    state.selectedRepositoryId,
    state.startLogOffset,
    state.windowAnchorReady,
    vscode,
  ]);

  useEffect(() => {
    storeApi.getState().bindEffects({
      setCommitSelection,
      setSquashOperation,
      setStashDialog,
      setAmendDialog,
      setResponsiveExpanded,
      setScrollTopByRepository,
      setHistoryParentPicker,
      setDetailsHashCopyState,
      stashDialogRepositoryRef: stashDialogRepository,
      lastWindowAnchorSignatureRef: lastWindowAnchorSignature,
      historyParentChoicesRef: historyParentChoices,
      scrollTopByRepositoryRef,
      latestRepositorySelectionRequestRef: latestRepositorySelectionRequest,
      detailsHashCopyRequestRef: detailsHashCopyRequest,
      clearDetailsHashCopyReset: () => {
        if (detailsHashCopyTimer.current !== undefined) {
          window.clearTimeout(detailsHashCopyTimer.current);
          detailsHashCopyTimer.current = undefined;
        }
      },
      scheduleDetailsHashCopyReset: (reset) => {
        if (detailsHashCopyTimer.current !== undefined) {
          window.clearTimeout(detailsHashCopyTimer.current);
        }
        detailsHashCopyTimer.current = window.setTimeout(() => {
          detailsHashCopyTimer.current = undefined;
          reset();
        }, 1_500);
      },
      vscodePostMessage: (msg) => vscode.postMessage(msg),
      persistScrollTopByRepository: (value) =>
        vscode.setState({ scrollTopByRepository: value }),
    });
    const listener = (event: MessageEvent<ExtensionToWebviewMessage>): void => {
      const message = event.data;
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      storeApi.getState().processMessage(message as ExtensionToWebviewMessage);
    };

    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'ready', requestId: requestId('ready') });
    return () => {
      window.removeEventListener('message', listener);
      if (filterTimer.current !== undefined) window.clearTimeout(filterTimer.current);
      if (scrollPersistTimer.current !== undefined) window.clearTimeout(scrollPersistTimer.current);
      if (detailsHashCopyTimer.current !== undefined) {
        window.clearTimeout(detailsHashCopyTimer.current);
      }
    };
  }, [setState, vscode]); // eslint-disable-line react-hooks/exhaustive-deps -- storeApi handle is stable

  const send = (message: WebviewToExtensionMessage): void => {
    const scope = requestScopeForMessage(message);
    if (scope) {
      race.requestById.set(message.requestId, scope);
      race.latestByScope[scope] = message.requestId;
    }
    vscode.postMessage(message);
  };

  const handleCommitScrollTopChange = useCallback(
    (scrollTop: number): void => {
      if (state.history || !state.selectedRepositoryId) return;
      const repositoryId = state.selectedRepositoryId;
      scrollTopByRepositoryRef.current = {
        ...scrollTopByRepositoryRef.current,
        [repositoryId]: scrollTop,
      };
      race.pendingScrollPosition = { repositoryId, scrollTop };
      if (scrollPersistTimer.current !== undefined) {
        window.clearTimeout(scrollPersistTimer.current);
      }
      scrollPersistTimer.current = window.setTimeout(() => {
        scrollPersistTimer.current = undefined;
        const next = scrollTopByRepositoryRef.current;
        race.pendingScrollPosition = undefined;
        setScrollTopByRepository(next);
        vscode.setState({ scrollTopByRepository: next });
        const logWindow = logWindowRef.current;
        vscode.postMessage({
          type: 'updateScrollAnchor',
          requestId: requestId('scroll'),
          repositoryId,
          scrollTop,
          logOffset: logWindow.startLogOffset,
          ...(logWindow.graphContinuation
            ? { graphContinuation: logWindow.graphContinuation }
            : {}),
        });
      }, 200);
    },
    [state.history, state.selectedRepositoryId, vscode], // eslint-disable-line react-hooks/exhaustive-deps -- deliberate non-reactive race field
  );

  const applyFilters = (filters: LogFilters, debounce = false): void => {
    setState((current) => ({ ...current, filters }));
    if (filterTimer.current !== undefined) {
      window.clearTimeout(filterTimer.current);
      filterTimer.current = undefined;
    }
    if (!state.selectedRepositoryId) return;
    const repositoryId = state.selectedRepositoryId;
    race.pendingFilters = { repositoryId, filters };
    setScrollTopByRepository((current) => {
      const next = { ...current, [repositoryId]: 0 };
      scrollTopByRepositoryRef.current = next;
      race.pendingScrollPosition = undefined;
      vscode.setState({ scrollTopByRepository: next });
      return next;
    });
    const post = (): void => {
      filterTimer.current = undefined;
      if (scrollPersistTimer.current !== undefined) {
        window.clearTimeout(scrollPersistTimer.current);
        scrollPersistTimer.current = undefined;
      }
      setState((current) => ({
        ...current,
        startLogOffset: 0,
        nextLogOffset: 0,
        graphContinuation: undefined,
        graphLayout: EMPTY_GRAPH_LAYOUT_CACHE,
        windowAnchorReady: true,
      }));
      const filterRequestId = requestId('filters');
      race.pendingFilters = { repositoryId, filters, requestId: filterRequestId };
      send({
        type: 'updateFilters',
        requestId: filterRequestId,
        repositoryId,
        filters,
      });
    };
    if (debounce) filterTimer.current = window.setTimeout(post, 200);
    else post();
  };

  const applyDateRange = (dateFrom?: number, dateTo?: number): void => {
    const filters = { ...state.filters };
    delete filters.dateFrom;
    delete filters.dateTo;
    applyFilters({
      ...filters,
      ...(dateFrom !== undefined ? { dateFrom } : {}),
      ...(dateTo !== undefined ? { dateTo } : {}),
    });
    setFilterPopup(undefined);
  };

  const selectRepository = (repositoryId: string): void => {
    if (filterTimer.current !== undefined) {
      window.clearTimeout(filterTimer.current);
      filterTimer.current = undefined;
    }
    race.pendingFilters = undefined;
    if (scrollPersistTimer.current !== undefined) {
      window.clearTimeout(scrollPersistTimer.current);
      scrollPersistTimer.current = undefined;
    }
    race.pendingScrollPosition = undefined;
    setCommitRevealTarget(undefined);
    setContextMenu(undefined);
    setNamedOperation(undefined);
    setFilterPopup(undefined);
    setRefSearch('');
    race.activeSelectionRequest = undefined;
    race.activeCommitMessagesRequest = undefined;
    setCommitSelection(emptyCommitSelection);
    setSquashOperation(undefined);
    setStashDialog(undefined);
    setAmendDialog(undefined);
    stashDialogRepository.current = undefined;
    lastWindowAnchorSignature.current = undefined;
    race.acceptedRepositoryId = repositoryId;
    setState((current) => ({
      ...current,
      selectedRepositoryId: repositoryId,
      refs: [],
      commits: [],
      commitListRevision: current.commitListRevision + 1,
      nextLogOffset: 0,
      startLogOffset: 0,
      graphContinuation: undefined,
      graphLayout: EMPTY_GRAPH_LAYOUT_CACHE,
      windowAnchorReady: false,
      selectedHash: undefined,
      details: undefined,
      detailsRepositoryId: undefined,
      selectedParent: undefined,
      files: [],
      selectedFile: undefined,
      loading: 'log',
      error: undefined,
      errorRecovery: undefined,
    }));
    const selectionRequestId = requestId('repository');
    latestRepositorySelectionRequest.current = selectionRequestId;
    send({ type: 'selectRepository', requestId: selectionRequestId, repositoryId });
  };

  const selectCommit = (commit: CommitSummary, extend = false, toggle = false): void => {
    if (state.history) {
      const rememberedParent = historyParentChoices.current.get(commit.hash);
      if (commit.parents.length > 1 && !rememberedParent) {
        setHistoryParentPicker({
          repositoryId: state.history.repositoryId,
          commit,
        });
        return;
      }
      send({
        type: 'openHistoryDiff',
        requestId: requestId('history-diff'),
        repositoryId: state.history.repositoryId,
        hash: commit.hash,
        ...(rememberedParent ?? commit.parents[0]
          ? { parent: rememberedParent ?? commit.parents[0] }
          : {}),
      });
      return;
    }
    if (!state.selectedRepositoryId) return;
    const next = nextCommitSelection(commitSelection, state.commits, commit.hash, {
      extend,
      toggle,
      ...(state.selectedHash !== undefined ? { selectedHash: state.selectedHash } : {}),
    });
    if (!next) return;
    const nextSelectedCommitHashes = next.selection.hashes;
    const focusedHash = next.focusedHash;
    setCommitSelection(next.selection);
    const selectionRequestId = requestId('selection');
    race.activeSelectionRequest = {
      requestId: selectionRequestId,
      repositoryId: state.selectedRepositoryId,
      hash: focusedHash,
    };
    setState((current) => ({
      ...current,
      selectedHash: focusedHash,
      details: undefined,
      detailsRepositoryId: undefined,
      selectedParent: undefined,
      files: [],
      selectedFile: undefined,
    }));
    send({
      type: 'selectCommit',
      requestId: selectionRequestId,
      repositoryId: state.selectedRepositoryId,
      hash: focusedHash,
      hashes: nextSelectedCommitHashes,
    });
  };

  const selectHash = (hash: string, prefix = 'selection'): void => {
    if (!state.selectedRepositoryId) return;
    const commit = state.commits.find((candidate) => candidate.hash === hash);
    if (commit) {
      selectCommit(commit);
      return;
    }
    setCommitSelection({ hashes: [hash], anchor: hash });
    setState((current) => ({
      ...current,
      selectedHash: hash,
      details: undefined,
      detailsRepositoryId: undefined,
      selectedParent: undefined,
      files: [],
      selectedFile: undefined,
    }));
    const selectionRequestId = requestId(prefix);
    race.activeSelectionRequest = {
      requestId: selectionRequestId,
      repositoryId: state.selectedRepositoryId,
      hash,
    };
    send({
      type: 'selectCommit',
      requestId: selectionRequestId,
      repositoryId: state.selectedRepositoryId,
      hash,
    });
  };

  const selectRef = (ref: RefLabel): void => {
    const commit = state.commits.find((candidate) => candidate.hash === ref.target);
    const branchFilter = ref.fullName === 'HEAD' ? [] : [ref.fullName];
    if (
      (ref.fullName === 'HEAD' || ref.kind === 'local' || ref.kind === 'remote') &&
      (state.filters.branches.length !== branchFilter.length ||
        state.filters.branches.some((branch, index) => branch !== branchFilter[index]))
    ) {
      applyFilters({ ...state.filters, branches: branchFilter });
    }
    selectHash(ref.target, 'ref');
    if (commit) document.querySelector<HTMLElement>(`[data-commit-hash="${commit.hash}"]`)?.focus();
  };

  const toggleRefGroup = (group: string): void => {
    setCollapsedRefGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const toggleRefFolder = (folder: string): void => {
    setCollapsedRefFolders((current) => {
      const next = new Set(current);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const handleRefKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    ref: RefLabel,
  ): void => {
    const items = [...document.querySelectorAll<HTMLButtonElement>('[data-ref-item="true"]')];
    const index = items.indexOf(event.currentTarget);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      items[Math.min(items.length - 1, Math.max(0, index + direction))]?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectRef(ref);
    }
  };

  const openCommitComparison = (
    hash: string,
    mode: 'parent' | 'current',
    parent?: string,
  ): void => {
    if (!state.selectedRepositoryId) return;
    send({
      type: 'openCommitComparison',
      requestId: requestId('compare'),
      repositoryId: state.selectedRepositoryId,
      hash,
      mode,
      ...(parent ? { parent } : {}),
    });
    setContextMenu(undefined);
  };

  const goToHead = (): void => {
    if (!state.selectedRepositoryId || !selectedRepository?.head) return;
    const repositoryId = state.selectedRepositoryId;
    const head = selectedRepository.head;
    commitRevealSequence.current += 1;
    setCommitRevealTarget({
      repositoryId,
      hash: head,
      requestId: commitRevealSequence.current,
      minimumListRevision:
        state.commitListRevision +
        (race.pendingFilters?.repositoryId === repositoryId ? 1 : 0),
    });
    selectHash(head, 'head');
  };

  const loadMore = (): void => {
    if (state.history) {
      if (!state.history.hasMore) return;
      send({
        type: 'requestHistoryPage',
        requestId: requestId('history-page'),
        repositoryId: state.history.repositoryId,
        skip: state.history.entries.length,
      });
      return;
    }
    if (!state.selectedRepositoryId || !state.hasMore || state.loading === 'log') return;
    send({
      type: 'requestLogPage',
      requestId: requestId('page'),
      repositoryId: state.selectedRepositoryId,
      skip: state.nextLogOffset,
    });
  };

  const updateFilesViewMode = (filesViewMode: WorkbenchLayout['filesViewMode']): void => {
    const layout = { ...state.layout, filesViewMode };
    setState((current) => ({ ...current, layout }));
    send({ type: 'updateLayout', requestId: requestId('layout'), layout });
  };

  const persistLayout = (layout: WorkbenchLayout): void => {
    setState((current) => ({ ...current, layout }));
    send({ type: 'updateLayout', requestId: requestId('layout'), layout });
  };

  const toggleDetailsPlacement = (): void => {
    const nextPlacement = detailsInChanges ? 'bottom' : 'changes';
    if (nextPlacement === 'changes' && responsiveCollapse.files) {
      setResponsiveExpanded((current) => ({ ...current, files: true }));
    }
    persistLayout({
      ...state.layout,
      detailsPlacement: nextPlacement,
      ...(nextPlacement === 'changes' ? { filesCollapsed: false } : {}),
    });
  };

  const toggleResponsivePane = (pane: 'refs' | 'files'): void => {
    const layoutKey = pane === 'refs' ? 'refsCollapsed' : 'filesCollapsed';
    const responsive = responsiveCollapse[pane];
    const expanded = responsiveExpanded[pane];
    if (state.layout[layoutKey]) {
      persistLayout({ ...state.layout, [layoutKey]: false });
      return;
    }
    if (responsive) {
      setResponsiveExpanded((current) => ({ ...current, [pane]: !expanded }));
      return;
    }
    persistLayout({ ...state.layout, [layoutKey]: true });
  };

  const resizeLayout = (
    key: 'refsWidth' | 'filesWidth' | 'detailsHeight',
    delta: number,
  ): void => {
    const min = key === 'refsWidth' ? 160 : key === 'filesWidth' ? 220 : 100;
    const max =
      key === 'detailsHeight'
        ? Math.max(min, window.innerHeight - 180)
        : Math.max(min, window.innerWidth - (key === 'refsWidth' ? 560 : 520));
    persistLayout({
      ...state.layout,
      [key]: Math.min(max, Math.max(min, state.layout[key] + delta)),
    });
  };

  const beginResize = (
    key: 'refsWidth' | 'filesWidth' | 'detailsHeight',
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    event.preventDefault();
    const start = key === 'detailsHeight' ? event.clientY : event.clientX;
    const initialLayout = state.layout;
    let nextLayout = initialLayout;
    const move = (pointerEvent: PointerEvent): void => {
      const current = key === 'detailsHeight' ? pointerEvent.clientY : pointerEvent.clientX;
      const rawDelta = current - start;
      const delta = key === 'filesWidth' || key === 'detailsHeight' ? -rawDelta : rawDelta;
      const min = key === 'refsWidth' ? 160 : key === 'filesWidth' ? 220 : 100;
      const max =
        key === 'detailsHeight'
          ? Math.max(min, window.innerHeight - 180)
          : Math.max(min, window.innerWidth - (key === 'refsWidth' ? 560 : 520));
      nextLayout = {
        ...initialLayout,
        [key]: Math.min(max, Math.max(min, initialLayout[key] + delta)),
      };
      setState((currentState) => ({ ...currentState, layout: nextLayout }));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      send({ type: 'updateLayout', requestId: requestId('layout'), layout: nextLayout });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const resizeColumn = (
    key: 'commitColumnWidth' | 'refsColumnWidth' | 'authorColumnWidth' | 'dateColumnWidth',
    delta: number,
    measuredWidth?: number,
  ): void => {
    const fallback =
      key === 'commitColumnWidth'
        ? measuredWidth && measuredWidth >= 160
          ? measuredWidth
          : 360
        : key === 'refsColumnWidth'
          ? 150
          : key === 'authorColumnWidth'
            ? 130
            : 125;
    const min = key === 'commitColumnWidth' ? 160 : key === 'dateColumnWidth' ? 90 : 100;
    const max = key === 'commitColumnWidth' ? 2000 : 320;
    persistLayout({
      ...state.layout,
      [key]: Math.min(max, Math.max(min, (state.layout[key] ?? fallback) + delta)),
    });
  };

  const beginColumnResize = (
    key: 'commitColumnWidth' | 'refsColumnWidth' | 'authorColumnWidth' | 'dateColumnWidth',
    event: ReactPointerEvent<HTMLDivElement>,
    measuredWidth?: number,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    const start = event.clientX;
    const fallback =
      key === 'commitColumnWidth'
        ? measuredWidth && measuredWidth >= 160
          ? measuredWidth
          : 360
        : key === 'refsColumnWidth'
          ? 150
          : key === 'authorColumnWidth'
            ? 130
            : 125;
    const initial = state.layout[key] ?? fallback;
    const min = key === 'commitColumnWidth' ? 160 : key === 'dateColumnWidth' ? 90 : 100;
    const max = key === 'commitColumnWidth' ? 2000 : 320;
    let nextLayout = state.layout;
    const move = (pointerEvent: PointerEvent): void => {
      nextLayout = {
        ...state.layout,
        [key]: Math.min(max, Math.max(min, initial + pointerEvent.clientX - start)),
      };
      setState((current) => ({ ...current, layout: nextLayout }));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      send({ type: 'updateLayout', requestId: requestId('layout'), layout: nextLayout });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const openDiff = (file: ChangedFile): void => {
    if (
      !state.detailsRepositoryId ||
      state.detailsRepositoryId !== state.selectedRepositoryId ||
      !state.details
    ) {
      return;
    }
    if (file.binary) {
      setState((current) => ({
        ...current,
        error: `Binary diff is not available for ${file.path}.`,
        errorRecovery: undefined,
      }));
      return;
    }
    const parent = file.parentHash ?? state.selectedParent;
    send({
      type: 'openDiff',
      requestId: requestId('diff'),
      repositoryId: state.detailsRepositoryId,
      hash: file.commitHash ?? state.details.hash,
      ...(parent ? { parent } : {}),
      path: file.path,
      ...(file.oldPath ? { oldPath: file.oldPath } : {}),
      status: file.status,
    });
  };

  const openFile = (file: ChangedFile, mode: 'revision' | 'current'): void => {
    if (
      !state.detailsRepositoryId ||
      state.detailsRepositoryId !== state.selectedRepositoryId ||
      !state.details
    ) {
      return;
    }
    const parent = file.parentHash ?? state.selectedParent;
    send({
      type: 'openFile',
      requestId: requestId(`open-file-${mode}`),
      repositoryId: state.detailsRepositoryId,
      hash: file.commitHash ?? state.details.hash,
      ...(parent ? { parent } : {}),
      path: file.path,
      ...(file.oldPath ? { oldPath: file.oldPath } : {}),
      status: file.status,
      mode,
    });
    setContextMenu(undefined);
  };

  const runOperation = (operation: GitOperationRequest, repositoryId = state.selectedRepositoryId): void => {
    if (!repositoryId) return;
    const isAbort = operation.kind === 'abortCherryPick' || operation.kind === 'abortRevert';
    if (!isAbort && race.activeOperationByRepository.has(repositoryId)) return;
    const operationRequestId = requestId('operation');
    const validatedMessage = parseWebviewMessage({
      type: 'runOperation',
      requestId: operationRequestId,
      repositoryId,
      operation,
    });
    if (!validatedMessage || validatedMessage.type !== 'runOperation') {
      setState((current) => ({
        ...current,
        error: 'Invalid Git operation parameters.',
        errorRecovery: undefined,
      }));
      return;
    }
    race.activeOperationByRepository.set(repositoryId, operationRequestId);
    setState((current) => ({
      ...current,
      operationRepositoryIds: new Set(current.operationRepositoryIds).add(repositoryId),
      error: undefined,
      errorRecovery: undefined,
    }));
    send(validatedMessage);
    setContextMenu(undefined);
  };

  const submitNamedOperation = (): void => {
    if (!namedOperation?.value.trim()) return;
    const value = namedOperation.value.trim();
    if (namedOperation.kind === 'createBranch') {
      runOperation(
        { kind: 'createBranch', name: value, startPoint: namedOperation.target },
        namedOperation.repositoryId,
      );
    } else if (namedOperation.kind === 'createTag') {
      runOperation(
        { kind: 'createTag', name: value, target: namedOperation.target },
        namedOperation.repositoryId,
      );
    } else if (namedOperation.kind === 'renameBranch') {
      runOperation(
        { kind: 'renameBranch', oldName: namedOperation.oldName, newName: value },
        namedOperation.repositoryId,
      );
    } else {
      runOperation(
        { kind: 'checkoutRemote', name: value, startPoint: namedOperation.startPoint },
        namedOperation.repositoryId,
      );
    }
    setNamedOperation(undefined);
  };

  const logContentWidth =
    (state.layout.commitColumnWidth ?? 260) +
    (state.layout.authorColumnWidth ?? 130) +
    (state.layout.dateColumnWidth ?? 125) +
    (state.layout.refsColumnWidth ?? 150);

  const handleWorkbenchKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      searchRef.current?.focus();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      logRef.current?.focus();
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'c' &&
      state.selectedHash &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLTextAreaElement) &&
      !(event.target instanceof HTMLSelectElement)
    ) {
      event.preventDefault();
      send({
        type: 'copyToClipboard',
        requestId: requestId('copy-hash'),
        text: state.selectedHash,
      });
    } else if (event.key === 'Escape') {
      setContextMenu(undefined);
      setNamedOperation(undefined);
      setFilterPopup(undefined);
      setHistoryParentPicker(undefined);
    }
  };

  const openStashDialog = (): void => {
    const repositoryId = state.selectedRepositoryId;
    if (!repositoryId) return;
    setStashDialog({
      repositoryId,
      stashes: [],
      loading: true,
      stashMessage: '',
      includeUntracked: false,
    });
    stashDialogRepository.current = repositoryId;
    send({ type: 'requestStashState', requestId: requestId('stash-state'), repositoryId });
  };
  const commitToolbar = (
    <CommitToolbar
      history={
        state.history
          ? {
              kind: state.history.kind,
              path: state.history.path,
              ...(state.history.startLine !== undefined
                ? { startLine: state.history.startLine }
                : {}),
              ...(state.history.endLine !== undefined ? { endLine: state.history.endLine } : {}),
              ...(state.history.notice !== undefined ? { notice: state.history.notice } : {}),
              entryCount: state.history.entries.length,
            }
          : undefined
      }
      folderHistory={
        state.folderHistory ? { path: state.folderHistory.path } : undefined
      }
      repositories={state.repositories}
      selectedRepositoryId={state.selectedRepositoryId}
      selectedRepositoryOperationState={selectedRepository?.operationState}
      refs={state.refs}
      filters={state.filters}
      filterPopup={filterPopup}
      filterPopoverPosition={filterPopoverPosition}
      authorFilterOptions={authorFilterOptions}
      customDateFrom={customDateFrom}
      customDateTo={customDateTo}
      searchRef={searchRef}
      onSelectRepository={selectRepository}
      onApplyFilters={applyFilters}
      onApplyDateRange={applyDateRange}
      onFilterPopupChange={(popup, anchor) => {
        setContextMenu(undefined);
        setFilterPopup(popup === undefined ? undefined : popup);
        setFilterPopupAnchor(anchor);
        if (popup === undefined) setFilterPopoverPosition(undefined);
      }}
      onCustomDateFromChange={setCustomDateFrom}
      onCustomDateToChange={setCustomDateTo}
      onFocusLog={() => logRef.current?.focus()}
      onSwitchHistoryToFile={() =>
        send({
          type: 'switchHistoryToFile',
          requestId: requestId('history-file'),
          repositoryId: state.history?.repositoryId ?? '',
        })
      }
      onBackToLog={() =>
        send({
          type: 'closeHistory',
          requestId: requestId('history-back'),
          repositoryId: state.history?.repositoryId ?? '',
        })
      }
      onCloseHistory={() =>
        send({
          type: 'closeHistory',
          requestId: requestId('history-close'),
          repositoryId: state.history?.repositoryId ?? '',
        })
      }
      onCloseFolderHistory={() =>
        send({
          type: 'closeFolderHistory',
          requestId: requestId('folder-history-back'),
          repositoryId: state.folderHistory?.repositoryId ?? '',
        })
      }
      onResetFilters={() => applyFilters(defaultFilters)}
    />
  );

  const globalToolbar = (
    <GlobalToolbar
      hasHead={Boolean(selectedRepository?.head)}
      canRunOperations={Boolean(state.selectedRepositoryId) && !selectedRepository?.isBare}
      operationInFlight={selectedOperationInFlight}
      refsCollapsed={refsCollapsed}
      filesCollapsed={filesCollapsed}
      moreActionsExpanded={contextMenu?.kind === 'toolbar'}
      onRefresh={() =>
        send({
          type: 'refresh',
          requestId: requestId('refresh'),
          ...(state.selectedRepositoryId ? { repositoryId: state.selectedRepositoryId } : {}),
        })
      }
      onGoToHead={goToHead}
      onFetch={() => runOperation({ kind: 'fetch' })}
      onManageStashes={openStashDialog}
      onToggleRefsPane={() => toggleResponsivePane('refs')}
      onToggleFilesPane={() => toggleResponsivePane('files')}
      onToggleMoreActions={(anchor) => {
        if (!state.selectedRepositoryId) return;
        setFilterPopup(undefined);
        setContextMenu((current) =>
          current?.kind === 'toolbar'
            ? undefined
            : {
                kind: 'toolbar',
                repositoryId: state.selectedRepositoryId as string,
                x: anchor.right,
                y: anchor.bottom,
              },
        );
      }}
    />
  );

  const copyDetailsHash = (): void => {
    const copyRequestId = requestId('copy-hash');
    detailsHashCopyRequest.current = copyRequestId;
    if (detailsHashCopyTimer.current !== undefined) {
      window.clearTimeout(detailsHashCopyTimer.current);
      detailsHashCopyTimer.current = undefined;
    }
    setDetailsHashCopyState('copying');
    send({ type: 'copyToClipboard', requestId: copyRequestId, text: state.details?.hash ?? '' });
  };
  const selectParent = (parent: string, hash: string): void => {
    setState((current) => ({ ...current, selectedParent: parent }));
    if (!state.detailsRepositoryId) return;
    const parentRequestId = requestId('parent');
    race.activeSelectionRequest = {
      requestId: parentRequestId,
      repositoryId: state.detailsRepositoryId,
      hash,
    };
    send({
      type: 'selectParent',
      requestId: parentRequestId,
      repositoryId: state.detailsRepositoryId,
      hash,
      parent,
    });
  };
  const commitDetailsPane = (
    <DetailsPane
      details={state.details}
      detailsInChanges={detailsInChanges}
      detailsHeight={state.layout.detailsHeight}
      detailsRepositoryId={state.detailsRepositoryId}
      onCopyHash={copyDetailsHash}
      detailsHashCopyState={detailsHashCopyState}
      onTogglePlacement={toggleDetailsPlacement}
      onSelectHash={selectHash}
      onResizeStart={(event) => beginResize('detailsHeight', event)}
      onResizeKeyDown={(delta) => resizeLayout('detailsHeight', delta)}
      runOperation={runOperation}
      selectedRepository={selectedRepository}
      selectedOperationInFlight={selectedOperationInFlight}
    />
  );

  return (
    <main
      className={`workbench-shell${filesCollapsed ? ' files-collapsed' : ''}${
        detailsInChanges ? ' details-in-changes' : ''
      }`}
      style={{
        gridTemplateRows: detailsInChanges
          ? 'minmax(0, 1fr)'
          : `minmax(0, 1fr) 4px ${state.layout.detailsHeight}px`,
      }}
      onKeyDown={handleWorkbenchKeyDown}
      onWheelCapture={(event) => {
        const target = event.target;
        if (
          !contextMenu ||
          (target instanceof Element && target.closest('.context-menu'))
        ) {
          return;
        }
        setContextMenu(undefined);
      }}
      onScrollCapture={(event) => {
        const target = event.target;
        if (
          !contextMenu ||
          (target instanceof Element && target.closest('.context-menu'))
        ) {
          return;
        }
        setContextMenu(undefined);
      }}
    >
      {globalToolbar}
      {state.error ? (
        <div className="error-banner" role="alert">
          <span>{state.error}</span>
          <span className="error-actions">
            {state.errorRecovery?.action.kind === 'forceDeleteBranch' ? (
              <button
                type="button"
                className="warning-action"
                aria-label={`Force delete branch ${state.errorRecovery.action.branch}`}
                title="Delete this branch even though it contains unmerged commits"
                onClick={() =>
                  runOperation(
                    {
                      kind: 'deleteBranch',
                      name: state.errorRecovery?.action.branch ?? '',
                      force: true,
                    },
                    state.errorRecovery?.repositoryId,
                  )
                }
              >
                Force Delete
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Retry Git query"
              onClick={() =>
                send({
                  type: 'refresh',
                  requestId: requestId('retry'),
                  ...(state.selectedRepositoryId ? { repositoryId: state.selectedRepositoryId } : {}),
                })
              }
            >
              Retry
            </button>
            <button
              type="button"
              aria-label="Show Git output"
              onClick={() => send({ type: 'showOutput', requestId: requestId('output') })}
            >
              Show Output
            </button>
            <button
              type="button"
              aria-label="Copy diagnostic"
              onClick={() =>
                send({ type: 'copyToClipboard', requestId: requestId('diagnostic'), text: state.error ?? '' })
              }
            >
              Copy
            </button>
          </span>
        </div>
      ) : null}

      <section
        className="workspace-grid"
        style={{
          gridTemplateColumns: `${refsCollapsed ? 0 : state.layout.refsWidth}px ${
            refsCollapsed ? 0 : 1
          }px minmax(340px, 1fr) ${filesCollapsed ? 0 : 1}px ${
            filesCollapsed ? 0 : state.layout.filesWidth
          }px`,
        }}
      >
        <RefsPane
          refs={state.refs}
          selectedRepository={selectedRepository}
          selectedRepositoryId={state.selectedRepositoryId}
          refSearch={refSearch}
          onRefSearchChange={setRefSearch}
          refSearchActive={refSearchActive}
          collapsedRefGroups={collapsedRefGroups}
          onToggleRefGroup={toggleRefGroup}
          collapsedRefFolders={collapsedRefFolders}
          onToggleRefFolder={toggleRefFolder}
          onSelectRef={selectRef}
          onRefKeyDown={handleRefKeyDown}
          onOpenHeadContextMenu={(x, y) => {
            if (!state.selectedRepositoryId || !selectedRepository?.head) return;
            setContextMenu({
              kind: 'head',
              repositoryId: state.selectedRepositoryId,
              hash: selectedRepository.head,
              x,
              y,
            });
          }}
          onOpenRefContextMenu={(ref, x, y) => {
            if (!state.selectedRepositoryId) return;
            setContextMenu({
              kind: 'ref',
              repositoryId: state.selectedRepositoryId,
              ref,
              x,
              y,
            });
          }}
          hidden={refsCollapsed}
          refsWidth={state.layout.refsWidth}
          onResizeStart={(event) => beginResize('refsWidth', event)}
          onResizeKeyDown={(delta) => resizeLayout('refsWidth', delta)}
        />

        <section
          ref={logRef}
          className="log-pane pane"
          role="grid"
          aria-label="Commit log"
          tabIndex={0}
          style={
            {
              '--refs-column-width': `${String(state.layout.refsColumnWidth ?? 150)}px`,
              '--author-column-width': `${String(state.layout.authorColumnWidth ?? 130)}px`,
              '--date-column-width': `${String(state.layout.dateColumnWidth ?? 150)}px`,
              '--log-content-width': `${String(logContentWidth)}px`,
              '--commit-max-width': '700px',
              userSelect: 'none',
              '--log-grid-columns': `${
                state.layout.commitColumnWidth
                  ? `${String(state.layout.commitColumnWidth)}px`
                  : 'minmax(260px, min(1fr, var(--commit-max-width, 700px)))'
              } ${
                state.layout.authorColumnWidth
                  ? `${String(state.layout.authorColumnWidth)}px`
                  : 'max-content'
              } ${
                state.layout.dateColumnWidth
                  ? `${String(state.layout.dateColumnWidth)}px`
                  : 'max-content'
              } ${
                state.layout.refsColumnWidth
                  ? `${String(state.layout.refsColumnWidth)}px`
                  : 'max-content'
              }`,
            } as CSSProperties
          }
        >
          {commitToolbar}
          <div className="log-header-viewport">
            <div className="log-header" role="row" ref={logHeaderRef}>
              <span className="column-header" role="columnheader">
                Commit
                <div
                  className="column-resizer"
                  role="separator"
                  aria-label="Resize commit column"
                  aria-orientation="vertical"
                  aria-valuemin={160}
                  aria-valuenow={state.layout.commitColumnWidth}
                  aria-valuetext={
                    state.layout.commitColumnWidth === undefined ? 'Auto width' : undefined
                  }
                  tabIndex={0}
                  onPointerDown={(event) =>
                    beginColumnResize(
                      'commitColumnWidth',
                      event,
                      event.currentTarget.parentElement?.getBoundingClientRect().width,
                    )
                  }
                  onKeyDown={(event) => {
                    const measuredWidth =
                      event.currentTarget.parentElement?.getBoundingClientRect().width;
                    if (event.key === 'ArrowLeft') {
                      resizeColumn('commitColumnWidth', -10, measuredWidth);
                    }
                    if (event.key === 'ArrowRight') {
                      resizeColumn('commitColumnWidth', 10, measuredWidth);
                    }
                  }}
                />
              </span>
              <span className="column-header" role="columnheader">
                Author
                <div
                  className="column-resizer"
                  role="separator"
                  aria-label="Resize author column"
                  aria-orientation="vertical"
                  aria-valuenow={state.layout.authorColumnWidth ?? 130}
                  tabIndex={0}
                  onPointerDown={(event) => beginColumnResize('authorColumnWidth', event)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft') resizeColumn('authorColumnWidth', -10);
                    if (event.key === 'ArrowRight') resizeColumn('authorColumnWidth', 10);
                  }}
                />
              </span>
              <span className="column-header" role="columnheader">
                Date
                <div
                  className="column-resizer"
                  role="separator"
                  aria-label="Resize date column"
                  aria-orientation="vertical"
                  aria-valuenow={state.layout.dateColumnWidth ?? 125}
                  tabIndex={0}
                  onPointerDown={(event) => beginColumnResize('dateColumnWidth', event)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft') resizeColumn('dateColumnWidth', -10);
                    if (event.key === 'ArrowRight') resizeColumn('dateColumnWidth', 10);
                  }}
                />
              </span>
              <span className="column-header" role="columnheader">
                Refs
                <div
                  className="column-resizer"
                  role="separator"
                  aria-label="Resize refs column"
                  aria-orientation="vertical"
                  aria-valuenow={state.layout.refsColumnWidth ?? 150}
                  tabIndex={0}
                  onPointerDown={(event) => beginColumnResize('refsColumnWidth', event)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft') resizeColumn('refsColumnWidth', -10);
                    if (event.key === 'ArrowRight') resizeColumn('refsColumnWidth', 10);
                  }}
                />
              </span>
            </div>
          </div>
          {(state.history?.entries ?? state.commits).length ? (
            <CommitList
              horizontalScrollResetKey={
                state.history
                  ? `history:${state.history.repositoryId}:${state.history.path}`
                  : `log:${state.selectedRepositoryId ?? ''}`
              }
              commits={state.history?.entries ?? state.commits}
              graphLayout={state.graphLayout.result}
              selectedHashes={selectedCommitHashSet}
              headHash={selectedRepository?.head}
              hasMore={state.history?.hasMore ?? state.hasMore}
              loading={state.loading === 'log'}
              initialScrollTop={
                state.history
                  ? 0
                  : state.selectedRepositoryId
                  ? (scrollTopByRepository[state.selectedRepositoryId] ?? 0)
                  : 0
              }
              scrollAnchorKey={
                state.history
                  ? `history:${state.history.repositoryId}:${state.history.path}`
                  : `log:${state.selectedRepositoryId ?? ''}:${String(state.startLogOffset)}`
              }
              {...(visibleCommitRevealTarget
                ? {
                    revealTarget: {
                      ...visibleCommitRevealTarget,
                      listRevision: state.commitListRevision,
                    },
                  }
                : {})}
              onScrollTopChange={handleCommitScrollTopChange}
              onHorizontalScroll={syncLogHeaderScroll}
              onSelect={selectCommit}
              onContextMenu={(commit, x, y) => {
                if (state.history) return;
                if (!state.selectedRepositoryId) return;
                const commits = selectedCommitHashSet.has(commit.hash)
                  ? state.commits.filter((candidate) => selectedCommitHashSet.has(candidate.hash))
                  : [commit];
                if (!selectedCommitHashSet.has(commit.hash)) selectCommit(commit);
                setContextMenu({
                  kind: 'commit',
                  repositoryId: state.selectedRepositoryId,
                  commit,
                  commits,
                  x,
                  y,
                });
              }}
              onLoadMore={loadMore}
            />
          ) : state.loading === 'repositories' || state.loading === 'log' ? (
            <div className="skeleton-list" role="status" aria-label="Loading Git history">
              {Array.from({ length: 10 }, (_, index) => (
                <div className="commit-skeleton-row" data-testid="commit-skeleton-row" key={index}>
                  <span className="skeleton-graph" />
                  <span className="skeleton-subject" />
                  <span className="skeleton-author" />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-log" role="row">
              <div>
                <strong>
                  {state.history
                    ? state.history.notice ?? 'No history found'
                    : state.repositories.length
                      ? 'No commits found'
                      : 'No repository selected'}
                </strong>
                <span>
                  {state.history
                    ? 'Try another line, selection, or file.'
                    : state.repositories.length
                      ? 'This repository has no commits or the current filters returned no results.'
                      : 'Open a workspace containing a Git repository.'}
                </span>
              </div>
            </div>
          )}
        </section>

        <FilesPane
          files={state.files}
          details={state.details}
          filesViewMode={state.layout.filesViewMode}
          loading={state.loading}
          filesWidth={state.layout.filesWidth}
          hidden={filesCollapsed}
          detailsInChanges={detailsInChanges}
          detailsHeight={state.layout.detailsHeight}
          selectedParent={state.selectedParent}
          {...(detailsInChanges ? { detailsContent: commitDetailsPane } : {})}
          {...(state.selectedFile ? { selectedFile: state.selectedFile } : {})}
          onSelectParent={selectParent}
          onUpdateFilesViewMode={updateFilesViewMode}
          onResizeStart={(event) => beginResize('filesWidth', event)}
          onResizeKeyDown={(delta) => resizeLayout('filesWidth', delta)}
          onOpenDiff={openDiff}
          onSelectFile={(file) => setState((current) => ({ ...current, selectedFile: file }))}
          onFileContextMenu={(file, x, y) => {
            if (!state.detailsRepositoryId) return;
            setContextMenu({
              kind: 'file',
              repositoryId: state.detailsRepositoryId,
              file,
              x,
              y,
            });
          }}
        />
      </section>

      {selectedOperationInFlight ? (
        <div className="operation-status" role="status" aria-live="polite">
          Running Git operation…
        </div>
      ) : null}

      {!detailsInChanges ? commitDetailsPane : null}

      {contextMenu ? (
        <ContextMenu
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          menuRef={contextMenuRef}
          measuredContextMenuPosition={measuredContextMenuPosition}
          selectedRepository={selectedRepository}
          hasContiguousCommitRange={hasContiguousCommitRange}
          selectedOperationInFlight={selectedOperationInFlight}
          detailsHash={state.details?.hash}
          detailsBody={state.details?.body}
          selectedParent={state.selectedParent}
          runOperation={runOperation}
          send={send}
          openCommitComparison={openCommitComparison}
          openDiff={openDiff}
          openFile={openFile}
setSquashOperation={setSquashOperation}
          setAmendDialog={setAmendDialog}
          setNamedOperation={setNamedOperation}
          setActiveCommitMessagesRequest={(value) => {
            race.activeCommitMessagesRequest = value;
          }}
        />
      ) : null}

      <Dialogs
        stashDialog={stashDialog}
        setStashDialog={setStashDialog}
        stashDialogRepositoryRef={stashDialogRepository}
        amendDialog={amendDialog}
        setAmendDialog={setAmendDialog}
        historyParentPicker={historyParentPicker}
        setHistoryParentPicker={setHistoryParentPicker}
        historyParentChoicesRef={historyParentChoices}
        squashOperation={squashOperation}
        setSquashOperation={setSquashOperation}
        setActiveCommitMessagesRequest={(value) => {
            race.activeCommitMessagesRequest = value;
          }}
        namedOperation={namedOperation}
        setNamedOperation={setNamedOperation}
        submitNamedOperation={submitNamedOperation}
        selectedRepository={selectedRepository}
        selectedOperationInFlight={selectedOperationInFlight}
        runOperation={runOperation}
        send={send}
      />
    </main>
  );
}
